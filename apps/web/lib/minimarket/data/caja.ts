/**
 * Capa de datos de Caja. El efectivo esperado se DERIVA del monto inicial más
 * los movimientos del turno (ledger append-only), nunca de un contador editable.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MmCajaMovTipo, MmCajaSesion } from "@arkiteq/db";

type Client = SupabaseClient<Database>;

export interface MovimientoCaja {
  id: string;
  tipo: MmCajaMovTipo;
  monto: number;
  moneda: string;
  motivo: string | null;
  created_at: string;
}

export interface ResumenCaja {
  esperadoUsd: number;
  esperadoBs: number;
  ingresosUsd: number;
  ingresosBs: number;
  egresosUsd: number;
  egresosBs: number;
  ventasUsd: number;
  ventasBs: number;
}

/** Sesión de caja abierta del tenant, o null si no hay ninguna. */
export async function getSesionAbierta(
  client: Client,
  tenantId: string,
): Promise<MmCajaSesion | null> {
  const { data, error } = await client
    .from("mm_caja_sesiones")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("estado", "abierta")
    .is("deleted_at", null)
    .order("abierta_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`No se pudo cargar la caja: ${error.message}`);
  return data;
}

/** Movimientos de una sesión de caja, más recientes primero. */
export async function listMovimientosCaja(
  client: Client,
  tenantId: string,
  sesionId: string,
): Promise<MovimientoCaja[]> {
  const { data, error } = await client
    .from("mm_caja_movimientos")
    .select("id, tipo, monto, moneda, motivo, created_at")
    .eq("tenant_id", tenantId)
    .eq("sesion_id", sesionId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`No se pudieron cargar los movimientos de caja: ${error.message}`);
  return (data ?? []).map((m) => ({ ...m, monto: Number(m.monto) }));
}

/**
 * Solo necesita los montos iniciales, no la fila completa — así también se
 * puede recalcular en el cliente (offline) sin depender del tipo generado de
 * Postgres.
 */
type SesionMontosIniciales = Pick<MmCajaSesion, "monto_inicial_usd" | "monto_inicial_bs">;

/** Calcula el efectivo esperado por moneda a partir del inicial + movimientos. */
export function resumirCaja(
  sesion: SesionMontosIniciales,
  movimientos: MovimientoCaja[],
): ResumenCaja {
  const r: ResumenCaja = {
    esperadoUsd: Number(sesion.monto_inicial_usd),
    esperadoBs: Number(sesion.monto_inicial_bs),
    ingresosUsd: 0,
    ingresosBs: 0,
    egresosUsd: 0,
    egresosBs: 0,
    ventasUsd: 0,
    ventasBs: 0,
  };

  for (const m of movimientos) {
    const esUsd = m.moneda === "USD";
    const suma = m.tipo === "ingreso" || m.tipo === "venta";
    const monto = Math.abs(m.monto);

    if (suma) {
      if (esUsd) r.esperadoUsd += monto;
      else r.esperadoBs += monto;
      if (m.tipo === "venta") {
        if (esUsd) r.ventasUsd += monto;
        else r.ventasBs += monto;
      } else if (esUsd) r.ingresosUsd += monto;
      else r.ingresosBs += monto;
    } else {
      // egreso o retiro
      if (esUsd) r.esperadoUsd -= monto;
      else r.esperadoBs -= monto;
      if (esUsd) r.egresosUsd += monto;
      else r.egresosBs += monto;
    }
  }

  return r;
}

export interface NuevoMovimientoCaja {
  tenantId: string;
  sesionId: string;
  tipo: MmCajaMovTipo;
  monto: number;
  moneda: "USD" | "VES";
  motivo?: string | null;
  /** Enlaza el movimiento con la operación que lo originó (venta, gasto, etc.), igual patrón que ya usa Ventas con `referencia = venta.id`. */
  referencia?: string | null;
  usuarioId: string;
}

/**
 * Inserto único de un movimiento de caja — el mismo mecanismo que ya usa
 * `registrarMovimientoCaja` (caja/actions.ts) y el registro de ventas
 * (ventas/actions.ts), extraído aquí para que Gastos lo reutilice sin
 * reimplementar el insert.
 */
export async function insertarMovimientoCaja(
  client: Client,
  mov: NuevoMovimientoCaja,
): Promise<{ error: string | null }> {
  const { error } = await client.from("mm_caja_movimientos").insert({
    tenant_id: mov.tenantId,
    sesion_id: mov.sesionId,
    tipo: mov.tipo,
    monto: mov.monto,
    moneda: mov.moneda,
    motivo: mov.motivo ?? null,
    referencia: mov.referencia ?? null,
    usuario_id: mov.usuarioId,
  });
  return { error: error ? error.message : null };
}

interface MovimientoCajaGasto {
  id: string;
  sesion_id: string;
  tipo: MmCajaMovTipo;
  monto: number;
  moneda: string;
}

/** Movimientos de caja generados por un gasto operativo (referencia = gasto.id). */
async function listMovimientosCajaDeGasto(
  client: Client,
  tenantId: string,
  gastoId: string,
): Promise<MovimientoCajaGasto[]> {
  const { data, error } = await client
    .from("mm_caja_movimientos")
    .select("id, sesion_id, tipo, monto, moneda")
    .eq("tenant_id", tenantId)
    .eq("referencia", gastoId);

  if (error) throw new Error(`No se pudieron cargar los movimientos del gasto: ${error.message}`);
  return (data ?? []).map((m) => ({ ...m, monto: Number(m.monto) }));
}

export interface ImpactoCajaGasto {
  /** Sesión de caja a la que pertenecen los movimientos de este gasto (comparten una sola). */
  sesionId: string | null;
  /** ¿Esa sesión sigue abierta? `true` (sin restricción) si el gasto nunca tocó caja. */
  sesionAbierta: boolean;
  /** Monto neto que este gasto tiene reflejado hoy en caja, por moneda (egresos − reversos previos). */
  neto: { moneda: "USD" | "VES"; monto: number }[];
}

/**
 * Estado actual del impacto de un gasto en caja: en qué sesión quedó y si
 * esa sesión sigue abierta (solo mientras siga abierta se puede editar el
 * monto/método de un gasto en efectivo o eliminarlo revirtiendo su egreso —
 * tocar una sesión ya cerrada/arqueada rompería ese cierre, ver CLAUDE.md
 * regla 18).
 */
export async function getImpactoCajaGasto(
  client: Client,
  tenantId: string,
  gastoId: string,
): Promise<ImpactoCajaGasto> {
  const movimientos = await listMovimientosCajaDeGasto(client, tenantId, gastoId);
  const primero = movimientos[0];
  if (!primero) {
    return { sesionId: null, sesionAbierta: true, neto: [] };
  }

  const sesionId = primero.sesion_id;
  const abierta = await getSesionAbierta(client, tenantId);

  const netoMap = new Map<string, number>();
  for (const m of movimientos) {
    const signo = m.tipo === "egreso" ? 1 : m.tipo === "ingreso" ? -1 : 0;
    if (signo === 0) continue;
    netoMap.set(m.moneda, (netoMap.get(m.moneda) ?? 0) + signo * m.monto);
  }
  const neto = [...netoMap.entries()]
    .map(([moneda, monto]) => ({
      moneda: moneda as "USD" | "VES",
      monto: Math.round(monto * 100) / 100,
    }))
    .filter((r) => Math.abs(r.monto) > 0.001);

  return { sesionId, sesionAbierta: abierta?.id === sesionId, neto };
}

export interface SesionHistorial {
  id: string;
  abierta_en: string;
  cerrada_en: string | null;
  monto_final_usd: number | null;
  monto_final_bs: number | null;
  diferencia_usd: number | null;
  diferencia_bs: number | null;
}

/** Historial de sesiones cerradas del tenant. */
export async function listSesionesCerradas(
  client: Client,
  tenantId: string,
  limit = 20,
): Promise<SesionHistorial[]> {
  const { data, error } = await client
    .from("mm_caja_sesiones")
    .select(
      "id, abierta_en, cerrada_en, monto_final_usd, monto_final_bs, diferencia_usd, diferencia_bs",
    )
    .eq("tenant_id", tenantId)
    .eq("estado", "cerrada")
    .is("deleted_at", null)
    .order("cerrada_en", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`No se pudo cargar el historial de caja: ${error.message}`);
  return data ?? [];
}
