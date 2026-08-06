/**
 * Capa de datos del módulo Bancos. El saldo de una cuenta se DERIVA siempre
 * del ledger append-only `mm_cuenta_movimientos`, sumado en código (mismo
 * criterio que `resumirCaja` en `data/caja.ts`), nunca de un contador
 * editable ni de un campo aparte que pueda desincronizarse.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MmCajaMovTipo, MmCuentaBancaria, MmMetodoPago } from "@arkiteq/db";
import { esMetodoConCuenta, monedaNativaCuenta } from "@/lib/minimarket/bancos";

type Client = SupabaseClient<Database>;

/** Cuentas bancarias activas del tenant, agrupables por método en la UI. */
export async function listCuentasBancarias(
  client: Client,
  tenantId: string,
): Promise<MmCuentaBancaria[]> {
  const { data, error } = await client
    .from("mm_cuentas_bancarias")
    .select("*")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("metodo", { ascending: true })
    .order("predeterminada", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`No se pudieron cargar las cuentas bancarias: ${error.message}`);
  return data ?? [];
}

/** La cuenta predeterminada de un método, o la primera disponible si ninguna
 * está marcada (no debería pasar por el índice único, pero es defensivo). */
export function getCuentaPredeterminada(
  cuentas: MmCuentaBancaria[],
  metodo: MmMetodoPago,
): MmCuentaBancaria | null {
  if (!esMetodoConCuenta(metodo)) return null;
  const delMetodo = cuentas.filter((c) => c.metodo === metodo && c.activa);
  return delMetodo.find((c) => c.predeterminada) ?? delMetodo[0] ?? null;
}

export interface CuentaConSaldo extends MmCuentaBancaria {
  /** Saldo derivado sumando `monto_usd` del ledger — moneda nativa solo para
   * Zelle. Para el resto de los métodos es un dato de referencia, NUNCA el
   * saldo a mostrar (ver `saldoNativo`). */
  saldo_usd: number;
  /** Saldo derivado sumando `monto_bs` del ledger — moneda nativa para
   * pago móvil/transferencia/tarjeta/Cashea. Para Zelle es solo referencia. */
  saldo_bs: number;
}

/** `venta`/`ingreso` suman al saldo, `egreso`/`retiro` restan — mismo
 * criterio que `resumirCaja` (`data/caja.ts`) ya usa para Caja. */
function signoMovimiento(tipo: MmCajaMovTipo): 1 | -1 | 0 {
  if (tipo === "venta" || tipo === "ingreso") return 1;
  if (tipo === "egreso" || tipo === "retiro") return -1;
  return 0;
}

/**
 * Cuentas activas con su saldo actual — sumado DIRECTO de
 * `mm_cuenta_movimientos` en código (no de una vista SQL aparte, que puede
 * quedar desincronizada del código si una migración no llegó a aplicarse:
 * eso fue justo lo que dejó el saldo en 0 con movimientos reales en el
 * historial). Un solo query trae todos los movimientos del tenant y se
 * agrupan por cuenta — misma tabla que ya lee `listMovimientosCuenta`, así
 * que el saldo y el historial nunca pueden desincronizarse entre sí.
 */
export async function listCuentasConSaldo(
  client: Client,
  tenantId: string,
): Promise<CuentaConSaldo[]> {
  const [cuentas, movimientosRes] = await Promise.all([
    listCuentasBancarias(client, tenantId),
    client
      .from("mm_cuenta_movimientos")
      .select("cuenta_id, tipo, monto_usd, monto_bs")
      .eq("tenant_id", tenantId),
  ]);

  if (movimientosRes.error) {
    throw new Error(
      `No se pudieron cargar los movimientos de las cuentas bancarias: ${movimientosRes.error.message}`,
    );
  }

  const saldoMap = new Map<string, { usd: number; bs: number }>();
  for (const m of movimientosRes.data ?? []) {
    const signo = signoMovimiento(m.tipo);
    if (signo === 0) continue;
    const acumulado = saldoMap.get(m.cuenta_id) ?? { usd: 0, bs: 0 };
    acumulado.usd += signo * Number(m.monto_usd);
    acumulado.bs += signo * Number(m.monto_bs);
    saldoMap.set(m.cuenta_id, acumulado);
  }

  return cuentas.map((c) => {
    const saldo = saldoMap.get(c.id) ?? { usd: 0, bs: 0 };
    return {
      ...c,
      saldo_usd: Math.round(saldo.usd * 100) / 100,
      saldo_bs: Math.round(saldo.bs * 100) / 100,
    };
  });
}

/**
 * El ÚNICO saldo que debe mostrarse de una cuenta: su moneda nativa fija
 * (`monedaNativaCuenta`), tomado directo del ledger — NUNCA reconvertido con
 * la tasa vigente. Corrige el bug donde el saldo en Bs de pago móvil/
 * transferencia/tarjeta/Cashea "crecía" al subir el dólar porque se mostraba
 * `saldo_usd * tasaDeHoy` en vez del monto real en bolívares acumulado.
 */
export function saldoNativo(cuenta: CuentaConSaldo): { monto: number; moneda: "USD" | "VES" } {
  if (!esMetodoConCuenta(cuenta.metodo)) return { monto: cuenta.saldo_usd, moneda: "USD" };
  const moneda = monedaNativaCuenta(cuenta.metodo);
  return { monto: moneda === "USD" ? cuenta.saldo_usd : cuenta.saldo_bs, moneda };
}

export interface MovimientoCuenta {
  id: string;
  tipo: MmCajaMovTipo;
  monto_usd: number;
  monto_bs: number;
  tasa_usada: number | null;
  motivo: string | null;
  referencia: string | null;
  created_at: string;
}

/** Historial de una cuenta, más reciente primero. */
export async function listMovimientosCuenta(
  client: Client,
  tenantId: string,
  cuentaId: string,
  limit = 100,
): Promise<MovimientoCuenta[]> {
  const { data, error } = await client
    .from("mm_cuenta_movimientos")
    .select("id, tipo, monto_usd, monto_bs, tasa_usada, motivo, referencia, created_at")
    .eq("tenant_id", tenantId)
    .eq("cuenta_id", cuentaId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`No se pudo cargar el historial de la cuenta: ${error.message}`);
  return (data ?? []).map((m) => ({
    ...m,
    monto_usd: Number(m.monto_usd),
    monto_bs: Number(m.monto_bs),
    tasa_usada: m.tasa_usada === null ? null : Number(m.tasa_usada),
  }));
}

export interface NuevoMovimientoCuenta {
  tenantId: string;
  cuentaId: string;
  tipo: MmCajaMovTipo;
  montoUsd: number;
  montoBs: number;
  tasaUsada?: number | null;
  motivo?: string | null;
  /** Enlaza el movimiento con la venta que lo originó, igual patrón que `mm_caja_movimientos.referencia`. */
  referencia?: string | null;
  usuarioId: string;
}

/**
 * Inserto único de un movimiento de cuenta — reutilizado por el registro
 * automático de ventas/vueltos (`ventas/actions.ts`) y por los movimientos
 * manuales del módulo Bancos (`bancos/actions.ts`), igual mecanismo que
 * `insertarMovimientoCaja` en `data/caja.ts`.
 */
export async function insertarMovimientoCuenta(
  client: Client,
  mov: NuevoMovimientoCuenta,
): Promise<{ error: string | null }> {
  const { error } = await client.from("mm_cuenta_movimientos").insert({
    tenant_id: mov.tenantId,
    cuenta_id: mov.cuentaId,
    tipo: mov.tipo,
    monto_usd: mov.montoUsd,
    monto_bs: mov.montoBs,
    tasa_usada: mov.tasaUsada ?? null,
    motivo: mov.motivo ?? null,
    referencia: mov.referencia ?? null,
    usuario_id: mov.usuarioId,
  });
  return { error: error ? error.message : null };
}

export interface ImpactoCuentaReferencia {
  cuentaId: string;
  /** Egresos menos ingresos ya registrados en esta cuenta para esta referencia. */
  netoUsd: number;
  netoBs: number;
}

/**
 * Neto ya reflejado en Bancos para una operación de origen (`referencia` =
 * id de un gasto, un otro-ingreso, etc.), agrupado por cuenta — puede haber
 * más de una si el usuario cambió de cuenta entre ediciones. Deliberadamente
 * GENÉRICA (no ligada a "gasto"): la reutilizan tanto Gastos operativos
 * (egreso) como Otros ingresos (ingreso) para revertir/reemitir su movimiento
 * al editar o eliminar, mismo criterio que ya usa `getImpactoCajaGasto`
 * (`data/caja.ts`) para Caja — a diferencia de Caja, Bancos no tiene concepto
 * de "sesión cerrada": el ledger de una cuenta siempre está abierto, así que
 * no hay ningún bloqueo análogo que devolver aquí.
 */
export async function getImpactoCuentaPorReferencia(
  client: Client,
  tenantId: string,
  referenciaId: string,
): Promise<ImpactoCuentaReferencia[]> {
  const { data, error } = await client
    .from("mm_cuenta_movimientos")
    .select("cuenta_id, tipo, monto_usd, monto_bs")
    .eq("tenant_id", tenantId)
    .eq("referencia", referenciaId);

  if (error) {
    throw new Error(`No se pudo calcular el impacto en la cuenta: ${error.message}`);
  }

  const netoMap = new Map<string, { usd: number; bs: number }>();
  for (const m of data ?? []) {
    const signo = signoNeto(m.tipo);
    if (signo === 0) continue;
    const acumulado = netoMap.get(m.cuenta_id) ?? { usd: 0, bs: 0 };
    acumulado.usd += signo * Number(m.monto_usd);
    acumulado.bs += signo * Number(m.monto_bs);
    netoMap.set(m.cuenta_id, acumulado);
  }

  return [...netoMap.entries()]
    .map(([cuentaId, n]) => ({
      cuentaId,
      netoUsd: Math.round(n.usd * 100) / 100,
      netoBs: Math.round(n.bs * 100) / 100,
    }))
    .filter((r) => Math.abs(r.netoUsd) > 0.001 || Math.abs(r.netoBs) > 0.001);
}

/** `egreso` suma al neto (dinero que salió, hay que reponerlo), `ingreso`
 * resta (dinero que entró, hay que restarlo si se revierte) — mismo signo
 * que usa `getImpactoCajaGasto` para caja, aplicado aquí por cuenta. */
function signoNeto(tipo: MmCajaMovTipo): 1 | -1 | 0 {
  if (tipo === "egreso") return 1;
  if (tipo === "ingreso") return -1;
  return 0;
}
