/**
 * Tasa de cambio de PLATAFORMA (`platform_tasas_cambio`) — la que usa el admin
 * para calcular el equivalente en Bs de los planes (USD). Nada que ver con
 * `mm_tasas_cambio` (esa es por-tenant, del minimarket de cada cliente).
 *
 * Dos tasas en paralelo, igual patrón que el minimarket: 'bcv' (automática) y
 * 'manual' (el admin la escribe a mano). `platform_settings.tasa_preferida`
 * dice cuál de las 2 es la vigente. Guardar un valor nuevo y marcar como
 * preferida son SIEMPRE acciones independientes — igual regla que ya se
 * aplicó en el minimarket.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@arkiteq/db";
import { getExchangeRateSource } from "@arkiteq/core";

type Client = SupabaseClient<Database>;

export type TipoTasaPlataforma = "bcv" | "euro" | "manual";

export const TIPOS_TASA_PLATAFORMA: readonly TipoTasaPlataforma[] = ["bcv", "euro", "manual"];

export const TIPO_TASA_PLATAFORMA_LABEL: Record<TipoTasaPlataforma, string> = {
  bcv: "BCV (oficial)",
  euro: "Euro BCV (oficial)",
  manual: "Personalizada / Manual",
};

export interface TasaPlataformaVigente {
  valor: number;
  createdAt: string;
}

/** Toda tasa de plataforma se guarda con SOLO 2 decimales, sin importar los decimales de la fuente. */
function redondearTasa(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** Última fila registrada para un tipo de tasa, o null si nunca se registró. */
export async function getTasaPlataformaPorTipo(
  client: Client,
  tipo: TipoTasaPlataforma,
): Promise<TasaPlataformaVigente | null> {
  const { data } = await client
    .from("platform_tasas_cambio")
    .select("valor, created_at")
    .eq("tipo", tipo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return { valor: Number(data.valor), createdAt: data.created_at };
}

/** Las 3 tasas de plataforma vigentes en paralelo. */
export async function getTodasLasTasasPlataforma(
  client: Client,
): Promise<Record<TipoTasaPlataforma, TasaPlataformaVigente | null>> {
  const [bcv, euro, manual] = await Promise.all([
    getTasaPlataformaPorTipo(client, "bcv"),
    getTasaPlataformaPorTipo(client, "euro"),
    getTasaPlataformaPorTipo(client, "manual"),
  ]);
  return { bcv, euro, manual };
}

/**
 * Tasa vigente por defecto de la plataforma: la del tipo preseleccionado en
 * `platform_settings.tasa_preferida`. `null` si ese tipo nunca se registró
 * (negocio recién montado, antes de que el admin sincronice o escriba algo).
 */
export async function getTasaVigentePlataforma(
  client: Client,
  tipoPreferido: TipoTasaPlataforma,
): Promise<TasaPlataformaVigente | null> {
  return getTasaPlataformaPorTipo(client, tipoPreferido);
}

export interface SetTasaManualPlataformaInput {
  tipo: TipoTasaPlataforma;
  valor: number;
  usuarioId?: string | null;
}

/**
 * Registra un valor escrito A MANO para 'bcv' o 'manual' (append-only). SOLO
 * guarda el valor — no cambia cuál es la preferida (ver
 * `definirFuentePreferidaPlataforma` en las acciones del admin). Requiere
 * `service_role`: no hay política de insert para `authenticated`.
 */
export async function setTasaManualPlataforma(
  client: Client,
  input: SetTasaManualPlataformaInput,
): Promise<void> {
  if (!(input.valor > 0)) {
    throw new Error("La tasa debe ser un número mayor que cero.");
  }
  const { error } = await client.from("platform_tasas_cambio").insert({
    valor: redondearTasa(input.valor),
    fuente: "manual",
    tipo: input.tipo,
    usuario_id: input.usuarioId ?? null,
  });
  if (error) throw new Error(`No se pudo guardar la tasa: ${error.message}`);
}

/**
 * Consulta la fuente automática ('bcv' o 'euro' — reutiliza las mismas
 * fuentes registradas que usa el minimarket, ver `@/lib/minimarket/rate-sources`,
 * y el mismo cron: `/api/cron/tasas` ahora también sincroniza la plataforma)
 * y registra el valor obtenido como la nueva tasa vigente de ese tipo.
 * Requiere `service_role`. IMPORTANTE: quien llame a esta función en el
 * servidor debe importar `"@/lib/minimarket/rate-sources"` como efecto
 * secundario en su propio archivo (no se hace aquí para no arrastrar el
 * módulo `node:https` que usa esa fuente hacia el bundle del cliente — este
 * archivo también se importa por tipos desde componentes "use client").
 */
export async function refreshTasaAutoPlataforma(
  client: Client,
  tipo: "bcv" | "euro",
  usuarioId?: string | null,
): Promise<number> {
  const source = getExchangeRateSource(tipo);
  if (!source) throw new Error(`La fuente "${tipo}" no está registrada.`);

  const bruto = await source.fetchRate();
  if (!(bruto > 0)) throw new Error(`La fuente "${tipo}" devolvió una tasa inválida.`);
  const valor = redondearTasa(bruto);

  const { error } = await client.from("platform_tasas_cambio").insert({
    valor,
    fuente: "auto",
    tipo,
    usuario_id: usuarioId ?? null,
  });
  if (error) throw new Error(`No se pudo guardar la tasa automática: ${error.message}`);
  return valor;
}
