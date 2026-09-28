import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MmMetodoPago } from "@arkiteq/db";
import { esMetodoConCuenta, monedaNativaMetodoPago } from "@/lib/minimarket/bancos";
import { getTasaParaFecha } from "@/lib/minimarket/exchange-rate";

type Client = SupabaseClient<Database>;

/**
 * Monto EXACTO, en la moneda nativa de su método, que un gasto/otro-ingreso
 * ya tiene reflejado en Caja o Bancos (neto del ledger, en valor absoluto).
 * Es la fuente de verdad para precargar el formulario de edición y para
 * decidir si el usuario realmente cambió el monto — nunca reconvertir
 * `monto_usd` con otra tasa, que daría un falso "cambió el monto" y
 * reemitiría el movimiento con un valor distinto (CLAUDE.md punto 6).
 *
 * Solo si no hay ledger del cual leerlo (registro sin caja/cuenta), cae a
 * `monto_usd` convertido con la tasa congelada de SU fecha — mismo criterio
 * con que se calculó al guardarlo (`null` si no hay tasa para convertirlo).
 */
export async function getMontoNativoRegistrado(
  client: Client,
  tenantId: string,
  registro: { metodo_pago: MmMetodoPago; monto_usd: number; fecha: string },
  netoCaja: { moneda: "USD" | "VES"; monto: number }[],
  netoCuenta: { netoUsd: number; netoBs: number }[],
): Promise<number | null> {
  const moneda = monedaNativaMetodoPago(registro.metodo_pago);
  const esCaja = registro.metodo_pago === "efectivo_usd" || registro.metodo_pago === "efectivo_bs";

  if (esCaja) {
    const n = netoCaja.find((r) => r.moneda === moneda);
    if (n) return Math.abs(n.monto);
  } else if (esMetodoConCuenta(registro.metodo_pago) && netoCuenta.length === 1) {
    const [n] = netoCuenta as [{ netoUsd: number; netoBs: number }];
    const valor = Math.abs(moneda === "USD" ? n.netoUsd : n.netoBs);
    if (valor > 0.001) return valor;
  }

  const usd = Number(registro.monto_usd);
  if (moneda === "USD") return usd;
  const tasa = await getTasaParaFecha(client, tenantId, registro.fecha);
  if (!tasa || tasa.valor <= 0) return null;
  return Math.round(usd * tasa.valor * 100) / 100;
}
