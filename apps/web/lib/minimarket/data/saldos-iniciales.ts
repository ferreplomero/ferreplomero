/**
 * Capa de datos de "Saldo inicial" (configuración obligatoria de medios de
 * pago y saldos, ver migración 0106). `mm_saldos_iniciales` es un ledger de
 * solo auditoría: identifica qué monto es capital declarado (no una venta ni
 * una ganancia). El movimiento real que sube el saldo esperado de caja o de
 * la cuenta bancaria se hace aparte con `insertarMovimientoCaja` /
 * `insertarMovimientoCuenta` (`data/caja.ts` / `data/bancos.ts`), con
 * `referencia` apuntando a la fila insertada aquí — mismo patrón que
 * `mm_otros_ingresos`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@arkiteq/db";

type Client = SupabaseClient<Database>;

/** Motivo fijo con el que se etiqueta TODO movimiento de caja/cuenta que
 * viene de un saldo inicial — mismo texto sin importar si se declaró desde
 * el asistente de configuración o desde el botón "Saldo inicial" de una
 * cuenta/caja puntual, para que el historial lo identifique siempre igual. */
export const MOTIVO_SALDO_INICIAL = "Saldo inicial declarado";

export type DestinoSaldoInicial = "caja" | "cuenta_bancaria";

export interface NuevoSaldoInicial {
  tenantId: string;
  destino: DestinoSaldoInicial;
  cuentaId?: string | null;
  montoUsd: number;
  montoBs: number;
  tasaUsada?: number | null;
  usuarioId: string;
}

/** Inserta una declaración de saldo inicial (append-only, nunca se edita). */
export async function insertarSaldoInicial(
  client: Client,
  input: NuevoSaldoInicial,
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await client
    .from("mm_saldos_iniciales")
    .insert({
      tenant_id: input.tenantId,
      destino: input.destino,
      cuenta_id: input.cuentaId ?? null,
      monto_usd: input.montoUsd,
      monto_bs: input.montoBs,
      tasa_usada: input.tasaUsada ?? null,
      usuario_id: input.usuarioId,
    })
    .select("id")
    .single();

  return { id: data?.id ?? null, error: error ? error.message : null };
}

export interface SaldoInicialItem {
  id: string;
  destino: DestinoSaldoInicial;
  cuentaId: string | null;
  montoUsd: number;
  montoBs: number;
  createdAt: string;
}

export interface ResumenSaldosIniciales {
  /** Suma de los renglones declarados en USD (Zelle, efectivo USD) — NUNCA
   * incluye montos en Bs convertidos: mismo criterio que Bancos (`data/bancos.ts`),
   * que jamás mezcla una moneda con otra en un solo número. */
  totalUsd: number;
  /** Suma de los renglones declarados en Bs (pago móvil, transferencia,
   * tarjeta, Cashea, efectivo Bs) — moneda nativa fija, nunca reconvertida. */
  totalBs: number;
  items: SaldoInicialItem[];
}

/**
 * Suma histórica TOTAL de saldos iniciales declarados (no filtra por
 * período: es un hecho de capital, no un flujo del negocio). Se usa en
 * Finanzas y Ganancias para mostrarlo identificado, aparte de ventas/gastos.
 *
 * `totalUsd` y `totalBs` se muestran SIEMPRE por separado (nunca blended en
 * un solo número): un saldo declarado en Bs (pago móvil, transferencia,
 * tarjeta, Cashea, efectivo Bs) tiene `montoUsd = 0` a propósito (ver
 * `guardarMediosSaldosIniciales`), así que sumar solo `montoUsd` dejaba esta
 * cifra en $0,00 aunque el dinero sí hubiera subido correctamente en Bancos/
 * Caja — bug corregido aquí, no en el movimiento real (que ya funcionaba).
 */
export async function getResumenSaldosIniciales(
  client: Client,
  tenantId: string,
): Promise<ResumenSaldosIniciales> {
  const { data, error } = await client
    .from("mm_saldos_iniciales")
    .select("id, destino, cuenta_id, monto_usd, monto_bs, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`No se pudieron cargar los saldos iniciales: ${error.message}`);

  const items: SaldoInicialItem[] = (data ?? []).map((s) => ({
    id: s.id,
    destino: s.destino,
    cuentaId: s.cuenta_id,
    montoUsd: Number(s.monto_usd),
    montoBs: Number(s.monto_bs),
    createdAt: s.created_at,
  }));

  return {
    totalUsd: items.reduce((sum, i) => sum + i.montoUsd, 0),
    totalBs: items.reduce((sum, i) => sum + i.montoBs, 0),
    items,
  };
}
