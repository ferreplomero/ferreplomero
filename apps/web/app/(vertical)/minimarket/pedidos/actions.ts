"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { MmMetodoPago, MmPedidoPublicoEstado } from "@arkiteq/db";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { requirePermisoAccion } from "@/lib/minimarket/permisos";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { esMetodoConCuenta } from "@/lib/minimarket/bancos";
import { calcularExcedenteBs, computeCobro } from "@/lib/minimarket/pos-calc";
import { calcularPedidoPublico } from "@/lib/minimarket/pedidos/calculo";
import {
  cargarProductosParaPedido,
  configImpuestosDe,
  esSlugValido,
  METODOS_LOCAL,
  monedaMetodo,
} from "@/lib/minimarket/pedidos/publico";
import { registrarVenta, type PagoInput } from "../ventas/actions";

const RUTA = "/minimarket/pedidos";

export interface PedidoActionResult {
  ok?: boolean;
  error?: string;
  ventaId?: string;
  /** Productos que ya no alcanzan (stock) al validar. */
  faltantes?: string[];
}

async function contexto(accion: "crear" | "editar") {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId)
    return { error: "Sesión no válida. Vuelve a iniciar sesión." } as const;
  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "pedidos",
    accion,
  );
  if (permisoError) return { error: permisoError } as const;
  return { supabase, tenantId, userId: session.user.id } as const;
}

type Ctx = Exclude<Awaited<ReturnType<typeof contexto>>, { error: string }>;

async function leerPedido(ctx: Ctx, pedidoId: string) {
  const { data } = await ctx.supabase
    .from("mm_pedidos_publicos")
    .select(
      "id, sucursal_id, estado, venta_id, metodo_pago_elegido, cuenta_bancaria_id, forma_pago, total_usd, total_bs, tasa_usada",
    )
    .eq("tenant_id", ctx.tenantId)
    .eq("id", pedidoId)
    .maybeSingle();
  return data;
}

async function leerItems(ctx: Ctx, pedidoId: string) {
  const { data } = await ctx.supabase
    .from("mm_pedidos_publicos_items")
    .select("producto_id, producto_nombre, cantidad")
    .eq("tenant_id", ctx.tenantId)
    .eq("pedido_id", pedidoId);
  return data ?? [];
}

/**
 * Recalcula el pedido con precios, impuestos y stock REALES de la sucursal,
 * con el método de pago y la tasa dados. Devuelve los faltantes si algo ya
 * no alcanza (nada se registra en ese caso).
 */
async function recalcular(
  ctx: Ctx,
  pedido: { id: string; sucursal_id: string },
  metodo: MmMetodoPago,
  tasa: number,
) {
  const items = await leerItems(ctx, pedido.id);
  const sinProducto = items.filter((i) => !i.producto_id).map((i) => i.producto_nombre);
  if (sinProducto.length > 0) {
    return {
      ok: false as const,
      error: "Algunos productos del pedido ya no existen.",
      faltantes: sinProducto,
    };
  }
  const itemsInput = items.map((i) => ({
    producto_id: i.producto_id as string,
    cantidad: Number(i.cantidad),
  }));
  const [productos, configRes] = await Promise.all([
    cargarProductosParaPedido(
      ctx.supabase,
      ctx.tenantId,
      pedido.sucursal_id,
      itemsInput.map((i) => i.producto_id),
    ),
    ctx.supabase
      .from("mm_config_negocio")
      .select("parametros")
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle(),
  ]);
  const config = configImpuestosDe(configRes.data?.parametros);
  const r = calcularPedidoPublico({ items: itemsInput, productos, metodo, tasa, config });
  return { ...r, itemsInput, config };
}

/**
 * Reserva atómica del paso a `aceptado_validado` (solo si el pedido sigue en
 * el estado esperado y sin venta) — evita que dos pestañas/cajeros conviertan
 * el mismo pedido en dos ventas. Mismo patrón que
 * `reservarConversionPresupuesto`.
 */
async function reservar(ctx: Ctx, pedidoId: string, desde: MmPedidoPublicoEstado) {
  const { data } = await ctx.supabase
    .from("mm_pedidos_publicos")
    .update({ estado: "aceptado_validado", usuario_valido_id: ctx.userId })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", pedidoId)
    .eq("estado", desde)
    .is("venta_id", null)
    .select("id")
    .maybeSingle();
  return Boolean(data);
}

async function liberar(ctx: Ctx, pedidoId: string, volverA: MmPedidoPublicoEstado) {
  await ctx.supabase
    .from("mm_pedidos_publicos")
    .update({ estado: volverA, usuario_valido_id: null })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", pedidoId)
    .eq("estado", "aceptado_validado")
    .is("venta_id", null);
}

async function enlazarVenta(ctx: Ctx, pedidoId: string, ventaId: string) {
  await ctx.supabase
    .from("mm_pedidos_publicos")
    .update({ venta_id: ventaId })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", pedidoId);
}

function revalidar(pedidoId: string) {
  revalidatePath(RUTA);
  revalidatePath(`${RUTA}/${pedidoId}`);
  revalidatePath("/minimarket/ventas");
}

const idSchema = z.string().uuid();

/**
 * Pedido pagado en línea: el comerciante ya verificó el comprobante. Se
 * registra la venta con `registrarVenta` (sin modificarla), con el método y la
 * cuenta del pedido y la MISMA tasa con la que el cliente pagó. Si los
 * precios o impuestos cambiaron desde el pedido, el total ya no coincide con
 * lo pagado y no se registra nada.
 */
export async function verificarPagoYRegistrar(pedidoIdRaw: string): Promise<PedidoActionResult> {
  const pedidoId = idSchema.safeParse(pedidoIdRaw);
  if (!pedidoId.success) return { error: "Pedido inválido." };
  const ctx = await contexto("editar");
  if ("error" in ctx) return { error: ctx.error };

  const pedido = await leerPedido(ctx, pedidoId.data);
  if (!pedido) return { error: "Pedido no encontrado." };
  if (pedido.estado !== "pago_reportado" || pedido.venta_id) {
    return { error: "Este pedido ya no está pendiente de verificación. Actualiza la página." };
  }
  const metodo = pedido.metodo_pago_elegido as MmMetodoPago;
  const tasa = Number(pedido.tasa_usada);

  const r = await recalcular(ctx, pedido, metodo, tasa);
  if (!r.ok) return { error: r.error, faltantes: r.faltantes };
  if (Math.abs(r.totalUsd - Number(pedido.total_usd)) > 0.005) {
    return {
      error: `Los precios o impuestos cambiaron desde que se hizo el pedido: hoy el total sería ${r.totalUsd.toFixed(2)} USD y el cliente pagó ${Number(pedido.total_usd).toFixed(2)} USD. Registra la venta desde el POS ajustando la diferencia, o rechaza el pedido.`,
    };
  }

  const moneda = monedaMetodo(metodo);
  const pago: PagoInput = {
    metodo,
    monto: moneda === "USD" ? Number(pedido.total_usd) : Number(pedido.total_bs),
    moneda,
    cuenta_bancaria_id: esMetodoConCuenta(metodo) ? pedido.cuenta_bancaria_id : null,
  };

  if (!(await reservar(ctx, pedido.id, "pago_reportado"))) {
    return { error: "Este pedido ya fue procesado en otra sesión. Actualiza la página." };
  }
  const venta = await registrarVenta({
    items: r.itemsInput,
    pagos: [pago],
    sucursal_id: pedido.sucursal_id,
    cliente_id: null,
    tasa_override: tasa,
  });
  if (venta.error || !venta.ventaId) {
    await liberar(ctx, pedido.id, "pago_reportado");
    return { error: venta.error ?? "No se pudo registrar la venta." };
  }
  await enlazarVenta(ctx, pedido.id, venta.ventaId);
  revalidar(pedido.id);
  return { ok: true, ventaId: venta.ventaId };
}

/** Pagar en el local: el negocio confirma que tiene todo (no toca stock ni dinero). */
export async function confirmarDisponibilidad(pedidoIdRaw: string): Promise<PedidoActionResult> {
  const pedidoId = idSchema.safeParse(pedidoIdRaw);
  if (!pedidoId.success) return { error: "Pedido inválido." };
  const ctx = await contexto("editar");
  if ("error" in ctx) return { error: ctx.error };

  const pedido = await leerPedido(ctx, pedidoId.data);
  if (!pedido) return { error: "Pedido no encontrado." };
  if (pedido.estado !== "pendiente") {
    return { error: "Este pedido ya no está pendiente. Actualiza la página." };
  }
  const tasa = await getTasaVigente(ctx.supabase, ctx.tenantId);
  const r = await recalcular(
    ctx,
    pedido,
    pedido.metodo_pago_elegido as MmMetodoPago,
    tasa?.valor ?? 0,
  );
  if (!r.ok) return { error: r.error, faltantes: r.faltantes };

  const { data } = await ctx.supabase
    .from("mm_pedidos_publicos")
    .update({ estado: "para_pagar_local", usuario_valido_id: ctx.userId })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", pedido.id)
    .eq("estado", "pendiente")
    .select("id")
    .maybeSingle();
  if (!data) return { error: "No se pudo confirmar el pedido. Actualiza la página." };
  revalidar(pedido.id);
  return { ok: true };
}

export interface CotizacionCobro {
  ok?: boolean;
  error?: string;
  faltantes?: string[];
  subtotalUsd?: number;
  ivaUsd?: number;
  igtfUsd?: number;
  totalUsd?: number;
  totalBs?: number;
  tasa?: number;
  /** Monto exacto a cobrar en la moneda del método. */
  montoMetodo?: number;
  moneda?: "USD" | "VES";
  /** Bases para que el diálogo reproduzca el cobro con `computeCobro` (igual que el POS). */
  subtotalGravado?: number;
  subtotalSujetoIgtf?: number;
  igtfActivo?: boolean;
  ivaActivo?: boolean;
  ivaPct?: number;
  cantidadLineas?: number;
}

const metodoLocalSchema = z.enum(METODOS_LOCAL);

/** Total del cobro en el local, recalculado con tasa y precios VIGENTES y el método real. */
export async function cotizarCobroLocal(
  pedidoIdRaw: string,
  metodoRaw: string,
): Promise<CotizacionCobro> {
  const pedidoId = idSchema.safeParse(pedidoIdRaw);
  const metodo = metodoLocalSchema.safeParse(metodoRaw);
  if (!pedidoId.success || !metodo.success) return { error: "Datos inválidos." };
  const ctx = await contexto("editar");
  if ("error" in ctx) return { error: ctx.error };
  const pedido = await leerPedido(ctx, pedidoId.data);
  if (!pedido) return { error: "Pedido no encontrado." };
  const tasa = await getTasaVigente(ctx.supabase, ctx.tenantId);
  if (!tasa) return { error: "Define la tasa del día antes de cobrar." };
  const r = await recalcular(ctx, pedido, metodo.data, tasa.valor);
  if (!r.ok) return { error: r.error, faltantes: r.faltantes };
  return {
    ok: true,
    subtotalUsd: r.subtotalUsd,
    ivaUsd: r.ivaUsd,
    igtfUsd: r.igtfUsd,
    totalUsd: r.totalUsd,
    totalBs: r.totalBs,
    tasa: r.tasa,
    montoMetodo: r.montoMetodo ?? undefined,
    moneda: monedaMetodo(metodo.data),
    subtotalGravado: r.subtotalGravado,
    subtotalSujetoIgtf: r.subtotalSujetoIgtf,
    ...r.config,
    cantidadLineas: r.lineas.length,
  };
}

const cobroSchema = z.object({
  pedidoId: z.string().uuid(),
  metodo: metodoLocalSchema,
  cuentaBancariaId: z.string().uuid().nullable(),
  /** Monto recibido en la moneda del método (solo efectivo puede exceder el total). */
  montoRecibido: z.coerce.number().positive("Indica el monto recibido."),
  vueltoMoneda: z.enum(["USD", "VES"]),
});

/**
 * Cobra un pedido "pagar en el local" con el método REAL (puede diferir del
 * que indicó el cliente). Todo se pasa a `registrarVenta` igual que el POS:
 * efectivo a la caja de su moneda con su vuelto como egreso, pagos digitales
 * a su cuenta. El vuelto se calcula con las mismas funciones del diálogo de
 * cobro del POS (`computeCobro` / `calcularExcedenteBs`).
 */
export async function cobrarPedidoLocal(input: unknown): Promise<PedidoActionResult> {
  const parsed = cobroSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const v = parsed.data;
  const ctx = await contexto("editar");
  if ("error" in ctx) return { error: ctx.error };

  const pedido = await leerPedido(ctx, v.pedidoId);
  if (!pedido) return { error: "Pedido no encontrado." };
  if (pedido.estado !== "para_pagar_local" || pedido.venta_id) {
    return { error: "Este pedido no está listo para cobrar. Actualiza la página." };
  }
  const tasa = await getTasaVigente(ctx.supabase, ctx.tenantId);
  if (!tasa) return { error: "Define la tasa del día antes de cobrar." };
  const r = await recalcular(ctx, pedido, v.metodo, tasa.valor);
  if (!r.ok) return { error: r.error, faltantes: r.faltantes };

  const moneda = monedaMetodo(v.metodo);
  const esEfectivo = v.metodo === "efectivo_bs" || v.metodo === "efectivo_usd";
  const exacto = r.montoMetodo ?? (moneda === "USD" ? r.totalUsd : r.totalBs);
  // Solo el efectivo admite vuelto; los medios digitales se cobran exactos.
  const monto = esEfectivo ? v.montoRecibido : exacto;
  if (monto + 0.001 < exacto) {
    return {
      error: `El monto recibido no cubre el total (${exacto.toFixed(2)} ${moneda === "USD" ? "USD" : "Bs"}).`,
    };
  }
  if (esMetodoConCuenta(v.metodo) && !v.cuentaBancariaId) {
    return { error: "Elige la cuenta bancaria que recibe el pago." };
  }

  // Vuelto: misma cuenta que el POS con ese mismo pago.
  const config = r.config;
  const pagoCalc = [{ metodo: v.metodo as MmMetodoPago, monto: String(monto) }];
  const cobro = computeCobro({
    pagos: pagoCalc,
    subtotalNeto: r.subtotalUsd,
    tasa: tasa.valor,
    cantidadLineas: r.lineas.length,
    clienteId: null,
    igtfActivo: config.igtfActivo,
    ivaActivo: config.ivaActivo,
    ivaPct: config.ivaPct,
    subtotalGravado: r.subtotalGravado,
    subtotalSujetoIgtf: r.subtotalSujetoIgtf,
  });
  if (!cobro.puedeConfirmar) return { error: "El monto recibido no cubre el total." };
  const excedenteBs = calcularExcedenteBs(pagoCalc, tasa.valor, cobro.totalBs);
  const vuelto =
    esEfectivo && cobro.vuelto > 0.001
      ? {
          monto: v.vueltoMoneda === "USD" ? Math.round(cobro.vuelto * 100) / 100 : excedenteBs,
          moneda: v.vueltoMoneda,
        }
      : undefined;

  if (!(await reservar(ctx, pedido.id, "para_pagar_local"))) {
    return { error: "Este pedido ya fue cobrado en otra sesión. Actualiza la página." };
  }
  const venta = await registrarVenta({
    items: r.itemsInput,
    pagos: [
      {
        metodo: v.metodo,
        monto,
        moneda,
        cuenta_bancaria_id: esMetodoConCuenta(v.metodo) ? v.cuentaBancariaId : null,
      },
    ],
    sucursal_id: pedido.sucursal_id,
    cliente_id: null,
    vuelto,
  });
  if (venta.error || !venta.ventaId) {
    await liberar(ctx, pedido.id, "para_pagar_local");
    return { error: venta.error ?? "No se pudo registrar la venta." };
  }
  await enlazarVenta(ctx, pedido.id, venta.ventaId);
  revalidar(pedido.id);
  return { ok: true, ventaId: venta.ventaId };
}

/** Pedido ya pagado y registrado → entregado (sin impacto en dinero ni stock). */
export async function marcarEntregado(pedidoIdRaw: string): Promise<PedidoActionResult> {
  const pedidoId = idSchema.safeParse(pedidoIdRaw);
  if (!pedidoId.success) return { error: "Pedido inválido." };
  const ctx = await contexto("editar");
  if ("error" in ctx) return { error: ctx.error };
  const { data } = await ctx.supabase
    .from("mm_pedidos_publicos")
    .update({ estado: "completado" })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", pedidoId.data)
    .eq("estado", "aceptado_validado")
    .not("venta_id", "is", null)
    .select("id")
    .maybeSingle();
  if (!data) return { error: "El pedido no está listo para entregar. Actualiza la página." };
  revalidar(pedidoId.data);
  return { ok: true };
}

const rechazoSchema = z.object({
  pedidoId: z.string().uuid(),
  motivo: z.string().trim().min(3, "Escribe el motivo del rechazo.").max(300),
});

/** Rechaza un pedido que aún no tiene venta (nunca toca stock ni dinero). */
export async function rechazarPedido(input: unknown): Promise<PedidoActionResult> {
  const parsed = rechazoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const ctx = await contexto("editar");
  if ("error" in ctx) return { error: ctx.error };
  const { data } = await ctx.supabase
    .from("mm_pedidos_publicos")
    .update({
      estado: "rechazado",
      motivo_rechazo: parsed.data.motivo,
      usuario_valido_id: ctx.userId,
    })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", parsed.data.pedidoId)
    .in("estado", ["pendiente", "pago_reportado", "para_pagar_local"])
    .is("venta_id", null)
    .select("id")
    .maybeSingle();
  if (!data) return { error: "Este pedido ya no se puede rechazar. Actualiza la página." };
  revalidar(parsed.data.pedidoId);
  return { ok: true };
}

// --- Mi catálogo ------------------------------------------------------------------

const catalogoSchema = z.object({
  sucursalId: z.string().uuid(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .refine(
      esSlugValido,
      "El enlace debe tener entre 3 y 80 caracteres: letras minúsculas, números y guiones.",
    ),
  activo: z.boolean(),
});

/** Crea o actualiza el catálogo público de una sucursal (activar, desactivar, slug). */
export async function guardarCatalogo(input: unknown): Promise<PedidoActionResult> {
  const parsed = catalogoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const ctx = await contexto("crear");
  if ("error" in ctx) return { error: ctx.error };
  const v = parsed.data;

  const { data: suc } = await ctx.supabase
    .from("mm_sucursales")
    .select("id")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", v.sucursalId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!suc) return { error: "Sucursal no encontrada." };

  const { error } = await ctx.supabase
    .from("mm_catalogo_publico")
    .upsert(
      { tenant_id: ctx.tenantId, sucursal_id: v.sucursalId, slug: v.slug, activo: v.activo },
      { onConflict: "tenant_id,sucursal_id" },
    );
  if (error) {
    if (error.code === "23505") return { error: "Ese enlace ya está en uso. Elige otro." };
    return { error: "No se pudo guardar el catálogo." };
  }
  revalidatePath(`${RUTA}/mi-catalogo`);
  return { ok: true };
}

const telefonoClienteSchema = z.object({
  clienteId: z.string().uuid(),
  telefono: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s-]{6,29}$/, "Escribe un teléfono válido."),
});

/** Registra el WhatsApp de un cliente que no lo tenía, para compartirle el catálogo. */
export async function guardarWhatsappCliente(input: unknown): Promise<PedidoActionResult> {
  const parsed = telefonoClienteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };
  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "clientes",
    "editar",
  );
  if (permisoError) return { error: permisoError };
  const { data } = await supabase
    .from("mm_clientes")
    .update({ whatsapp: parsed.data.telefono })
    .eq("tenant_id", tenantId)
    .eq("id", parsed.data.clienteId)
    .select("id")
    .maybeSingle();
  if (!data) return { error: "No se pudo guardar el número." };
  return { ok: true };
}
