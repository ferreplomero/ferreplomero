"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getCompraConItems } from "@/lib/minimarket/data/compras";
import type { Database, MmMetodoPago } from "@arkiteq/db";
import { requirePermisoAccion } from "@/lib/minimarket/permisos";
import {
  IGTF_RATE,
  causaIgtf,
  METODOS_COMPRA_IDS,
  METODOS_GASTO_IDS,
} from "@/lib/minimarket/constants";
import { medianocheLocalAUtcISO } from "@/lib/minimarket/date-format";
import { TZ_DEFAULT } from "@/lib/minimarket/timezone";
import { margenSobreCosto, precioDesdeMargen } from "@/lib/minimarket/producto-opciones";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { esEfectivo } from "@/lib/minimarket/pos-calc";
import { esMetodoConCuenta } from "@/lib/minimarket/bancos";
import {
  getImpactoCajaGasto,
  getSesionAbierta,
  insertarMovimientoCaja,
} from "@/lib/minimarket/data/caja";
import {
  getImpactoCuentaPorReferencia,
  insertarMovimientoCuenta,
} from "@/lib/minimarket/data/bancos";

const COMPRAS_PATH = "/minimarket/compras";
const CAJA_PATH = "/minimarket/caja";
const BANCOS_PATH = "/minimarket/bancos";
const redondear = (n: number) => Math.round(n * 100) / 100;

export interface CompraResult {
  ok?: boolean;
  compraId?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export interface ProveedorResult {
  ok?: boolean;
  proveedorId?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const proveedorSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio.").max(120),
  contacto: z.string().trim().max(120).optional().or(z.literal("")),
  telefono: z.string().trim().max(30).optional().or(z.literal("")),
  whatsapp: z.string().trim().max(30).optional().or(z.literal("")),
  notas: z.string().trim().max(500).optional().or(z.literal("")),
  activo: z.boolean(),
});

const itemSchema = z.object({
  producto_id: z.string().uuid(),
  cantidad: z.number().positive("La cantidad debe ser mayor a cero."),
  costo_unitario_usd: z.number().min(0, "El costo no puede ser negativo."),
  /** Decisión del usuario cuando el costo cambió respecto al inventario:
   * actualizar costo/precio de venta del producto (true) o mantenerlos y que
   * esta compra solo registre su costo real pagado (false, default). */
  actualizar_costo: z.boolean().default(true),
});

const compraSchema = z.object({
  proveedor_id: z.string().uuid().nullable().optional(),
  sucursal_id: z.string().uuid(),
  fecha: z.string().min(1, "La fecha es obligatoria."),
  estado: z.enum(["borrador", "recibida"]),
  metodo_pago: z.enum(METODOS_COMPRA_IDS, {
    errorMap: () => ({ message: "Selecciona cómo se pagó la compra." }),
  }),
  /** Solo cuando metodo_pago es digital — de qué cuenta bancaria sale el dinero. */
  cuenta_bancaria_id: z.string().uuid().optional().or(z.literal("")),
  notas: z.string().trim().max(1000).optional().or(z.literal("")),
  items: z.array(itemSchema).min(1, "Agrega al menos un producto."),
});

/** Métodos reales aceptados para pagar una compra que empezó como
 * "credito_proveedor" — nunca "credito_proveedor" otra vez (ver pagarCompra). */
const metodoPagoRealSchema = z.enum(METODOS_GASTO_IDS, {
  errorMap: () => ({ message: "Selecciona con qué se pagó de verdad." }),
});

/**
 * Valida y resuelve la cuenta bancaria de una compra pagada por método
 * digital: debe existir, pertenecer al tenant y coincidir con el método
 * elegido — mismo criterio que `resolverCuentaGasto` en
 * `reportes/gastos/actions.ts`. Una compra real SIEMPRE se bloquea si falta
 * la cuenta, nunca queda "para control" sin descontar ningún saldo
 * (CLAUDE.md regla crítica #1).
 */
async function resolverCuentaCompra(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  metodo: MmMetodoPago,
  cuentaBancariaId: string | undefined,
): Promise<{ cuentaId: string } | { error: string }> {
  if (!cuentaBancariaId) {
    return { error: "Selecciona la cuenta bancaria de la que salió el dinero." };
  }
  const { data: cuenta } = await supabase
    .from("mm_cuentas_bancarias")
    .select("id, metodo")
    .eq("tenant_id", tenantId)
    .eq("id", cuentaBancariaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!cuenta || cuenta.metodo !== metodo) {
    return { error: "La cuenta bancaria elegida no es válida para este método." };
  }
  return { cuentaId: cuenta.id };
}

/** Monto en USD y Bs que debe salir de la CUENTA BANCARIA por el total
 * realmente pagado de una compra (mercancía + IVA + IGTF, ya congelados) —
 * mismo criterio que `montoCuentaParaGasto` en `reportes/gastos/actions.ts`. */
async function montoCuentaParaCompra(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  totalPagadoUsd: number,
): Promise<{ montoUsd: number; montoBs: number; tasa: number } | { error: string }> {
  const tasa = await getTasaVigente(supabase, tenantId);
  if (!tasa || tasa.valor <= 0) {
    return { error: "No hay tasa de cambio registrada; no se puede registrar el egreso." };
  }
  return {
    montoUsd: totalPagadoUsd,
    montoBs: redondear(totalPagadoUsd * tasa.valor),
    tasa: tasa.valor,
  };
}

/**
 * Monto y moneda que debe salir de la CAJA física por el total realmente
 * pagado de una compra en efectivo — mismo criterio que `montoCajaParaGasto`.
 */
async function montoCajaParaCompra(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  metodo: MmMetodoPago,
  totalPagadoUsd: number,
): Promise<{ monto: number; moneda: "USD" | "VES" } | { error: string }> {
  if (metodo === "efectivo_usd") return { monto: totalPagadoUsd, moneda: "USD" };
  const tasa = await getTasaVigente(supabase, tenantId);
  if (!tasa || tasa.valor <= 0) {
    return { error: "No hay tasa de cambio registrada; no se puede convertir a bolívares." };
  }
  return { monto: redondear(totalPagadoUsd * tasa.valor), moneda: "VES" };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNull(v: string | undefined): string | null {
  return v && v.length > 0 ? v : null;
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(error.issues.map((i) => [i.path[0], i.message]));
}

/**
 * Aplica los efectos de una compra recibida al inventario:
 * - Suma stock vía mm_movimientos_inventario (ledger append-only, tipo=entrada)
 *   — SIEMPRE, para todos los ítems, sin excepción.
 * - Si el usuario eligió "Actualizar" para un ítem (item.actualizar_costo) Y
 *   el costo de verdad difiere del actual (releído fresco aquí, nunca del
 *   valor que traía el formulario): el costo NO se reemplaza de golpe — se
 *   PONDERA contra el stock que ya había (a su costo viejo), para no revaluar
 *   instantáneamente unidades que ya se pagaron a otro precio. Con ese costo
 *   promedio se recalcula precio_usd con el margen que el producto YA tenía
 *   (margenSobreCosto/precioDesdeMargen, agnóstico a si sigue el margen
 *   global o uno personalizado), y se archiva el cambio en mm_precios.
 * - Si eligió "Mantener" (o no hubo cambio real): NO se toca costo_usd ni
 *   precio_usd de ese producto — la compra igual registra su costo real
 *   pagado en mm_compras_items, sin afectar el inventario.
 */
async function aplicarRecepcion(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  userId: string,
  compraId: string,
  sucursalId: string,
  items: {
    producto_id: string;
    cantidad: number;
    costo_unitario_usd: number;
    actualizar_costo: boolean;
  }[],
) {
  const { error: movErr } = await supabase.from("mm_movimientos_inventario").insert(
    items.map((i) => ({
      tenant_id: tenantId,
      producto_id: i.producto_id,
      sucursal_id: sucursalId,
      tipo: "entrada" as const,
      cantidad: i.cantidad,
      motivo: "Compra",
      referencia: compraId,
      usuario_id: userId,
    })),
  );
  if (movErr) throw new Error(`No se pudo registrar la entrada de stock: ${movErr.message}`);

  // Costo/precio ACTUALES de verdad del producto, releídos justo antes de
  // decidir — nunca se confía en el costo que traía el formulario (pudo
  // quedar desactualizado mientras el cajero tenía la pantalla abierta).
  const productoIds = [...new Set(items.map((i) => i.producto_id))];
  const [{ data: productosActuales, error: prodErr }, { data: stockRows, error: stockErr }] =
    await Promise.all([
      supabase
        .from("mm_productos")
        .select("id, costo_usd, precio_usd")
        .eq("tenant_id", tenantId)
        .in("id", productoIds),
      // Stock DESPUÉS de la entrada que se acaba de insertar arriba (línea
      // 202-214) — para el promedio ponderado hace falta el stock de ANTES,
      // así que más abajo se le resta la cantidad de esta misma recepción.
      supabase
        .from("mm_v_stock")
        .select("producto_id, stock_actual")
        .eq("tenant_id", tenantId)
        .in("producto_id", productoIds),
    ]);
  if (prodErr) {
    throw new Error(`No se pudo leer el costo actual de los productos: ${prodErr.message}`);
  }
  if (stockErr) {
    throw new Error(`No se pudo leer el stock actual de los productos: ${stockErr.message}`);
  }

  const actualPorProducto = new Map(
    (productosActuales ?? []).map((p) => [
      p.id,
      { costo: Number(p.costo_usd), precio: Number(p.precio_usd) },
    ]),
  );

  // Un producto puede tener stock en varias sucursales (mm_v_stock trae una
  // fila por sucursal) — el costo es una propiedad GLOBAL del producto, así
  // que se suma el stock de todas.
  const stockPostEntradaPorProducto = new Map<string, number>();
  for (const row of stockRows ?? []) {
    if (!row.producto_id) continue;
    stockPostEntradaPorProducto.set(
      row.producto_id,
      (stockPostEntradaPorProducto.get(row.producto_id) ?? 0) + Number(row.stock_actual),
    );
  }
  // Cantidad recibida por producto EN ESTA compra (por si el mismo producto
  // aparece en más de una línea del mismo recibo).
  const cantidadRecibidaPorProducto = new Map<string, number>();
  for (const item of items) {
    cantidadRecibidaPorProducto.set(
      item.producto_id,
      (cantidadRecibidaPorProducto.get(item.producto_id) ?? 0) + item.cantidad,
    );
  }

  const ahora = new Date().toISOString();
  const actualizaciones: { producto_id: string; nuevoCosto: number; nuevoPrecio: number }[] = [];
  for (const item of items) {
    if (!item.actualizar_costo) continue;
    const actual = actualPorProducto.get(item.producto_id);
    if (!actual) continue; // producto eliminado entre medio: nada que actualizar
    const huboCambioReal = Math.abs(actual.costo - item.costo_unitario_usd) > 0.001;
    if (!huboCambioReal) continue;

    // Costo PROMEDIO PONDERADO: el stock que YA había (a su costo viejo) se
    // pondera contra la cantidad que entra en ESTA compra (a su costo real
    // pagado) — nunca se reemplaza el costo de golpe, o el stock que ya
    // estaba pagado a otro precio quedaría revaluado de un día para otro
    // (y el precio de venta, si sigue un margen, saltaría con él). Si no
    // había stock previo (recibido en 0 o negativo por algún ajuste), el
    // costo nuevo se toma tal cual — no hay nada que ponderar.
    const stockPostEntrada = stockPostEntradaPorProducto.get(item.producto_id) ?? 0;
    const cantidadRecibidaTotal =
      cantidadRecibidaPorProducto.get(item.producto_id) ?? item.cantidad;
    const stockPrevio = Math.max(0, stockPostEntrada - cantidadRecibidaTotal);
    const costoPromedio =
      stockPrevio > 0
        ? (stockPrevio * actual.costo + item.cantidad * item.costo_unitario_usd) /
          (stockPrevio + item.cantidad)
        : item.costo_unitario_usd;
    const nuevoCosto = Math.round(costoPromedio * 100) / 100;

    // El margen que el producto YA tenía (costo/precio actuales), reaplicado
    // al costo PONDERADO — "si el costo promedio sube y el margen es X%, el
    // precio de venta sube proporcionalmente". Si no hay margen previo
    // calculable (costo actual en 0), se actualiza solo el costo y el precio
    // queda igual.
    const margen = margenSobreCosto(actual.costo, actual.precio);
    const nuevoPrecio = margen !== null ? precioDesdeMargen(nuevoCosto, margen) : actual.precio;
    actualizaciones.push({
      producto_id: item.producto_id,
      nuevoCosto,
      nuevoPrecio,
    });
  }

  if (actualizaciones.length > 0) {
    await Promise.all([
      ...actualizaciones.map((a) =>
        supabase
          .from("mm_productos")
          .update({ costo_usd: a.nuevoCosto, precio_usd: a.nuevoPrecio, updated_at: ahora })
          .eq("id", a.producto_id)
          .eq("tenant_id", tenantId),
      ),
      supabase.from("mm_precios").insert(
        actualizaciones.map((a) => ({
          tenant_id: tenantId,
          producto_id: a.producto_id,
          precio_usd: a.nuevoPrecio,
          vigente_desde: ahora,
          usuario_id: userId,
        })),
      ),
    ]);
  }
}

// ---------------------------------------------------------------------------
// Acciones de Proveedor
// ---------------------------------------------------------------------------

export async function crearProveedor(
  _prev: ProveedorResult,
  formData: FormData,
): Promise<ProveedorResult> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };
  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "proveedores",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const raw = {
    nombre: formData.get("nombre"),
    contacto: formData.get("contacto") ?? "",
    telefono: formData.get("telefono") ?? "",
    whatsapp: formData.get("whatsapp") ?? "",
    notas: formData.get("notas") ?? "",
    activo: formData.get("activo") === "true",
  };

  const parsed = proveedorSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const d = parsed.data;

  const { data, error } = await supabase
    .from("mm_proveedores")
    .insert({
      tenant_id: tenantId,
      nombre: d.nombre,
      contacto: toNull(d.contacto),
      telefono: toNull(d.telefono),
      whatsapp: toNull(d.whatsapp),
      notas: toNull(d.notas),
      activo: d.activo,
    })
    .select("id")
    .single();

  if (error) return { error: "No se pudo crear el proveedor. Inténtalo de nuevo." };

  revalidatePath(`${COMPRAS_PATH}/proveedores`);
  return { ok: true, proveedorId: data.id };
}

export async function actualizarProveedor(
  proveedorId: string,
  _prev: ProveedorResult,
  formData: FormData,
): Promise<ProveedorResult> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };
  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "proveedores",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  const raw = {
    nombre: formData.get("nombre"),
    contacto: formData.get("contacto") ?? "",
    telefono: formData.get("telefono") ?? "",
    whatsapp: formData.get("whatsapp") ?? "",
    notas: formData.get("notas") ?? "",
    activo: formData.get("activo") === "true",
  };

  const parsed = proveedorSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const d = parsed.data;

  const { error } = await supabase
    .from("mm_proveedores")
    .update({
      nombre: d.nombre,
      contacto: toNull(d.contacto),
      telefono: toNull(d.telefono),
      whatsapp: toNull(d.whatsapp),
      notas: toNull(d.notas),
      activo: d.activo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", proveedorId)
    .eq("tenant_id", tenantId);

  if (error) return { error: "No se pudo actualizar el proveedor." };

  revalidatePath(`${COMPRAS_PATH}/proveedores`);
  revalidatePath(`${COMPRAS_PATH}/proveedores/${proveedorId}`);
  return { ok: true, proveedorId };
}

// ---------------------------------------------------------------------------
// Acciones de Compra
// ---------------------------------------------------------------------------

/**
 * Registra una compra con sus ítems. Los ítems se reciben como JSON en el
 * campo `items_json` para soportar listas dinámicas en el formulario cliente.
 * Si el estado es 'recibida', aplica stock y costos inmediatamente.
 */
export async function crearCompra(_prev: CompraResult, formData: FormData): Promise<CompraResult> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };
  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "compras",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const itemsRaw = formData.get("items_json");
  let itemsParsed: unknown[];
  try {
    itemsParsed = JSON.parse(typeof itemsRaw === "string" ? itemsRaw : "[]");
    if (!Array.isArray(itemsParsed)) throw new Error();
  } catch {
    return { error: "Los ítems de la compra son inválidos." };
  }

  const itemsValidation = z
    .array(itemSchema)
    .min(1, "Agrega al menos un producto.")
    .safeParse(
      itemsParsed.map((i) => {
        const obj = i as Record<string, unknown>;
        return {
          producto_id: obj.producto_id,
          cantidad: Number(obj.cantidad),
          costo_unitario_usd: Number(obj.costo_unitario_usd),
          actualizar_costo: Boolean(obj.actualizar_costo),
        };
      }),
    );
  if (!itemsValidation.success) {
    return { error: itemsValidation.error.issues[0]?.message ?? "Ítems inválidos." };
  }

  const raw = {
    proveedor_id: formData.get("proveedor_id") || null,
    sucursal_id: formData.get("sucursal_id"),
    fecha: formData.get("fecha"),
    estado: formData.get("estado"),
    metodo_pago: formData.get("metodo_pago"),
    cuenta_bancaria_id: formData.get("cuenta_bancaria_id") ?? "",
    notas: formData.get("notas") ?? "",
    items: itemsValidation.data,
  };

  const parsed = compraSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error), error: parsed.error.issues[0]?.message };
  }

  const d = parsed.data;
  const totalUsd = redondear(d.items.reduce((s, i) => s + i.cantidad * i.costo_unitario_usd, 0));

  let proveedorNombre: string | null = null;
  if (d.proveedor_id) {
    const { data: prov } = await supabase
      .from("mm_proveedores")
      .select("nombre")
      .eq("tenant_id", tenantId)
      .eq("id", d.proveedor_id)
      .maybeSingle();
    proveedorNombre = prov?.nombre ?? null;
  }
  const motivoCompra = `Compra${proveedorNombre ? ` a ${proveedorNombre}` : ""}`;

  // IVA/IGTF de control interno (Finanzas): se calculan UNA vez, al registrar
  // la compra, y quedan congelados — igual que en ventas, un cambio posterior
  // de los parámetros fiscales no debe alterar compras ya registradas.
  const { data: configFiscal } = await supabase
    .from("mm_config_negocio")
    .select("parametros")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const paramsFiscales = (configFiscal?.parametros as Record<string, unknown>) ?? {};
  const ivaActivo = Boolean(paramsFiscales.iva_activo ?? false);
  const ivaPct = Number(paramsFiscales.iva_pct ?? 16);
  const igtfActivo = paramsFiscales.igtf_activo !== false;
  const tzRaw = paramsFiscales.timezone;
  const tz = typeof tzRaw === "string" && tzRaw.length > 0 ? tzRaw : TZ_DEFAULT;

  const ivaUsd = ivaActivo && ivaPct > 0 ? redondear((totalUsd * ivaPct) / 100) : 0;
  const igtfUsd =
    igtfActivo && causaIgtf(d.metodo_pago) ? redondear((totalUsd + ivaUsd) * IGTF_RATE) : 0;
  const totalPagadoUsd = redondear(totalUsd + ivaUsd + igtfUsd);

  // De dónde sale el dinero de esta compra — mismo criterio bloqueante que
  // Gastos (reportes/gastos/actions.ts): una compra pagada de verdad SIEMPRE
  // debe poder descontar caja/banco; si no puede, se bloquea la creación
  // completa en vez de dejarla "para control" sin descontar ningún saldo
  // (CLAUDE.md regla crítica #1). "credito_proveedor" es la única excepción:
  // la mercancía se recibe pero el proveedor aún no cobra (cuenta por pagar
  // real), el pago se registra después con pagarCompra.
  let sesionId: string | null = null;
  let montoCaja: { monto: number; moneda: "USD" | "VES" } | null = null;
  let cuentaId: string | null = null;
  let montoCuenta: { montoUsd: number; montoBs: number; tasa: number } | null = null;
  const esCredito = d.metodo_pago === "credito_proveedor";
  if (!esCredito) {
    if (esEfectivo(d.metodo_pago)) {
      const sesion = await getSesionAbierta(supabase, tenantId);
      if (!sesion) {
        return {
          error: "Debes tener la caja abierta para registrar una compra pagada en efectivo.",
          fieldErrors: { metodo_pago: "Requiere caja abierta." },
        };
      }
      const res = await montoCajaParaCompra(supabase, tenantId, d.metodo_pago, totalPagadoUsd);
      if ("error" in res) return { error: res.error, fieldErrors: { metodo_pago: res.error } };
      sesionId = sesion.id;
      montoCaja = res;
    } else if (esMetodoConCuenta(d.metodo_pago)) {
      const cuentaRes = await resolverCuentaCompra(
        supabase,
        tenantId,
        d.metodo_pago,
        d.cuenta_bancaria_id,
      );
      if ("error" in cuentaRes) {
        return { error: cuentaRes.error, fieldErrors: { cuenta_bancaria_id: cuentaRes.error } };
      }
      const montoRes = await montoCuentaParaCompra(supabase, tenantId, totalPagadoUsd);
      if ("error" in montoRes)
        return { error: montoRes.error, fieldErrors: { metodo_pago: montoRes.error } };
      cuentaId = cuentaRes.cuentaId;
      montoCuenta = montoRes;
    }
  }

  // d.fecha llega como "YYYY-MM-DD" del <input type="date">: hay que anclarlo
  // a medianoche en la zona horaria del negocio antes de guardarlo en la
  // columna timestamptz, o Postgres lo interpreta en UTC y la fecha se corre
  // un dia al mostrarla en la zona horaria real (ver 0045_mm_compras_fecha_timezone_fix.sql).
  const fechaUtc = medianocheLocalAUtcISO(d.fecha, tz);
  const ahoraIso = new Date().toISOString();

  const { data: compra, error: compraError } = await supabase
    .from("mm_compras")
    .insert({
      tenant_id: tenantId,
      proveedor_id: d.proveedor_id ?? null,
      sucursal_id: d.sucursal_id,
      fecha: fechaUtc,
      total_usd: totalUsd,
      iva_usd: ivaUsd,
      igtf_usd: igtfUsd,
      metodo_pago: d.metodo_pago,
      estado: d.estado,
      notas: toNull(d.notas),
      usuario_id: session.user.id,
      cuenta_bancaria_id: cuentaId,
      pagada: !esCredito,
      fecha_pago: esCredito ? null : ahoraIso,
    })
    .select("id")
    .single();

  if (compraError || !compra) {
    return { error: "No se pudo registrar la compra. Inténtalo de nuevo." };
  }

  const { error: itemsError } = await supabase.from("mm_compras_items").insert(
    d.items.map((i) => ({
      tenant_id: tenantId,
      compra_id: compra.id,
      producto_id: i.producto_id,
      cantidad: i.cantidad,
      costo_unitario_usd: i.costo_unitario_usd,
      actualizar_costo: i.actualizar_costo,
    })),
  );

  if (itemsError) {
    await supabase.from("mm_compras").delete().eq("id", compra.id);
    return { error: "No se pudieron guardar los productos de la compra." };
  }

  // Egreso real en Caja/Bancos — referencia = compra.id, mismo mecanismo que
  // Gastos/Abonos. Si falla, se revierte TODA la compra (ítems incluidos)
  // para no dejar una compra "pagada" que en realidad no descontó nada.
  if (sesionId && montoCaja) {
    const { error: errorCaja } = await insertarMovimientoCaja(supabase, {
      tenantId,
      sesionId,
      tipo: "egreso",
      monto: montoCaja.monto,
      moneda: montoCaja.moneda,
      motivo: motivoCompra,
      referencia: compra.id,
      usuarioId: session.user.id,
    });
    if (errorCaja) {
      await supabase.from("mm_compras_items").delete().eq("compra_id", compra.id);
      await supabase.from("mm_compras").delete().eq("id", compra.id);
      return { error: "No se pudo registrar el egreso en caja. La compra no se guardó." };
    }
    revalidatePath(CAJA_PATH);
  }

  if (cuentaId && montoCuenta) {
    const { error: errorCuenta } = await insertarMovimientoCuenta(supabase, {
      tenantId,
      cuentaId,
      tipo: "egreso",
      montoUsd: montoCuenta.montoUsd,
      montoBs: montoCuenta.montoBs,
      tasaUsada: montoCuenta.tasa,
      motivo: motivoCompra,
      referencia: compra.id,
      usuarioId: session.user.id,
    });
    if (errorCuenta) {
      await supabase.from("mm_compras_items").delete().eq("compra_id", compra.id);
      await supabase.from("mm_compras").delete().eq("id", compra.id);
      return {
        error: "No se pudo registrar el egreso en la cuenta bancaria. La compra no se guardó.",
      };
    }
    revalidatePath(BANCOS_PATH);
  }

  if (d.estado === "recibida") {
    try {
      await aplicarRecepcion(
        supabase,
        tenantId,
        session.user.id,
        compra.id,
        d.sucursal_id,
        d.items.map((i) => ({
          producto_id: i.producto_id,
          cantidad: i.cantidad,
          costo_unitario_usd: i.costo_unitario_usd,
          actualizar_costo: i.actualizar_costo,
        })),
      );
    } catch (e) {
      return {
        compraId: compra.id,
        error: `Compra registrada pero no se pudo actualizar el stock: ${e instanceof Error ? e.message : "error"}`,
      };
    }
  }

  revalidatePath(COMPRAS_PATH);
  revalidatePath("/minimarket/inventario");
  return { ok: true, compraId: compra.id };
}

/** Confirma la recepción de una compra en borrador → aplica stock y costos. */
export async function confirmarRecepcion(compraId: string): Promise<CompraResult> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };

  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "compras",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  const compra = await getCompraConItems(supabase, tenantId, compraId);

  if (!compra) return { error: "Compra no encontrada." };
  if (compra.estado !== "borrador") {
    return { error: `Esta compra ya está ${compra.estado} y no puede confirmarse.` };
  }
  if (!compra.items.length) return { error: "La compra no tiene ítems." };

  // Guardia atómica contra doble confirmación (dos pestañas, doble clic en
  // red lenta): el UPDATE solo tiene efecto si la compra SEGUÍA en "borrador"
  // en ese instante — si otra llamada ya ganó la carrera, `data` viene null y
  // se corta acá, antes de sumar el stock por segunda vez. Mismo patrón que
  // `reservarConversionPresupuesto` (presupuestos/actions.ts).
  const { data: reservada, error: reservaError } = await supabase
    .from("mm_compras")
    .update({ estado: "recibida", updated_at: new Date().toISOString() })
    .eq("id", compraId)
    .eq("tenant_id", tenantId)
    .eq("estado", "borrador")
    .select("id")
    .maybeSingle();

  if (reservaError) return { error: "No se pudo marcar la compra como recibida." };
  if (!reservada) {
    return { error: "Esta compra ya fue confirmada (probablemente desde otra pestaña)." };
  }

  try {
    await aplicarRecepcion(
      supabase,
      tenantId,
      session.user.id,
      compraId,
      compra.sucursal_id,
      compra.items
        .filter((i) => i.producto_id !== null)
        .map((i) => ({
          producto_id: i.producto_id as string,
          cantidad: i.cantidad,
          costo_unitario_usd: i.costo_unitario_usd,
          actualizar_costo: i.actualizar_costo,
        })),
    );
  } catch (e) {
    // El stock no se pudo aplicar: se libera la reserva para que el estado
    // vuelva a "borrador" y se pueda reintentar (sin esto, la compra
    // quedaría "recibida" con la mercancía sin sumar a inventario).
    await supabase
      .from("mm_compras")
      .update({ estado: "borrador", updated_at: new Date().toISOString() })
      .eq("id", compraId)
      .eq("tenant_id", tenantId)
      .eq("estado", "recibida");
    return { error: `No se pudo actualizar el stock: ${e instanceof Error ? e.message : "error"}` };
  }

  revalidatePath(COMPRAS_PATH);
  revalidatePath(`${COMPRAS_PATH}/${compraId}`);
  revalidatePath("/minimarket/inventario");
  return { ok: true, compraId };
}

/** Anula una compra en borrador (sin stock ya asentado). */
export async function anularCompra(compraId: string): Promise<CompraResult> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };

  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "compras",
    "eliminar",
  );
  if (permisoError) return { error: permisoError };

  const { data: c } = await supabase
    .from("mm_compras")
    .select("estado")
    .eq("id", compraId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!c) return { error: "Compra no encontrada." };
  if (c.estado === "recibida") {
    return { error: "No se puede anular una compra ya recibida. El stock ya fue asentado." };
  }
  if (c.estado === "anulada") return { error: "Esta compra ya está anulada." };

  // Si esta compra ya generó un egreso real en Caja/Bancos (cualquier método
  // menos "credito_proveedor" sin pagar aún), hay que revertirlo — no puede
  // quedar dinero descontado de una compra que se anula (CLAUDE.md regla
  // crítica #1). Mismo mecanismo genérico por `referencia` que ya usa
  // Gastos para editar/eliminar (getImpactoCajaGasto/getImpactoCuentaPorReferencia).
  const impactoCaja = await getImpactoCajaGasto(supabase, tenantId, compraId);
  if (impactoCaja.sesionId && !impactoCaja.sesionAbierta) {
    return {
      error:
        "Esta compra ya pasó por un cierre de caja y no se puede anular (el arqueo de esa " +
        "sesión ya quedó cuadrado con su egreso).",
    };
  }
  const impactoCuenta = await getImpactoCuentaPorReferencia(supabase, tenantId, compraId);

  const { error } = await supabase
    .from("mm_compras")
    .update({ estado: "anulada", updated_at: new Date().toISOString() })
    .eq("id", compraId)
    .eq("tenant_id", tenantId);

  if (error) return { error: "No se pudo anular la compra." };

  if (impactoCaja.sesionId && impactoCaja.neto.length > 0) {
    for (const n of impactoCaja.neto) {
      await insertarMovimientoCaja(supabase, {
        tenantId,
        sesionId: impactoCaja.sesionId,
        tipo: "ingreso",
        monto: n.monto,
        moneda: n.moneda,
        motivo: "Reverso por anulación de compra",
        referencia: compraId,
        usuarioId: session.user.id,
      });
    }
    revalidatePath(CAJA_PATH);
  }

  if (impactoCuenta.length > 0) {
    for (const n of impactoCuenta) {
      await insertarMovimientoCuenta(supabase, {
        tenantId,
        cuentaId: n.cuentaId,
        tipo: n.netoUsd >= 0 ? "ingreso" : "egreso",
        montoUsd: Math.abs(n.netoUsd),
        montoBs: Math.abs(n.netoBs),
        motivo: "Reverso por anulación de compra",
        referencia: compraId,
        usuarioId: session.user.id,
      });
    }
    revalidatePath(BANCOS_PATH);
  }

  revalidatePath(COMPRAS_PATH);
  revalidatePath(`${COMPRAS_PATH}/${compraId}`);
  return { ok: true, compraId };
}

export interface PagarCompraResult {
  ok?: boolean;
  error?: string;
}

/**
 * Registra el pago real de una compra que se recibió a crédito
 * (metodo_pago = 'credito_proveedor', pagada = false): descuenta caja/banco
 * por el total ya congelado (mercancía + IVA + IGTF, ver crearCompra) y
 * marca la compra como pagada — mismo mecanismo bloqueante que crearCompra
 * (sesión de caja abierta / cuenta bancaria válida obligatorias). No toca
 * stock ni costos: eso ya se resolvió al recibir la compra (`estado`), que
 * es independiente de cuándo se le paga al proveedor.
 */
export async function pagarCompra(
  compraId: string,
  metodo: string,
  cuentaBancariaId?: string,
): Promise<PagarCompraResult> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };

  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "compras",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  const metodoParsed = metodoPagoRealSchema.safeParse(metodo);
  if (!metodoParsed.success) {
    return { error: metodoParsed.error.issues[0]?.message ?? "Método de pago inválido." };
  }
  const metodoReal = metodoParsed.data;

  const { data: compra } = await supabase
    .from("mm_compras")
    .select("id, metodo_pago, pagada, estado, total_usd, iva_usd, igtf_usd, proveedor_id")
    .eq("tenant_id", tenantId)
    .eq("id", compraId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!compra) return { error: "Compra no encontrada." };
  if (compra.estado === "anulada") return { error: "Esta compra está anulada." };
  if (compra.metodo_pago !== "credito_proveedor" || compra.pagada) {
    return { error: "Esta compra ya está pagada." };
  }

  const totalPagadoUsd = redondear(
    Number(compra.total_usd) + Number(compra.iva_usd) + Number(compra.igtf_usd),
  );

  let proveedorNombre: string | null = null;
  if (compra.proveedor_id) {
    const { data: prov } = await supabase
      .from("mm_proveedores")
      .select("nombre")
      .eq("tenant_id", tenantId)
      .eq("id", compra.proveedor_id)
      .maybeSingle();
    proveedorNombre = prov?.nombre ?? null;
  }
  const motivoPago = `Pago de compra${proveedorNombre ? ` a ${proveedorNombre}` : ""}`;

  let sesionId: string | null = null;
  let montoCaja: { monto: number; moneda: "USD" | "VES" } | null = null;
  let cuentaId: string | null = null;
  let montoCuenta: { montoUsd: number; montoBs: number; tasa: number } | null = null;

  if (esEfectivo(metodoReal)) {
    const sesion = await getSesionAbierta(supabase, tenantId);
    if (!sesion) {
      return { error: "Debes tener la caja abierta para registrar este pago en efectivo." };
    }
    const res = await montoCajaParaCompra(supabase, tenantId, metodoReal, totalPagadoUsd);
    if ("error" in res) return { error: res.error };
    sesionId = sesion.id;
    montoCaja = res;
  } else if (esMetodoConCuenta(metodoReal)) {
    const cuentaRes = await resolverCuentaCompra(supabase, tenantId, metodoReal, cuentaBancariaId);
    if ("error" in cuentaRes) return { error: cuentaRes.error };
    const montoRes = await montoCuentaParaCompra(supabase, tenantId, totalPagadoUsd);
    if ("error" in montoRes) return { error: montoRes.error };
    cuentaId = cuentaRes.cuentaId;
    montoCuenta = montoRes;
  }

  // Se actualiza la compra PRIMERO (optimista) y se revierte si el egreso
  // falla — igual criterio de "nunca queda a medias" que crearCompra, pero
  // aquí la fila ya existe, así que revertir es un update, no un delete.
  const ahoraIso = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("mm_compras")
    .update({
      metodo_pago: metodoReal,
      cuenta_bancaria_id: cuentaId,
      pagada: true,
      fecha_pago: ahoraIso,
      updated_at: ahoraIso,
    })
    .eq("id", compraId)
    .eq("tenant_id", tenantId);

  if (updateError) return { error: "No se pudo registrar el pago. Inténtalo de nuevo." };

  const revertirActualizacion = async () => {
    await supabase
      .from("mm_compras")
      .update({
        metodo_pago: "credito_proveedor",
        cuenta_bancaria_id: null,
        pagada: false,
        fecha_pago: null,
      })
      .eq("id", compraId);
  };

  if (sesionId && montoCaja) {
    const { error: errorCaja } = await insertarMovimientoCaja(supabase, {
      tenantId,
      sesionId,
      tipo: "egreso",
      monto: montoCaja.monto,
      moneda: montoCaja.moneda,
      motivo: motivoPago,
      referencia: compraId,
      usuarioId: session.user.id,
    });
    if (errorCaja) {
      await revertirActualizacion();
      return { error: "No se pudo registrar el egreso en caja. El pago no se guardó." };
    }
    revalidatePath(CAJA_PATH);
  }

  if (cuentaId && montoCuenta) {
    const { error: errorCuenta } = await insertarMovimientoCuenta(supabase, {
      tenantId,
      cuentaId,
      tipo: "egreso",
      montoUsd: montoCuenta.montoUsd,
      montoBs: montoCuenta.montoBs,
      tasaUsada: montoCuenta.tasa,
      motivo: motivoPago,
      referencia: compraId,
      usuarioId: session.user.id,
    });
    if (errorCuenta) {
      await revertirActualizacion();
      return {
        error: "No se pudo registrar el egreso en la cuenta bancaria. El pago no se guardó.",
      };
    }
    revalidatePath(BANCOS_PATH);
  }

  revalidatePath(COMPRAS_PATH);
  revalidatePath(`${COMPRAS_PATH}/${compraId}`);
  return { ok: true };
}
