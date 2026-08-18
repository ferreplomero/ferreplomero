"use server";

/**
 * Guarda la configuración obligatoria de medios de pago y saldos iniciales
 * (ver migración 0106). Marca como activos los métodos elegidos en
 * `mm_config_negocio.metodos_pago` (sin desactivar los que no forman parte de
 * esta pantalla, ej. "fiado") y registra el saldo declarado de caja y/o cada
 * cuenta bancaria como un "ingreso" normal en el ledger que ya existe
 * (`insertarMovimientoCaja` / `insertarMovimientoCuenta`, sin tocarlos),
 * enlazado a una fila propia en `mm_saldos_iniciales` para que quede
 * identificado como capital inicial y NUNCA como venta o ganancia — mismo
 * patrón que `crearOtroIngreso` (reportes/otros-ingresos/actions.ts).
 *
 * La creación de cuentas bancarias nuevas NO vive aquí: la pantalla reutiliza
 * `CuentasBancariasPanel` (configuracion/cuentas-bancarias-panel.tsx), que ya
 * llama a `crearCuentaBancaria` — esta acción solo valida y usa la cuenta que
 * el usuario ya eligió en el selector.
 */
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { requirePermisoAccion } from "@/lib/minimarket/permisos";
import { getOrCreateConfigId } from "@/lib/minimarket/config-negocio";
import { parseMetodosPago } from "@/lib/minimarket/metodos-pago";
import { monedaNativaCuenta, type MetodoConCuenta } from "@/lib/minimarket/bancos";
import { getSesionAbierta, insertarMovimientoCaja } from "@/lib/minimarket/data/caja";
import { getSucursalActiva } from "@/lib/minimarket/sucursal-acceso";
import { insertarMovimientoCuenta } from "@/lib/minimarket/data/bancos";
import { insertarSaldoInicial, MOTIVO_SALDO_INICIAL } from "@/lib/minimarket/data/saldos-iniciales";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import type { Json, MmMetodoPago } from "@arkiteq/db";

// Cashea no aplica al saldo inicial (regla de negocio) — mismo criterio que
// saldos-iniciales-form.tsx: aunque el cliente nunca debería enviar
// `medio_cashea`, se excluye también aquí para que el servidor lo ignore de
// llegar igual.
const DIGITALES: MetodoConCuenta[] = ["pago_movil", "transferencia", "tarjeta", "zelle"];

export interface SaldosInicialesResult {
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

function numero(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export async function guardarMediosSaldosIniciales(
  _prev: SaldosInicialesResult,
  formData: FormData,
): Promise<SaldosInicialesResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "configuracion",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  const medioEfectivoBs = formData.get("medio_efectivo_bs") === "1";
  const medioEfectivoUsd = formData.get("medio_efectivo_usd") === "1";
  const digitalesSeleccionados = DIGITALES.filter((id) => formData.get(`medio_${id}`) === "1");

  if (!medioEfectivoBs && !medioEfectivoUsd && digitalesSeleccionados.length === 0) {
    return { error: "Selecciona al menos un medio de pago que use tu negocio." };
  }

  // Valida que cada método digital elegido tenga una cuenta bancaria real y
  // válida seleccionada — nunca se deja un método "activo" sin cuenta.
  const cuentaPorMetodo = new Map<MetodoConCuenta, string>();
  for (const id of digitalesSeleccionados) {
    const cuentaId = (formData.get(`cuenta_${id}`) as string | null)?.trim();
    if (!cuentaId) {
      return {
        error: "Selecciona o crea una cuenta bancaria para cada medio de pago digital elegido.",
        fieldErrors: { [`cuenta_${id}`]: "Elige o crea una cuenta." },
      };
    }
    const { data: cuenta } = await ctx.supabase
      .from("mm_cuentas_bancarias")
      .select("id, metodo")
      .eq("tenant_id", ctx.tenantId)
      .eq("id", cuentaId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!cuenta || cuenta.metodo !== id) {
      return {
        error: "Una de las cuentas seleccionadas no es válida.",
        fieldErrors: { [`cuenta_${id}`]: "Cuenta inválida." },
      };
    }
    cuentaPorMetodo.set(id, cuentaId);
  }

  const configId = await getOrCreateConfigId(ctx);
  if (!configId) return { error: "No se pudo acceder a la configuración." };

  // Efectivo: requiere caja abierta (se auto-abre al aprovisionar el negocio;
  // si por algún motivo no hay ninguna, se bloquea igual que un otro-ingreso
  // en efectivo, en vez de dejar un saldo "fantasma" que nunca entró a la
  // gaveta — ver crearOtroIngreso en reportes/otros-ingresos/actions.ts).
  if (medioEfectivoBs || medioEfectivoUsd) {
    const { activa: sucursalActiva } = await getSucursalActiva(
      ctx.supabase,
      ctx.tenantId,
      ctx.userId,
    );
    if (!sucursalActiva) {
      return { error: "No tienes ninguna sucursal asignada." };
    }
    const sesion = await getSesionAbierta(ctx.supabase, ctx.tenantId, sucursalActiva.id);
    if (!sesion) {
      return {
        error:
          "Debes tener la caja abierta para declarar el saldo inicial en efectivo. Ábrela en Caja y vuelve a intentarlo.",
      };
    }

    if (medioEfectivoBs) {
      const montoBs = redondear(numero(formData.get("saldo_efectivo_bs")));
      if (montoBs > 0) {
        const { id: saldoId, error } = await insertarSaldoInicial(ctx.supabase, {
          tenantId: ctx.tenantId,
          destino: "caja",
          montoUsd: 0,
          montoBs,
          usuarioId: ctx.userId,
        });
        if (error || !saldoId) return { error: "No se pudo registrar el saldo inicial en Bs." };
        const { error: errMov } = await insertarMovimientoCaja(ctx.supabase, {
          tenantId: ctx.tenantId,
          sesionId: sesion.id,
          tipo: "ingreso",
          monto: montoBs,
          moneda: "VES",
          motivo: MOTIVO_SALDO_INICIAL,
          referencia: saldoId,
          usuarioId: ctx.userId,
        });
        if (errMov) return { error: "No se pudo registrar el saldo inicial en caja (Bs)." };
      }
    }

    if (medioEfectivoUsd) {
      const montoUsd = redondear(numero(formData.get("saldo_efectivo_usd")));
      if (montoUsd > 0) {
        const { id: saldoId, error } = await insertarSaldoInicial(ctx.supabase, {
          tenantId: ctx.tenantId,
          destino: "caja",
          montoUsd,
          montoBs: 0,
          usuarioId: ctx.userId,
        });
        if (error || !saldoId) return { error: "No se pudo registrar el saldo inicial en USD." };
        const { error: errMov } = await insertarMovimientoCaja(ctx.supabase, {
          tenantId: ctx.tenantId,
          sesionId: sesion.id,
          tipo: "ingreso",
          monto: montoUsd,
          moneda: "USD",
          motivo: MOTIVO_SALDO_INICIAL,
          referencia: saldoId,
          usuarioId: ctx.userId,
        });
        if (errMov) return { error: "No se pudo registrar el saldo inicial en caja (USD)." };
      }
    }
  }

  // Cuentas digitales: cada una en su moneda nativa fija (nunca reconvertida).
  let tasaVigente: number | null = null;
  for (const id of digitalesSeleccionados) {
    const cuentaId = cuentaPorMetodo.get(id);
    if (!cuentaId) continue;
    const monto = redondear(numero(formData.get(`saldo_${id}`)));
    if (monto <= 0) continue;

    const moneda = monedaNativaCuenta(id);
    const montoUsd = moneda === "USD" ? monto : 0;
    const montoBs = moneda === "VES" ? monto : 0;

    if (moneda === "VES" && tasaVigente === null) {
      const tasa = await getTasaVigente(ctx.supabase, ctx.tenantId);
      tasaVigente = tasa?.valor ?? null;
    }

    const { id: saldoId, error } = await insertarSaldoInicial(ctx.supabase, {
      tenantId: ctx.tenantId,
      destino: "cuenta_bancaria",
      cuentaId,
      montoUsd,
      montoBs,
      tasaUsada: moneda === "VES" ? tasaVigente : null,
      usuarioId: ctx.userId,
    });
    if (error || !saldoId) {
      return { error: "No se pudo registrar el saldo inicial de una cuenta bancaria." };
    }

    const { error: errMov } = await insertarMovimientoCuenta(ctx.supabase, {
      tenantId: ctx.tenantId,
      cuentaId,
      tipo: "ingreso",
      montoUsd,
      montoBs,
      tasaUsada: moneda === "VES" ? tasaVigente : null,
      motivo: MOTIVO_SALDO_INICIAL,
      referencia: saldoId,
      usuarioId: ctx.userId,
    });
    if (errMov) return { error: "No se pudo registrar el saldo inicial en la cuenta bancaria." };
  }

  // Marca como activos (sin desactivar ninguno) los métodos elegidos aquí, y
  // cierra el paso obligatorio.
  const { data: configActual } = await ctx.supabase
    .from("mm_config_negocio")
    .select("metodos_pago")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", configId)
    .maybeSingle();

  const seleccionados = new Set<MmMetodoPago>([
    ...(medioEfectivoBs ? (["efectivo_bs"] as MmMetodoPago[]) : []),
    ...(medioEfectivoUsd ? (["efectivo_usd"] as MmMetodoPago[]) : []),
    ...digitalesSeleccionados,
  ]);
  const metodosMerge = parseMetodosPago(configActual?.metodos_pago).map((m) =>
    seleccionados.has(m.metodo) ? { ...m, activo: true } : m,
  );

  const { error: errConfig } = await ctx.supabase
    .from("mm_config_negocio")
    .update({
      metodos_pago: metodosMerge as unknown as Json,
      medios_saldos_completados_en: new Date().toISOString(),
    })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", configId);
  if (errConfig) return { error: "No se pudo guardar la configuración de medios de pago." };

  revalidatePath("/minimarket");
  revalidatePath("/minimarket/bancos", "layout");
  revalidatePath("/minimarket/caja");
  revalidatePath("/minimarket/finanzas");
  revalidatePath("/minimarket/reportes/ganancias");
  revalidatePath("/minimarket/configuracion");
  revalidatePath("/minimarket/configuracion/saldos-iniciales");

  return { ok: true };
}
