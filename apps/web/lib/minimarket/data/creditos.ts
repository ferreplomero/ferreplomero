/**
 * Capa de datos del saldo a favor del cliente (excedente acreditado en una
 * venta). El saldo se DERIVA siempre del ledger append-only
 * `mm_creditos_cliente` (vista `mm_v_saldo_credito_cliente`), nunca de un
 * contador editable — mismo criterio que Fiado, Caja y Bancos.
 *
 * Separado por completo de Fiado (`mm_fiados`/`mm_abonos_fiado`): esto es la
 * relación inversa (el negocio le debe al cliente), nunca se mezclan.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MmCreditoClienteTipo } from "@arkiteq/db";

type Client = SupabaseClient<Database>;

/** Saldo a favor de un cliente (0 si nunca tuvo ninguno). */
export async function getSaldoFavorCliente(
  client: Client,
  tenantId: string,
  clienteId: string,
): Promise<number> {
  const { data } = await client
    .from("mm_v_saldo_credito_cliente")
    .select("saldo_usd")
    .eq("tenant_id", tenantId)
    .eq("cliente_id", clienteId)
    .maybeSingle();
  return Math.round(Number(data?.saldo_usd ?? 0) * 100) / 100;
}

/** Saldo a favor de varios clientes a la vez (para listados, ej. `listClientes`). */
export async function getSaldosFavorClientes(
  client: Client,
  tenantId: string,
  clienteIds: string[],
): Promise<Map<string, number>> {
  if (clienteIds.length === 0) return new Map();
  const { data } = await client
    .from("mm_v_saldo_credito_cliente")
    .select("cliente_id, saldo_usd")
    .eq("tenant_id", tenantId)
    .in("cliente_id", clienteIds);
  return new Map(
    (data ?? []).map((s) => [
      s.cliente_id as string,
      Math.round(Number(s.saldo_usd ?? 0) * 100) / 100,
    ]),
  );
}

export interface MovimientoCredito {
  id: string;
  tipo: MmCreditoClienteTipo;
  monto_usd: number;
  monto_bs: number;
  tasa_usada: number | null;
  motivo: string | null;
  referencia: string | null;
  created_at: string;
}

/** Historial de movimientos de saldo a favor de un cliente, más reciente primero. */
export async function listMovimientosCredito(
  client: Client,
  tenantId: string,
  clienteId: string,
): Promise<MovimientoCredito[]> {
  const { data, error } = await client
    .from("mm_creditos_cliente")
    .select("id, tipo, monto_usd, monto_bs, tasa_usada, motivo, referencia, created_at")
    .eq("tenant_id", tenantId)
    .eq("cliente_id", clienteId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`No se pudo cargar el historial de saldo a favor: ${error.message}`);
  return (data ?? []).map((m) => ({
    ...m,
    monto_usd: Number(m.monto_usd),
    monto_bs: Number(m.monto_bs),
    tasa_usada: m.tasa_usada === null ? null : Number(m.tasa_usada),
  }));
}

export interface NuevoMovimientoCredito {
  tenantId: string;
  clienteId: string;
  tipo: MmCreditoClienteTipo;
  montoUsd: number;
  montoBs: number;
  tasaUsada?: number | null;
  motivo?: string | null;
  referencia?: string | null;
  usuarioId: string;
}

/**
 * Inserto único de un movimiento de saldo a favor — reutilizado por el
 * otorgamiento automático (excedente acreditado, `ventas/actions.ts`) y por
 * el consumo (pago con método `credito_cliente`, mismo archivo), igual
 * mecanismo que `insertarMovimientoCuenta` en `data/bancos.ts`.
 */
export async function insertarMovimientoCredito(
  client: Client,
  mov: NuevoMovimientoCredito,
): Promise<{ error: string | null }> {
  const { error } = await client.from("mm_creditos_cliente").insert({
    tenant_id: mov.tenantId,
    cliente_id: mov.clienteId,
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
