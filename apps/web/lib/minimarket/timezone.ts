import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@arkiteq/db";
import { getCountryConfig } from "@arkiteq/core";

type Client = SupabaseClient<Database>;

/** Zona horaria por defecto derivada de la capa de país VE. */
export const TZ_DEFAULT = getCountryConfig("VE").defaultTimezone;

export const ZONAS_HORARIAS = [
  { value: "America/Caracas", label: "Venezuela (UTC−4) — Caracas" },
  { value: "America/Bogota", label: "Colombia (UTC−5) — Bogotá" },
  { value: "America/Lima", label: "Perú (UTC−5) — Lima" },
  { value: "America/Panama", label: "Panamá (UTC−5) — Ciudad de Panamá" },
  { value: "America/Mexico_City", label: "México (UTC−6) — Ciudad de México" },
  { value: "America/Santiago", label: "Chile (UTC−4/−3) — Santiago" },
  { value: "America/Buenos_Aires", label: "Argentina (UTC−3) — Buenos Aires" },
  { value: "America/New_York", label: "EE. UU. Este (UTC−5/−4) — New York" },
  { value: "UTC", label: "UTC (sin conversión)" },
] as const;

/** Lee la zona horaria configurada del negocio (en `mm_config_negocio.parametros.timezone`). */
export async function getTimezoneNegocio(client: Client, tenantId: string): Promise<string> {
  const { data } = await client
    .from("mm_config_negocio")
    .select("parametros")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!data?.parametros || typeof data.parametros !== "object" || Array.isArray(data.parametros)) {
    return TZ_DEFAULT;
  }

  const tz = (data.parametros as Record<string, unknown>).timezone;
  return typeof tz === "string" && tz.length > 0 ? tz : TZ_DEFAULT;
}
