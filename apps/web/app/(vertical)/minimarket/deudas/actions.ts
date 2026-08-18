"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { requirePermisoAccion } from "@/lib/minimarket/permisos";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { METODOS_ABONO } from "@/lib/minimarket/constants";
import { esEfectivo } from "@/lib/minimarket/pos-calc";
import { esMetodoConCuenta } from "@/lib/minimarket/bancos";
import { getSesionAbierta, insertarMovimientoCaja } from "@/lib/minimarket/data/caja";
import { getSucursalActiva } from "@/lib/minimarket/sucursal-acceso";
import { insertarMovimientoCuenta } from "@/lib/minimarket/data/bancos";
import type { MmMetodoPago } from "@arkiteq/db";

const DEUDAS_PATH = "/minimarket/deudas";
const CAJA_PATH = "/minimarket/caja";
const BANCOS_PATH = "/minimarket/bancos";
const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Valida y resuelve la cuenta bancaria de un abono digital: debe existir,
 * pertenecer al tenant y coincidir con el método elegido — mismo criterio de
 * validación que ya usa Gastos (`resolverCuentaGasto` en
 * reportes/gastos/actions.ts). Un abono real no puede quedar sin su cuenta.
 */
async function resolverCuentaAbono(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  metodo: MmMetodoPago,
  cuentaBancariaId: string | undefined,
): Promise<{ cuentaId: string } | { error: string }> {
  if (!cuentaBancariaId) {
    return { error: "Selecciona la cuenta bancaria de la que sale el dinero." };
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

export interface ActionResult {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export interface DeudaResult extends ActionResult {
  deudaId?: string;
}

export interface AbonoDeudaResult extends ActionResult {
  recibo?: {
    descripcion: string;
    acreedor: string;
    montoUsd: number;
    montoBs: number;
    metodo: string;
    tasa: number;
    saldoAnterior: number;
    saldoNuevo: number;
    fecha: string;
  };
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

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------

const categoriaSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio.").max(80),
  es_gasto_operativo: z.boolean(),
});

export async function crearCategoriaDeuda(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "deudas",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const parsed = categoriaSchema.safeParse({
    nombre: formData.get("nombre"),
    es_gasto_operativo: formData.get("es_gasto_operativo") === "on",
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { error } = await ctx.supabase.from("mm_categorias_deuda").insert({
    tenant_id: ctx.tenantId,
    nombre: parsed.data.nombre,
    es_gasto_operativo: parsed.data.es_gasto_operativo,
  });

  if (error) {
    if (error.code === "23505") return { error: "Ya existe una categoría con ese nombre." };
    return { error: "No se pudo crear la categoría." };
  }

  revalidatePath(`${DEUDAS_PATH}/categorias`);
  return { ok: true };
}

export async function actualizarCategoriaDeuda(
  categoriaId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "deudas",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  const parsed = categoriaSchema.safeParse({
    nombre: formData.get("nombre"),
    es_gasto_operativo: formData.get("es_gasto_operativo") === "on",
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { error } = await ctx.supabase
    .from("mm_categorias_deuda")
    .update({
      nombre: parsed.data.nombre,
      es_gasto_operativo: parsed.data.es_gasto_operativo,
    })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", categoriaId);

  if (error) {
    if (error.code === "23505") return { error: "Ya existe una categoría con ese nombre." };
    return { error: "No se pudo actualizar la categoría." };
  }

  revalidatePath(`${DEUDAS_PATH}/categorias`);
  return { ok: true };
}

/** Soft-delete de una categoría (solo si no tiene deudas activas asociadas). */
export async function eliminarCategoriaDeuda(formData: FormData): Promise<ActionResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "deudas",
    "eliminar",
  );
  if (permisoError) return { error: permisoError };

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Categoría no identificada." };

  const { count } = await ctx.supabase
    .from("mm_deudas")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", ctx.tenantId)
    .eq("categoria_id", id)
    .is("deleted_at", null);

  if ((count ?? 0) > 0) {
    return {
      error: `Esta categoría tiene ${count} deuda${count !== 1 ? "s" : ""} registrada${count !== 1 ? "s" : ""}. Reasígnalas antes de eliminar.`,
    };
  }

  const { error } = await ctx.supabase
    .from("mm_categorias_deuda")
    .update({ deleted_at: new Date().toISOString() })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id);

  if (error) return { error: "No se pudo eliminar la categoría." };

  revalidatePath(`${DEUDAS_PATH}/categorias`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Deudas
// ---------------------------------------------------------------------------

const deudaSchema = z.object({
  categoria_id: z.string().uuid().nullable().optional(),
  descripcion: z.string().trim().min(1, "La descripción es obligatoria.").max(160),
  acreedor: z.string().trim().min(1, "El acreedor es obligatorio.").max(160),
  monto_usd: z.coerce
    .number({ invalid_type_error: "Monto inválido." })
    .positive("El monto debe ser mayor a cero."),
  fecha: z.string().min(1, "La fecha es obligatoria."),
  vencimiento: z.string().trim().max(10).optional().or(z.literal("")),
  notas: z.string().trim().max(1000).optional().or(z.literal("")),
});

export async function crearDeuda(_prev: DeudaResult, formData: FormData): Promise<DeudaResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "deudas",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const raw = {
    categoria_id: formData.get("categoria_id") || null,
    descripcion: formData.get("descripcion"),
    acreedor: formData.get("acreedor"),
    monto_usd: formData.get("monto_usd"),
    fecha: formData.get("fecha"),
    vencimiento: formData.get("vencimiento") ?? "",
    notas: formData.get("notas") ?? "",
  };

  const parsed = deudaSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error), error: parsed.error.issues[0]?.message };
  }
  const d = parsed.data;

  const { data: deuda, error } = await ctx.supabase
    .from("mm_deudas")
    .insert({
      tenant_id: ctx.tenantId,
      categoria_id: d.categoria_id ?? null,
      descripcion: d.descripcion,
      acreedor: d.acreedor,
      monto_usd: redondear(d.monto_usd),
      fecha: d.fecha,
      vencimiento: toNull(d.vencimiento),
      notas: toNull(d.notas),
      usuario_id: ctx.userId,
    })
    .select("id")
    .single();

  if (error || !deuda) return { error: "No se pudo registrar la deuda. Inténtalo de nuevo." };

  revalidatePath(DEUDAS_PATH);
  revalidatePath(`${DEUDAS_PATH}/resumen`);
  return { ok: true, deudaId: deuda.id };
}

export async function actualizarDeuda(
  deudaId: string,
  _prev: DeudaResult,
  formData: FormData,
): Promise<DeudaResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "deudas",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  const raw = {
    categoria_id: formData.get("categoria_id") || null,
    descripcion: formData.get("descripcion"),
    acreedor: formData.get("acreedor"),
    monto_usd: formData.get("monto_usd"),
    fecha: formData.get("fecha"),
    vencimiento: formData.get("vencimiento") ?? "",
    notas: formData.get("notas") ?? "",
  };

  const parsed = deudaSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error), error: parsed.error.issues[0]?.message };
  }
  const d = parsed.data;

  const { error } = await ctx.supabase
    .from("mm_deudas")
    .update({
      categoria_id: d.categoria_id ?? null,
      descripcion: d.descripcion,
      acreedor: d.acreedor,
      monto_usd: redondear(d.monto_usd),
      fecha: d.fecha,
      vencimiento: toNull(d.vencimiento),
      notas: toNull(d.notas),
    })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", deudaId);

  if (error) return { error: "No se pudo actualizar la deuda." };

  revalidatePath(DEUDAS_PATH);
  revalidatePath(`${DEUDAS_PATH}/${deudaId}`);
  revalidatePath(`${DEUDAS_PATH}/resumen`);
  return { ok: true, deudaId };
}

export async function eliminarDeuda(formData: FormData): Promise<ActionResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "deudas",
    "eliminar",
  );
  if (permisoError) return { error: permisoError };

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Deuda no identificada." };

  const { error } = await ctx.supabase
    .from("mm_deudas")
    .update({ deleted_at: new Date().toISOString() })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id);

  if (error) return { error: "No se pudo eliminar la deuda." };

  revalidatePath(DEUDAS_PATH);
  revalidatePath(`${DEUDAS_PATH}/resumen`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Abonos (ledger append-only, mismo criterio que registrarAbono de fiado)
// ---------------------------------------------------------------------------

const abonoSchema = z.object({
  deuda_id: z.string().uuid(),
  monto_usd: z.coerce
    .number({ invalid_type_error: "Monto inválido." })
    .positive("El monto debe ser mayor a cero."),
  metodo: z.enum(["efectivo_bs", "efectivo_usd", "pago_movil", "transferencia", "zelle"], {
    errorMap: () => ({ message: "Selecciona el método de pago." }),
  }),
  /** Solo cuando `metodo` es digital — de qué cuenta bancaria sale el dinero. */
  cuenta_bancaria_id: z.string().uuid().optional().or(z.literal("")),
});

export async function registrarAbonoDeuda(
  _prev: AbonoDeudaResult,
  formData: FormData,
): Promise<AbonoDeudaResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "deudas",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const parsed = abonoSchema.safeParse({
    deuda_id: formData.get("deuda_id"),
    monto_usd: formData.get("monto_usd"),
    metodo: formData.get("metodo"),
    cuenta_bancaria_id: formData.get("cuenta_bancaria_id") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { deuda_id, monto_usd, metodo, cuenta_bancaria_id } = parsed.data;

  const [{ data: deuda }, { data: saldo }, tasa] = await Promise.all([
    ctx.supabase
      .from("mm_deudas")
      .select("descripcion, acreedor, estado")
      .eq("tenant_id", ctx.tenantId)
      .eq("id", deuda_id)
      .is("deleted_at", null)
      .maybeSingle(),
    ctx.supabase
      .from("mm_v_saldo_deuda")
      .select("saldo_usd")
      .eq("deuda_id", deuda_id)
      .maybeSingle(),
    getTasaVigente(ctx.supabase, ctx.tenantId),
  ]);

  if (!deuda) return { error: "Deuda no encontrada." };
  if (!tasa) return { error: "Define la tasa del día antes de registrar un abono." };

  const saldoActual = Number(saldo?.saldo_usd ?? 0);
  if (saldoActual <= 0.001) return { error: "Esta deuda ya está saldada." };
  if (monto_usd > saldoActual + 0.001) {
    return {
      error: `El abono ($${monto_usd.toFixed(2)}) supera el saldo pendiente ($${saldoActual.toFixed(2)}).`,
    };
  }

  const montoBs = redondear(monto_usd * tasa.valor);

  // Un abono real SIEMPRE debe poder salir de Caja o de una cuenta bancaria —
  // mismo criterio que ya usan Gastos/Compras/Otros-ingresos (CLAUDE.md regla
  // crítica #1): si no hay caja abierta o la cuenta no es válida, se bloquea
  // el abono completo en vez de dejarlo sin su contraparte de dinero real.
  let sesionId: string | null = null;
  let cuentaId: string | null = null;
  if (esEfectivo(metodo)) {
    const { activa: sucursalActiva } = await getSucursalActiva(
      ctx.supabase,
      ctx.tenantId,
      ctx.userId,
    );
    if (!sucursalActiva) return { error: "No tienes ninguna sucursal asignada." };
    const sesion = await getSesionAbierta(ctx.supabase, ctx.tenantId, sucursalActiva.id);
    if (!sesion) {
      return { error: "Debes tener la caja abierta para registrar un abono en efectivo." };
    }
    sesionId = sesion.id;
  } else if (esMetodoConCuenta(metodo)) {
    const cuentaRes = await resolverCuentaAbono(
      ctx.supabase,
      ctx.tenantId,
      metodo,
      cuenta_bancaria_id,
    );
    if ("error" in cuentaRes) return { error: cuentaRes.error };
    cuentaId = cuentaRes.cuentaId;
  }

  const { data: abono, error: abonoError } = await ctx.supabase
    .from("mm_abonos_deuda")
    .insert({
      tenant_id: ctx.tenantId,
      deuda_id,
      monto_usd: redondear(monto_usd),
      monto_bs: montoBs,
      tasa_usada: tasa.valor,
      metodo,
      usuario_id: ctx.userId,
    })
    .select("id")
    .single();

  if (abonoError || !abono) return { error: "No se pudo registrar el abono. Inténtalo de nuevo." };

  const motivo = `Abono a deuda: ${deuda.descripcion}`;
  if (sesionId) {
    const montoCaja = metodo === "efectivo_usd" ? monto_usd : montoBs;
    const monedaCaja = metodo === "efectivo_usd" ? "USD" : "VES";
    const { error: errorCaja } = await insertarMovimientoCaja(ctx.supabase, {
      tenantId: ctx.tenantId,
      sesionId,
      tipo: "egreso",
      monto: redondear(montoCaja),
      moneda: monedaCaja,
      motivo,
      referencia: abono.id,
      usuarioId: ctx.userId,
    });
    if (errorCaja) {
      // El egreso de caja es obligatorio para un abono en efectivo — si
      // falla, se revierte el abono para no dejarlo "flotando" sin su
      // contraparte real en caja (mismo criterio que Gastos).
      await ctx.supabase.from("mm_abonos_deuda").delete().eq("id", abono.id);
      return { error: "No se pudo registrar el egreso en caja. El abono no se guardó." };
    }
    revalidatePath(CAJA_PATH);
  } else if (cuentaId) {
    const { error: errorCuenta } = await insertarMovimientoCuenta(ctx.supabase, {
      tenantId: ctx.tenantId,
      cuentaId,
      tipo: "egreso",
      montoUsd: redondear(monto_usd),
      montoBs: redondear(montoBs),
      tasaUsada: tasa.valor,
      motivo,
      referencia: abono.id,
      usuarioId: ctx.userId,
    });
    if (errorCuenta) {
      // Mismo criterio que el egreso de caja: si falla, se revierte el
      // abono para no dejarlo sin su contraparte en la cuenta bancaria.
      await ctx.supabase.from("mm_abonos_deuda").delete().eq("id", abono.id);
      return {
        error: "No se pudo registrar el egreso en la cuenta bancaria. El abono no se guardó.",
      };
    }
    revalidatePath(BANCOS_PATH, "layout");
  }

  const saldoNuevo = redondear(Math.max(0, saldoActual - monto_usd));
  if (saldoNuevo <= 0.001) {
    await ctx.supabase
      .from("mm_deudas")
      .update({ estado: "pagada" })
      .eq("tenant_id", ctx.tenantId)
      .eq("id", deuda_id);
  }

  revalidatePath(DEUDAS_PATH);
  revalidatePath(`${DEUDAS_PATH}/${deuda_id}`);
  revalidatePath(`${DEUDAS_PATH}/abonar`);
  revalidatePath(`${DEUDAS_PATH}/resumen`);
  revalidatePath("/minimarket/reportes/ganancias");

  return {
    ok: true,
    recibo: {
      descripcion: deuda.descripcion,
      acreedor: deuda.acreedor,
      montoUsd: redondear(monto_usd),
      montoBs,
      metodo: METODOS_ABONO.find((m) => m.value === metodo)?.label ?? metodo,
      tasa: tasa.valor,
      saldoAnterior: saldoActual,
      saldoNuevo,
      fecha: new Date().toISOString(),
    },
  };
}
