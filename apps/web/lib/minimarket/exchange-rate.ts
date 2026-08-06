/**
 * Capa de tasa de cambio (Bs/[referencia]) del vertical Minimarket.
 *
 * Tres tasas viven EN PARALELO, cada una con su propio último valor vigente:
 *  - 'bcv'    -> oficial USD del Banco Central (automática).
 *  - 'euro'   -> oficial EUR del Banco Central (automática).
 *  - 'manual' -> "Personalizada / Digital", el comerciante la escribe a mano.
 * `mm_config_negocio.fuente_tasa` guarda cuál de las 3 es la PRESELECCIONADA
 * (afecta todo el sistema por defecto: POS, reportes, tablero). El cajero
 * puede elegir otra puntualmente en el diálogo de cobro de una venta.
 *
 * El historial es append-only (`mm_tasas_cambio`): nunca se edita una tasa,
 * cada tipo simplemente toma su fila más reciente como vigente. Cada venta
 * congela su `tasa_usada`; esta capa solo resuelve tasas VIGENTES para
 * nuevas operaciones, jamás recalcula ventas pasadas.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MmTasaFuente, MmTipoTasa } from "@arkiteq/db";
import { type ExchangeRateSource, getExchangeRateSource } from "@arkiteq/core";

export type { ExchangeRateSource };
export {
  registerExchangeRateSource as registerRateSource,
  getExchangeRateSource as getRateSource,
} from "@arkiteq/core";

type Client = SupabaseClient<Database>;

export type TipoTasa = MmTipoTasa;

export const TIPOS_TASA: readonly TipoTasa[] = ["bcv", "euro", "manual"];

export const TIPO_TASA_LABEL: Record<TipoTasa, string> = {
  bcv: "BCV (oficial)",
  euro: "Euro BCV (oficial)",
  manual: "Personalizada / Digital",
};

export function esTipoTasa(v: string | null | undefined): v is TipoTasa {
  return !!v && (TIPOS_TASA as readonly string[]).includes(v);
}

/** Toda tasa se guarda con SOLO 2 decimales (Bs por unidad), sin importar los decimales que traiga la fuente. */
function redondearTasa(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** Una de las 3 tasas vigentes. */
export interface TasaVigente {
  valor: number;
  fuente: MmTasaFuente;
  fecha: string;
  created_at: string;
}

/** Última fila registrada para un tipo de tasa específico, o null si nunca se registró. */
export async function getTasaPorTipo(
  client: Client,
  tenantId: string,
  tipo: TipoTasa,
): Promise<TasaVigente | null> {
  const { data } = await client
    .from("mm_tasas_cambio")
    .select("valor, fuente, fecha, created_at")
    .eq("tenant_id", tenantId)
    .eq("tipo", tipo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    valor: Number(data.valor),
    fuente: data.fuente,
    fecha: data.fecha,
    created_at: data.created_at,
  };
}

/** Las 3 tasas vigentes en paralelo (cada una con su último valor conocido, o null). */
export async function getTodasLasTasas(
  client: Client,
  tenantId: string,
): Promise<Record<TipoTasa, TasaVigente | null>> {
  const [bcv, euro, manual] = await Promise.all([
    getTasaPorTipo(client, tenantId, "bcv"),
    getTasaPorTipo(client, tenantId, "euro"),
    getTasaPorTipo(client, tenantId, "manual"),
  ]);
  return { bcv, euro, manual };
}

/** Tipo de tasa preseleccionado del negocio (mm_config_negocio.fuente_tasa), validado. */
export async function getTipoPreferido(client: Client, tenantId: string): Promise<TipoTasa> {
  const { data } = await client
    .from("mm_config_negocio")
    .select("fuente_tasa")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return esTipoTasa(data?.fuente_tasa) ? data.fuente_tasa : "bcv";
}

/**
 * Resuelve la tasa vigente por defecto del sistema: la del tipo preseleccionado
 * en Configuración. Devuelve null si ese tipo nunca se registró.
 */
export async function getTasaVigente(
  client: Client,
  tenantId: string,
): Promise<TasaVigente | null> {
  const tipo = await getTipoPreferido(client, tenantId);
  return getTasaPorTipo(client, tenantId, tipo);
}

export interface TasaHistorial {
  id: string;
  fecha: string;
  valor: number;
  fuente: MmTasaFuente;
  tipo: TipoTasa;
  created_at: string;
}

/** Devuelve el historial reciente de tasas del tenant (las 3 tasas mezcladas). */
export async function listTasasRecientes(
  client: Client,
  tenantId: string,
  limit = 30,
): Promise<TasaHistorial[]> {
  const { data, error } = await client
    .from("mm_tasas_cambio")
    .select("id, fecha, valor, fuente, tipo, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`No se pudo cargar el historial de tasas: ${error.message}`);
  return (data ?? []).map((t) => ({ ...t, valor: Number(t.valor) }));
}

export interface SetTasaManualInput {
  tenantId: string;
  /** Cuál de las 3 tasas está editando a mano (BCV, Euro o Personalizada). */
  tipo: TipoTasa;
  valor: number;
  usuarioId?: string | null;
}

/**
 * Registra un valor escrito A MANO para cualquiera de las 3 tasas
 * (append-only) — el negocio puede sobreescribir el número de BCV o Euro BCV
 * igual que el de Personalizada, sin depender de que la API esté disponible
 * o de que el valor automático le sirva. `fuente` siempre queda "manual" (el
 * origen real del dato), mientras que `tipo` es cuál de las 3 tasas es.
 */
export async function setTasaManual(client: Client, input: SetTasaManualInput): Promise<void> {
  if (!(input.valor > 0)) {
    throw new Error("La tasa debe ser un número mayor que cero.");
  }
  const { error } = await client.from("mm_tasas_cambio").insert({
    tenant_id: input.tenantId,
    valor: redondearTasa(input.valor),
    fuente: "manual",
    tipo: input.tipo,
    usuario_id: input.usuarioId ?? null,
  });
  if (error) throw new Error(`No se pudo guardar la tasa: ${error.message}`);
}

/**
 * Consulta la fuente automática (BCV o Euro) y registra el valor obtenido
 * (append-only) como la nueva tasa vigente de ese tipo.
 */
export async function refreshTasaAuto(
  client: Client,
  tenantId: string,
  tipo: "bcv" | "euro",
): Promise<number | null> {
  const source = getExchangeRateSource(tipo);
  if (!source) return null;

  const bruto = await source.fetchRate();
  if (!(bruto > 0)) {
    throw new Error(`La fuente "${source.key}" devolvió una tasa inválida.`);
  }
  const valor = redondearTasa(bruto);

  const { error } = await client.from("mm_tasas_cambio").insert({
    tenant_id: tenantId,
    valor,
    fuente: "auto",
    tipo,
  });
  if (error) throw new Error(`No se pudo guardar la tasa automática: ${error.message}`);
  return valor;
}
