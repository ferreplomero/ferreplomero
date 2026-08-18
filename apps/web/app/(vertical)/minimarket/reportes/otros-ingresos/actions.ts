"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { requirePermisoAccion } from "@/lib/minimarket/permisos";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { esEfectivo } from "@/lib/minimarket/pos-calc";
import { esMetodoConCuenta } from "@/lib/minimarket/bancos";
import { METODOS_OTRO_INGRESO_IDS } from "@/lib/minimarket/constants";
import {
  getImpactoCajaGasto,
  getSesionAbierta,
  insertarMovimientoCaja,
} from "@/lib/minimarket/data/caja";
import { getSucursalActiva } from "@/lib/minimarket/sucursal-acceso";
import {
  getImpactoCuentaPorReferencia,
  insertarMovimientoCuenta,
} from "@/lib/minimarket/data/bancos";
import type { MmMetodoPago } from "@arkiteq/db";

const OTROS_INGRESOS_PATH = "/minimarket/reportes/otros-ingresos";
const GANANCIAS_PATH = "/minimarket/reportes/ganancias";
const CAJA_PATH = "/minimarket/caja";
const BANCOS_PATH = "/minimarket/bancos";
const redondear = (n: number) => Math.round(n * 100) / 100;

export interface OtroIngresoResult {
  ok?: boolean;
  otroIngresoId?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(error.issues.map((i) => [i.path[0], i.message]));
}

function toNull(v: string | undefined): string | null {
  return v && v.length > 0 ? v : null;
}

async function contexto() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id ?? null;
  if (!session || !tenantId) return null;
  const supabase = await createClient();
  return { supabase, tenantId, userId: session.user.id };
}

const otroIngresoSchema = z.object({
  descripcion: z.string().trim().min(1, "El concepto es obligatorio.").max(160),
  categoria_id: z.string().uuid({ message: "Selecciona una categoría." }),
  monto_usd: z.coerce
    .number({ invalid_type_error: "Monto inválido." })
    .positive("El monto debe ser mayor a cero."),
  fecha: z.string().min(1, "La fecha es obligatoria."),
  notas: z.string().trim().max(1000).optional().or(z.literal("")),
  metodo_pago: z.enum(METODOS_OTRO_INGRESO_IDS, {
    errorMap: () => ({ message: "Selecciona a dónde entró el dinero." }),
  }),
  /** Solo cuando metodo_pago es digital — a qué cuenta bancaria entró el dinero. */
  cuenta_bancaria_id: z.string().uuid().optional().or(z.literal("")),
});

/**
 * Monto y moneda que debe ENTRAR a la CAJA física por un otro-ingreso en
 * efectivo — mismo criterio que `montoCajaParaGasto` (gastos/actions.ts).
 */
async function montoCajaParaIngreso(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  metodo: MmMetodoPago,
  montoUsd: number,
): Promise<{ monto: number; moneda: "USD" | "VES" } | { error: string }> {
  if (metodo === "efectivo_usd") return { monto: montoUsd, moneda: "USD" };
  const tasa = await getTasaVigente(supabase, tenantId);
  if (!tasa || tasa.valor <= 0) {
    return { error: "No hay tasa de cambio registrada; no se puede convertir a bolívares." };
  }
  return { monto: redondear(montoUsd * tasa.valor), moneda: "VES" };
}

/** Igual criterio que `resolverCuentaGasto` (gastos/actions.ts): la cuenta
 * debe existir, pertenecer al tenant y coincidir con el método — un otro
 * ingreso digital sin cuenta válida se bloquea, nunca queda sin reflejar. */
async function resolverCuentaIngreso(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  metodo: MmMetodoPago,
  cuentaBancariaId: string | undefined,
): Promise<{ cuentaId: string } | { error: string }> {
  if (!cuentaBancariaId) {
    return { error: "Selecciona la cuenta bancaria a la que entró el dinero." };
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

/** Monto en USD y Bs que debe entrar a la CUENTA BANCARIA — mismo criterio
 * que `montoCuentaParaGasto` (gastos/actions.ts). */
async function montoCuentaParaIngreso(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  montoUsd: number,
): Promise<{ montoUsd: number; montoBs: number; tasa: number } | { error: string }> {
  const tasa = await getTasaVigente(supabase, tenantId);
  if (!tasa || tasa.valor <= 0) {
    return { error: "No hay tasa de cambio registrada; no se puede registrar el ingreso." };
  }
  return { montoUsd, montoBs: redondear(montoUsd * tasa.valor), tasa: tasa.valor };
}

export async function crearOtroIngreso(
  _prev: OtroIngresoResult,
  formData: FormData,
): Promise<OtroIngresoResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "reportes",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const parsed = otroIngresoSchema.safeParse({
    descripcion: formData.get("descripcion"),
    categoria_id: formData.get("categoria_id"),
    monto_usd: formData.get("monto_usd"),
    fecha: formData.get("fecha"),
    notas: formData.get("notas") ?? "",
    metodo_pago: formData.get("metodo_pago"),
    cuenta_bancaria_id: formData.get("cuenta_bancaria_id") ?? "",
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error), error: parsed.error.issues[0]?.message };
  }
  const d = parsed.data;
  const montoUsd = redondear(d.monto_usd);

  const { count: categoriaValida } = await ctx.supabase
    .from("mm_categorias_movimiento")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", d.categoria_id)
    .eq("tipo", "otro_ingreso")
    .is("deleted_at", null);
  if (!categoriaValida) {
    return {
      error: "Selecciona una categoría válida.",
      fieldErrors: { categoria_id: "Selecciona una categoría válida." },
    };
  }

  let sesionId: string | null = null;
  let montoCaja: { monto: number; moneda: "USD" | "VES" } | null = null;
  let cuentaId: string | null = null;
  let montoCuenta: { montoUsd: number; montoBs: number; tasa: number } | null = null;
  if (esEfectivo(d.metodo_pago)) {
    // Igual criterio que un gasto en efectivo: si no hay caja abierta, se
    // bloquea el registro completo en vez de dejar un ingreso "en efectivo"
    // que nunca entró a la gaveta (CLAUDE.md regla crítica #1).
    const { activa: sucursalActiva } = await getSucursalActiva(
      ctx.supabase,
      ctx.tenantId,
      ctx.userId,
    );
    if (!sucursalActiva) {
      return {
        error: "No tienes ninguna sucursal asignada.",
        fieldErrors: { metodo_pago: "Requiere sucursal asignada." },
      };
    }
    const sesion = await getSesionAbierta(ctx.supabase, ctx.tenantId, sucursalActiva.id);
    if (!sesion) {
      return {
        error: "Debes tener la caja abierta para registrar un ingreso en efectivo.",
        fieldErrors: { metodo_pago: "Requiere caja abierta." },
      };
    }
    const res = await montoCajaParaIngreso(ctx.supabase, ctx.tenantId, d.metodo_pago, montoUsd);
    if ("error" in res) return { error: res.error, fieldErrors: { metodo_pago: res.error } };
    sesionId = sesion.id;
    montoCaja = res;
  } else if (esMetodoConCuenta(d.metodo_pago)) {
    const cuentaRes = await resolverCuentaIngreso(
      ctx.supabase,
      ctx.tenantId,
      d.metodo_pago,
      d.cuenta_bancaria_id,
    );
    if ("error" in cuentaRes) {
      return { error: cuentaRes.error, fieldErrors: { cuenta_bancaria_id: cuentaRes.error } };
    }
    const montoRes = await montoCuentaParaIngreso(ctx.supabase, ctx.tenantId, montoUsd);
    if ("error" in montoRes)
      return { error: montoRes.error, fieldErrors: { metodo_pago: montoRes.error } };
    cuentaId = cuentaRes.cuentaId;
    montoCuenta = montoRes;
  }

  const { data: otroIngreso, error } = await ctx.supabase
    .from("mm_otros_ingresos")
    .insert({
      tenant_id: ctx.tenantId,
      descripcion: d.descripcion,
      categoria_id: d.categoria_id,
      monto_usd: montoUsd,
      fecha: d.fecha,
      notas: toNull(d.notas),
      metodo_pago: d.metodo_pago,
      cuenta_bancaria_id: cuentaId,
      usuario_id: ctx.userId,
    })
    .select("id")
    .single();

  if (error || !otroIngreso)
    return { error: "No se pudo registrar el ingreso. Inténtalo de nuevo." };

  if (sesionId && montoCaja) {
    const { error: errorCaja } = await insertarMovimientoCaja(ctx.supabase, {
      tenantId: ctx.tenantId,
      sesionId,
      // "ingreso", nunca "venta": este dinero no es una venta y no debe
      // contarse como tal en ningún resumen de caja.
      tipo: "ingreso",
      monto: montoCaja.monto,
      moneda: montoCaja.moneda,
      motivo: `Otro ingreso: ${d.descripcion}`,
      referencia: otroIngreso.id,
      usuarioId: ctx.userId,
    });
    if (errorCaja) {
      await ctx.supabase.from("mm_otros_ingresos").delete().eq("id", otroIngreso.id);
      return { error: "No se pudo registrar el ingreso en caja. No se guardó." };
    }
    revalidatePath(CAJA_PATH);
  }

  if (cuentaId && montoCuenta) {
    const { error: errorCuenta } = await insertarMovimientoCuenta(ctx.supabase, {
      tenantId: ctx.tenantId,
      cuentaId,
      tipo: "ingreso",
      montoUsd: montoCuenta.montoUsd,
      montoBs: montoCuenta.montoBs,
      tasaUsada: montoCuenta.tasa,
      motivo: `Otro ingreso: ${d.descripcion}`,
      referencia: otroIngreso.id,
      usuarioId: ctx.userId,
    });
    if (errorCuenta) {
      await ctx.supabase.from("mm_otros_ingresos").delete().eq("id", otroIngreso.id);
      return { error: "No se pudo registrar el ingreso en la cuenta bancaria. No se guardó." };
    }
    revalidatePath(BANCOS_PATH);
  }

  revalidatePath(OTROS_INGRESOS_PATH);
  revalidatePath(GANANCIAS_PATH);
  return { ok: true, otroIngresoId: otroIngreso.id };
}

export async function actualizarOtroIngreso(
  otroIngresoId: string,
  _prev: OtroIngresoResult,
  formData: FormData,
): Promise<OtroIngresoResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "reportes",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  const parsed = otroIngresoSchema.safeParse({
    descripcion: formData.get("descripcion"),
    categoria_id: formData.get("categoria_id"),
    monto_usd: formData.get("monto_usd"),
    fecha: formData.get("fecha"),
    notas: formData.get("notas") ?? "",
    metodo_pago: formData.get("metodo_pago"),
    cuenta_bancaria_id: formData.get("cuenta_bancaria_id") ?? "",
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error), error: parsed.error.issues[0]?.message };
  }
  const d = parsed.data;
  const montoUsd = redondear(d.monto_usd);

  const { count: categoriaValida } = await ctx.supabase
    .from("mm_categorias_movimiento")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", d.categoria_id)
    .eq("tipo", "otro_ingreso")
    .is("deleted_at", null);
  if (!categoriaValida) {
    return {
      error: "Selecciona una categoría válida.",
      fieldErrors: { categoria_id: "Selecciona una categoría válida." },
    };
  }

  const { data: actual } = await ctx.supabase
    .from("mm_otros_ingresos")
    .select("monto_usd, metodo_pago, cuenta_bancaria_id")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", otroIngresoId)
    .maybeSingle();
  if (!actual) return { error: "Ingreso no encontrado." };

  const impacto = await getImpactoCajaGasto(ctx.supabase, ctx.tenantId, otroIngresoId);
  const impactoCuenta = await getImpactoCuentaPorReferencia(
    ctx.supabase,
    ctx.tenantId,
    otroIngresoId,
  );
  const cambioMontoOMetodo =
    Math.abs(Number(actual.monto_usd) - montoUsd) > 0.001 || actual.metodo_pago !== d.metodo_pago;
  const cambioCuenta =
    esMetodoConCuenta(d.metodo_pago) &&
    (actual.cuenta_bancaria_id ?? "") !== (d.cuenta_bancaria_id ?? "");
  const requiereActualizarBanco = cambioMontoOMetodo || cambioCuenta;

  // Mismo criterio que un gasto: un ingreso que ya pasó por un cierre de caja
  // no puede cambiar de monto/método (rompería un arqueo ya validado).
  if (cambioMontoOMetodo && impacto.sesionId && !impacto.sesionAbierta) {
    return {
      error:
        "Este ingreso ya pasó por un cierre de caja: el monto y el método no se pueden modificar. " +
        "Solo puedes corregir el concepto, la fecha o las notas.",
      fieldErrors: {
        monto_usd: "Bloqueado: caja ya cerrada.",
        metodo_pago: "Bloqueado: caja ya cerrada.",
      },
    };
  }

  let sesionIdNueva: string | null = null;
  let montoCajaNuevo: { monto: number; moneda: "USD" | "VES" } | null = null;
  if (cambioMontoOMetodo && esEfectivo(d.metodo_pago)) {
    let sesion: { id: string } | null = impacto.sesionId ? { id: impacto.sesionId } : null;
    if (!sesion) {
      const { activa: sucursalActiva } = await getSucursalActiva(
        ctx.supabase,
        ctx.tenantId,
        ctx.userId,
      );
      sesion = sucursalActiva
        ? await getSesionAbierta(ctx.supabase, ctx.tenantId, sucursalActiva.id)
        : null;
    }
    if (!sesion) {
      return {
        error: "Debes tener la caja abierta para que este ingreso en efectivo quede reflejado.",
        fieldErrors: { metodo_pago: "Requiere caja abierta." },
      };
    }
    const res = await montoCajaParaIngreso(ctx.supabase, ctx.tenantId, d.metodo_pago, montoUsd);
    if ("error" in res) return { error: res.error, fieldErrors: { monto_usd: res.error } };
    sesionIdNueva = sesion.id;
    montoCajaNuevo = res;
  }

  let cuentaIdNueva: string | null = null;
  let montoCuentaNuevo: { montoUsd: number; montoBs: number; tasa: number } | null = null;
  if (requiereActualizarBanco && esMetodoConCuenta(d.metodo_pago)) {
    const cuentaRes = await resolverCuentaIngreso(
      ctx.supabase,
      ctx.tenantId,
      d.metodo_pago,
      d.cuenta_bancaria_id,
    );
    if ("error" in cuentaRes) {
      return { error: cuentaRes.error, fieldErrors: { cuenta_bancaria_id: cuentaRes.error } };
    }
    const montoRes = await montoCuentaParaIngreso(ctx.supabase, ctx.tenantId, montoUsd);
    if ("error" in montoRes)
      return { error: montoRes.error, fieldErrors: { monto_usd: montoRes.error } };
    cuentaIdNueva = cuentaRes.cuentaId;
    montoCuentaNuevo = montoRes;
  }

  const { error } = await ctx.supabase
    .from("mm_otros_ingresos")
    .update({
      descripcion: d.descripcion,
      categoria_id: d.categoria_id,
      monto_usd: montoUsd,
      fecha: d.fecha,
      notas: toNull(d.notas),
      metodo_pago: d.metodo_pago,
      cuenta_bancaria_id: requiereActualizarBanco
        ? cuentaIdNueva
        : (actual.cuenta_bancaria_id ?? null),
    })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", otroIngresoId);

  if (error) return { error: "No se pudo actualizar el ingreso." };

  if (cambioMontoOMetodo) {
    // Reversa sign-aware del neto ya reflejado en caja (los movimientos de un
    // otro-ingreso son siempre "ingreso", así que `impacto.neto` viene en
    // negativo — revertir un ingreso es insertar un "egreso" por ese monto).
    for (const n of impacto.neto) {
      await insertarMovimientoCaja(ctx.supabase, {
        tenantId: ctx.tenantId,
        sesionId: impacto.sesionId as string,
        tipo: n.monto >= 0 ? "ingreso" : "egreso",
        monto: Math.abs(n.monto),
        moneda: n.moneda,
        motivo: `Ajuste otro ingreso: ${d.descripcion}`,
        referencia: otroIngresoId,
        usuarioId: ctx.userId,
      });
    }
    if (sesionIdNueva && montoCajaNuevo) {
      await insertarMovimientoCaja(ctx.supabase, {
        tenantId: ctx.tenantId,
        sesionId: sesionIdNueva,
        tipo: "ingreso",
        monto: montoCajaNuevo.monto,
        moneda: montoCajaNuevo.moneda,
        motivo: `Otro ingreso: ${d.descripcion}`,
        referencia: otroIngresoId,
        usuarioId: ctx.userId,
      });
    }
    revalidatePath(CAJA_PATH);
  }

  if (requiereActualizarBanco) {
    for (const n of impactoCuenta) {
      await insertarMovimientoCuenta(ctx.supabase, {
        tenantId: ctx.tenantId,
        cuentaId: n.cuentaId,
        tipo: n.netoUsd >= 0 ? "ingreso" : "egreso",
        montoUsd: Math.abs(n.netoUsd),
        montoBs: Math.abs(n.netoBs),
        motivo: `Ajuste otro ingreso: ${d.descripcion}`,
        referencia: otroIngresoId,
        usuarioId: ctx.userId,
      });
    }
    if (cuentaIdNueva && montoCuentaNuevo) {
      await insertarMovimientoCuenta(ctx.supabase, {
        tenantId: ctx.tenantId,
        cuentaId: cuentaIdNueva,
        tipo: "ingreso",
        montoUsd: montoCuentaNuevo.montoUsd,
        montoBs: montoCuentaNuevo.montoBs,
        tasaUsada: montoCuentaNuevo.tasa,
        motivo: `Otro ingreso: ${d.descripcion}`,
        referencia: otroIngresoId,
        usuarioId: ctx.userId,
      });
    }
    revalidatePath(BANCOS_PATH);
  }

  revalidatePath(OTROS_INGRESOS_PATH);
  revalidatePath(GANANCIAS_PATH);
  return { ok: true, otroIngresoId };
}

export async function eliminarOtroIngreso(formData: FormData): Promise<OtroIngresoResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "reportes",
    "eliminar",
  );
  if (permisoError) return { error: permisoError };

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Ingreso no identificado." };

  const { data: otroIngreso } = await ctx.supabase
    .from("mm_otros_ingresos")
    .select("descripcion")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id)
    .maybeSingle();
  if (!otroIngreso) return { error: "Ingreso no encontrado." };

  const impacto = await getImpactoCajaGasto(ctx.supabase, ctx.tenantId, id);
  if (impacto.sesionId && !impacto.sesionAbierta) {
    return {
      error:
        "Este ingreso ya pasó por un cierre de caja y no se puede eliminar (el arqueo de esa " +
        "sesión ya quedó cuadrado con él). Si fue un error, regístralo como corrección en Caja.",
    };
  }
  const impactoCuenta = await getImpactoCuentaPorReferencia(ctx.supabase, ctx.tenantId, id);

  const { error } = await ctx.supabase
    .from("mm_otros_ingresos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id);

  if (error) return { error: "No se pudo eliminar el ingreso." };

  if (impacto.sesionId && impacto.neto.length > 0) {
    for (const n of impacto.neto) {
      await insertarMovimientoCaja(ctx.supabase, {
        tenantId: ctx.tenantId,
        sesionId: impacto.sesionId,
        tipo: n.monto >= 0 ? "ingreso" : "egreso",
        monto: Math.abs(n.monto),
        moneda: n.moneda,
        motivo: `Reverso por eliminación de otro ingreso: ${otroIngreso.descripcion}`,
        referencia: id,
        usuarioId: ctx.userId,
      });
    }
    revalidatePath(CAJA_PATH);
  }

  if (impactoCuenta.length > 0) {
    for (const n of impactoCuenta) {
      await insertarMovimientoCuenta(ctx.supabase, {
        tenantId: ctx.tenantId,
        cuentaId: n.cuentaId,
        tipo: n.netoUsd >= 0 ? "ingreso" : "egreso",
        montoUsd: Math.abs(n.netoUsd),
        montoBs: Math.abs(n.netoBs),
        motivo: `Reverso por eliminación de otro ingreso: ${otroIngreso.descripcion}`,
        referencia: id,
        usuarioId: ctx.userId,
      });
    }
    revalidatePath(BANCOS_PATH);
  }

  revalidatePath(OTROS_INGRESOS_PATH);
  revalidatePath(GANANCIAS_PATH);
  return { ok: true };
}
