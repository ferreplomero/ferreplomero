"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { requirePermisoAccion } from "@/lib/minimarket/permisos";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { insertarMovimientoCuenta } from "@/lib/minimarket/data/bancos";
import { esMetodoConCuenta, monedaNativaCuenta } from "@/lib/minimarket/bancos";
import { insertarSaldoInicial, MOTIVO_SALDO_INICIAL } from "@/lib/minimarket/data/saldos-iniciales";
import { getOrCreateConfigId } from "@/lib/minimarket/config-negocio";

const BANCOS_PATH = "/minimarket/bancos";

export interface BancosResult {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function contexto() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id ?? null;
  if (!session || !tenantId) return null;
  const supabase = await createClient();
  return { supabase, tenantId, userId: session.user.id };
}

const movimientoSchema = z.object({
  cuenta_id: z.string().uuid("Cuenta inválida."),
  // 'ingreso' = depósito/ajuste manual (ej. corregir contra el estado de cuenta real);
  // 'retiro' = el dueño sacó dinero de esa cuenta. 'venta'/'egreso' quedan reservados
  // para el registro automático desde una venta (ventas/actions.ts) — nunca manuales.
  tipo: z.enum(["ingreso", "retiro"]),
  // El monto SIEMPRE se teclea en la moneda NATIVA de la cuenta (Bs para
  // pago móvil/transferencia/tarjeta/Cashea, USD para Zelle) — nunca se le
  // pide al usuario convertir mentalmente. Cuál es la nativa se decide del
  // lado del servidor a partir del método real de la cuenta, nunca de un
  // campo que mande el cliente.
  monto: z.coerce.number().positive("El monto debe ser mayor que cero."),
  motivo: z.string().trim().max(200).optional(),
});

/** Registra un depósito/ajuste o un retiro manual en una cuenta bancaria.
 * Puede dejar el saldo en negativo (se avisa en la UI) — nunca se bloquea. */
export async function registrarMovimientoCuentaManual(
  _prev: BancosResult,
  formData: FormData,
): Promise<BancosResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "bancos",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const parsed = movimientoSchema.safeParse({
    cuenta_id: formData.get("cuenta_id"),
    tipo: formData.get("tipo"),
    monto: formData.get("monto"),
    motivo: (formData.get("motivo") as string | null)?.trim() || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const v = parsed.data;

  const { data: cuenta } = await ctx.supabase
    .from("mm_cuentas_bancarias")
    .select("id, metodo")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", v.cuenta_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!cuenta) return { error: "Cuenta bancaria no encontrada." };

  const tasa = await getTasaVigente(ctx.supabase, ctx.tenantId);
  const tasaValor = tasa?.valor ?? 0;

  // La columna de la moneda nativa guarda el monto EXACTO tecleado, fijo para
  // siempre; la otra columna es solo una conversión de referencia a la tasa
  // de hoy — nunca se usa como saldo (ver `saldoNativo` en data/bancos.ts).
  const monedaNativa = esMetodoConCuenta(cuenta.metodo) ? monedaNativaCuenta(cuenta.metodo) : "VES";
  const montoUsd = monedaNativa === "USD" ? v.monto : tasaValor > 0 ? v.monto / tasaValor : 0;
  const montoBs = monedaNativa === "VES" ? v.monto : v.monto * tasaValor;

  const { error } = await insertarMovimientoCuenta(ctx.supabase, {
    tenantId: ctx.tenantId,
    cuentaId: v.cuenta_id,
    tipo: v.tipo,
    montoUsd: Math.round(montoUsd * 100) / 100,
    montoBs: Math.round(montoBs * 100) / 100,
    tasaUsada: tasaValor || null,
    motivo: v.motivo ?? null,
    usuarioId: ctx.userId,
  });
  if (error) return { error: "No se pudo registrar el movimiento." };

  // `"layout"` revalida `bancos/layout.tsx` Y todo lo que cuelga de él (cada
  // tipo bajo /minimarket/bancos/*, no solo esta ruta exacta) — necesario
  // desde que Bancos dejó de ser una sola página.
  revalidatePath(BANCOS_PATH, "layout");
  return { ok: true };
}

const saldoInicialSchema = z.object({
  cuenta_id: z.string().uuid("Cuenta inválida."),
  // Mismo criterio que `movimientoSchema` arriba: el monto SIEMPRE llega en
  // la moneda NATIVA de la cuenta — si el usuario escribió en la otra
  // moneda, el formulario ya lo convirtió con la tasa antes de enviarlo.
  monto: z.coerce.number().positive("El monto debe ser mayor que cero."),
});

/**
 * Declara el saldo/capital inicial de UNA cuenta puntual — distinto de
 * `registrarMovimientoCuentaManual`: no es una operación del día a día, es
 * declarar cuánto tenía la cuenta ANTES de empezar a usar el sistema. Se
 * puede repetir tantas veces como haga falta (cada declaración queda como
 * una fila propia en `mm_saldos_iniciales`, nunca se edita ni se junta con
 * las anteriores) — mismo mecanismo que el asistente de
 * `/minimarket/configuracion/saldos-iniciales`
 * (`guardarMediosSaldosIniciales`), aquí aplicado a una sola cuenta desde su
 * propia pantalla de detalle.
 */
export async function registrarSaldoInicialCuenta(
  _prev: BancosResult,
  formData: FormData,
): Promise<BancosResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "bancos",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const parsed = saldoInicialSchema.safeParse({
    cuenta_id: formData.get("cuenta_id"),
    monto: formData.get("monto"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const v = parsed.data;

  const { data: cuenta } = await ctx.supabase
    .from("mm_cuentas_bancarias")
    .select("id, metodo")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", v.cuenta_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!cuenta) return { error: "Cuenta bancaria no encontrada." };
  // Cashea no aplica al saldo inicial (regla de negocio) — mismo criterio que
  // ya respeta el asistente de `/minimarket/configuracion/saldos-iniciales`
  // (`DIGITALES` en ese archivo excluye Cashea explícitamente); este botón
  // puntual por cuenta no tenía esa misma validación.
  if (cuenta.metodo === "cashea") {
    return { error: "Cashea no aplica para declarar saldo inicial." };
  }

  const tasa = await getTasaVigente(ctx.supabase, ctx.tenantId);
  const tasaValor = tasa?.valor ?? 0;

  const monedaNativa = esMetodoConCuenta(cuenta.metodo) ? monedaNativaCuenta(cuenta.metodo) : "VES";
  const montoUsd = monedaNativa === "USD" ? v.monto : 0;
  const montoBs = monedaNativa === "VES" ? v.monto : 0;

  const { id: saldoId, error: errSaldo } = await insertarSaldoInicial(ctx.supabase, {
    tenantId: ctx.tenantId,
    destino: "cuenta_bancaria",
    cuentaId: v.cuenta_id,
    montoUsd,
    montoBs,
    tasaUsada: monedaNativa === "VES" && tasaValor > 0 ? tasaValor : null,
    usuarioId: ctx.userId,
  });
  if (errSaldo || !saldoId) return { error: "No se pudo registrar el saldo inicial." };

  const { error: errMov } = await insertarMovimientoCuenta(ctx.supabase, {
    tenantId: ctx.tenantId,
    cuentaId: v.cuenta_id,
    tipo: "ingreso",
    montoUsd,
    montoBs,
    tasaUsada: monedaNativa === "VES" && tasaValor > 0 ? tasaValor : null,
    motivo: MOTIVO_SALDO_INICIAL,
    referencia: saldoId,
    usuarioId: ctx.userId,
  });
  if (errMov) return { error: "No se pudo reflejar el saldo inicial en la cuenta." };

  // Si el negocio nunca pasó por el asistente de configuración obligatoria
  // (o lo descartó), declarar un saldo inicial real desde aquí también
  // cuenta como completarlo — dos caminos para el mismo requisito, nunca
  // hace falta pasar por los dos.
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

  revalidatePath(BANCOS_PATH, "layout");
  revalidatePath("/minimarket");
  revalidatePath("/minimarket/finanzas");
  revalidatePath("/minimarket/reportes/ganancias");
  return { ok: true };
}
