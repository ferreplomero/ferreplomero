"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  insertarMovimientoCaja,
  listMovimientosCaja,
  resumirCaja,
} from "@/lib/minimarket/data/caja";
import { requirePermisoAccion } from "@/lib/minimarket/permisos";
import { sucursalesPermitidas } from "@/lib/minimarket/sucursal-acceso";
import { insertarSaldoInicial, MOTIVO_SALDO_INICIAL } from "@/lib/minimarket/data/saldos-iniciales";
import { getOrCreateConfigId } from "@/lib/minimarket/config-negocio";

const CAJA_PATH = "/minimarket/caja";

export interface CajaResult {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const numero = (v: FormDataEntryValue | null): number => Number(String(v ?? "").replace(",", "."));

async function contexto() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id ?? null;
  if (!session || !tenantId) return null;
  const supabase = await createClient();
  const permitidas = await sucursalesPermitidas(supabase, tenantId, session.user.id);
  return { supabase, tenantId, userId: session.user.id, permitidas };
}

/** true si la sesión de caja dada pertenece a una sucursal permitida del usuario. */
async function sesionEnSucursalPermitida(
  ctx: NonNullable<Awaited<ReturnType<typeof contexto>>>,
  sesionId: string,
): Promise<boolean> {
  const { data: sesion } = await ctx.supabase
    .from("mm_caja_sesiones")
    .select("sucursal_id")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", sesionId)
    .maybeSingle();
  return Boolean(sesion) && ctx.permitidas.some((s) => s.id === sesion?.sucursal_id);
}

/** Abre un turno de caja con el efectivo inicial. Falla si ya hay uno abierto. */
export async function abrirCaja(_prev: CajaResult, formData: FormData): Promise<CajaResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "caja",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const inicialUsd = numero(formData.get("monto_inicial_usd"));
  const inicialBs = numero(formData.get("monto_inicial_bs"));
  if (
    !Number.isFinite(inicialUsd) ||
    !Number.isFinite(inicialBs) ||
    inicialUsd < 0 ||
    inicialBs < 0
  ) {
    return { error: "Ingresa montos iniciales válidos (0 o más)." };
  }

  // Igual criterio que `registrarVenta`: nunca se confía en el sucursal_id
  // del cliente sin revalidarlo contra las sucursales permitidas; sin uno
  // explícito, se usa la primera permitida del usuario — nunca "la primera
  // sucursal del tenant" (eso abriría la caja de un cajero en una sucursal
  // ajena a la suya).
  const sucursalIdForm = formData.get("sucursal_id");
  const sucursalIdPedida =
    typeof sucursalIdForm === "string" && sucursalIdForm ? sucursalIdForm : null;
  if (sucursalIdPedida && !ctx.permitidas.some((s) => s.id === sucursalIdPedida)) {
    return { error: "No tienes acceso a esa sucursal." };
  }
  const sucursalId = sucursalIdPedida ?? ctx.permitidas[0]?.id ?? null;
  if (!sucursalId) return { error: "No tienes ninguna sucursal asignada." };

  const { data: abierta } = await ctx.supabase
    .from("mm_caja_sesiones")
    .select("id")
    .eq("tenant_id", ctx.tenantId)
    .eq("sucursal_id", sucursalId)
    .eq("estado", "abierta")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (abierta) {
    return { error: "Ya hay una caja abierta en esta sucursal. Ciérrala antes de abrir otra." };
  }

  const { error } = await ctx.supabase.from("mm_caja_sesiones").insert({
    tenant_id: ctx.tenantId,
    sucursal_id: sucursalId,
    usuario_id: ctx.userId,
    monto_inicial_usd: inicialUsd,
    monto_inicial_bs: inicialBs,
    estado: "abierta",
  });
  if (error) return { error: "No se pudo abrir la caja. Inténtalo de nuevo." };

  revalidatePath(CAJA_PATH);
  return { ok: true };
}

const movimientoSchema = z.object({
  sesion_id: z.string().uuid(),
  tipo: z.enum(["ingreso", "egreso", "retiro"]),
  moneda: z.enum(["USD", "VES"]),
  monto: z.coerce.number().positive("El monto debe ser mayor que cero."),
  motivo: z.string().trim().max(200).optional(),
});

/** Registra un ingreso, egreso o retiro de efectivo en la sesión abierta. */
export async function registrarMovimientoCaja(
  _prev: CajaResult,
  formData: FormData,
): Promise<CajaResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "caja",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const parsed = movimientoSchema.safeParse({
    sesion_id: formData.get("sesion_id"),
    tipo: formData.get("tipo"),
    moneda: formData.get("moneda"),
    monto: formData.get("monto"),
    motivo: typeof formData.get("motivo") === "string" ? formData.get("motivo") : undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const v = parsed.data;

  if (!(await sesionEnSucursalPermitida(ctx, v.sesion_id))) {
    return { error: "No tienes acceso a esa caja." };
  }

  const { error } = await insertarMovimientoCaja(ctx.supabase, {
    tenantId: ctx.tenantId,
    sesionId: v.sesion_id,
    tipo: v.tipo,
    monto: v.monto,
    moneda: v.moneda,
    motivo: v.motivo ?? null,
    usuarioId: ctx.userId,
  });
  if (error) return { error: "No se pudo registrar el movimiento." };

  revalidatePath(CAJA_PATH);
  return { ok: true };
}

const saldoInicialCajaSchema = z.object({
  sesion_id: z.string().uuid(),
  moneda: z.enum(["USD", "VES"]),
  monto: z.coerce.number().positive("El monto debe ser mayor que cero."),
});

/**
 * Declara el saldo/capital inicial en efectivo de la caja abierta — distinto
 * de `registrarMovimientoCaja`: no es un ingreso/egreso del día a día, es
 * declarar cuánto efectivo había ANTES de empezar a usar el sistema. Se
 * puede repetir tantas veces como haga falta (append-only en
 * `mm_saldos_iniciales`) — mismo mecanismo que el asistente de
 * `/minimarket/configuracion/saldos-iniciales`, aquí aplicado directo desde
 * Caja.
 */
export async function registrarSaldoInicialCaja(
  _prev: CajaResult,
  formData: FormData,
): Promise<CajaResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "caja",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const parsed = saldoInicialCajaSchema.safeParse({
    sesion_id: formData.get("sesion_id"),
    moneda: formData.get("moneda"),
    monto: formData.get("monto"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const v = parsed.data;

  if (!(await sesionEnSucursalPermitida(ctx, v.sesion_id))) {
    return { error: "No tienes acceso a esa caja." };
  }

  const { data: sesion } = await ctx.supabase
    .from("mm_caja_sesiones")
    .select("id")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", v.sesion_id)
    .eq("estado", "abierta")
    .maybeSingle();
  if (!sesion) return { error: "La caja no está abierta." };

  const montoUsd = v.moneda === "USD" ? v.monto : 0;
  const montoBs = v.moneda === "VES" ? v.monto : 0;

  const { id: saldoId, error: errSaldo } = await insertarSaldoInicial(ctx.supabase, {
    tenantId: ctx.tenantId,
    destino: "caja",
    montoUsd,
    montoBs,
    usuarioId: ctx.userId,
  });
  if (errSaldo || !saldoId) return { error: "No se pudo registrar el saldo inicial." };

  const { error: errMov } = await insertarMovimientoCaja(ctx.supabase, {
    tenantId: ctx.tenantId,
    sesionId: v.sesion_id,
    tipo: "ingreso",
    monto: v.monto,
    moneda: v.moneda,
    motivo: MOTIVO_SALDO_INICIAL,
    referencia: saldoId,
    usuarioId: ctx.userId,
  });
  if (errMov) return { error: "No se pudo reflejar el saldo inicial en la caja." };

  // Mismo criterio que `registrarSaldoInicialCuenta` (bancos/actions.ts):
  // declarar un saldo inicial real desde Caja también cierra el requisito
  // del asistente de configuración si nunca se completó por ahí.
  const configId = await getOrCreateConfigId(ctx);
  if (configId) {
    const { data: config } = await ctx.supabase
      .from("mm_config_negocio")
      .select("medios_saldos_completados_en")
      .eq("tenant_id", ctx.tenantId)
      .eq("id", configId)
      .maybeSingle();
    if (!config?.medios_saldos_completados_en) {
      await ctx.supabase
        .from("mm_config_negocio")
        .update({ medios_saldos_completados_en: new Date().toISOString() })
        .eq("tenant_id", ctx.tenantId)
        .eq("id", configId);
    }
  }

  revalidatePath(CAJA_PATH);
  revalidatePath("/minimarket");
  revalidatePath("/minimarket/finanzas");
  revalidatePath("/minimarket/reportes/ganancias");
  return { ok: true };
}

/** Cierra el turno: calcula el esperado, lo compara con lo contado (arqueo). */
export async function cerrarCaja(_prev: CajaResult, formData: FormData): Promise<CajaResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "caja",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  const sesionId = String(formData.get("sesion_id") ?? "");
  const finalUsd = numero(formData.get("monto_final_usd"));
  const finalBs = numero(formData.get("monto_final_bs"));
  if (!sesionId) return { error: "Sesión no identificada." };
  if (!Number.isFinite(finalUsd) || !Number.isFinite(finalBs) || finalUsd < 0 || finalBs < 0) {
    return { error: "Ingresa los montos contados (0 o más)." };
  }

  if (!(await sesionEnSucursalPermitida(ctx, sesionId))) {
    return { error: "No tienes acceso a esa caja." };
  }

  const { data: sesion } = await ctx.supabase
    .from("mm_caja_sesiones")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", sesionId)
    .eq("estado", "abierta")
    .maybeSingle();
  if (!sesion) return { error: "La caja ya no está abierta." };

  const movimientos = await listMovimientosCaja(ctx.supabase, ctx.tenantId, sesionId);
  const resumen = resumirCaja(sesion, movimientos);

  const difUsd = Math.round((finalUsd - resumen.esperadoUsd) * 100) / 100;
  const difBs = Math.round((finalBs - resumen.esperadoBs) * 100) / 100;

  const { error } = await ctx.supabase
    .from("mm_caja_sesiones")
    .update({
      estado: "cerrada",
      monto_final_usd: finalUsd,
      monto_final_bs: finalBs,
      diferencia_usd: difUsd,
      diferencia_bs: difBs,
      cerrada_en: new Date().toISOString(),
    })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", sesionId);
  if (error) return { error: "No se pudo cerrar la caja." };

  revalidatePath(CAJA_PATH);
  return { ok: true };
}
