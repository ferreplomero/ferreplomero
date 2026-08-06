/**
 * Configuración global de la plataforma (`platform_settings`, fila única) —
 * zona horaria de referencia del admin y datos de contacto/soporte.
 *
 * Nada que ver con `mm_config_negocio.parametros.timezone`, que es la zona
 * horaria propia de CADA negocio para sus operaciones — esta es solo la
 * referencia del panel admin.
 */
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface PlatformSettings {
  timezone: string;
  soporteEmail: string;
  soporteTelefono: string;
  soporteWhatsapp: string;
}

export const PLATFORM_SETTINGS_DEFAULTS: PlatformSettings = {
  timezone: "America/Caracas",
  soporteEmail: "",
  soporteTelefono: "",
  soporteWhatsapp: "",
};

/** Configuración global, cacheada por petición. Si la fila no existe todavía, usa los valores por defecto. */
export const getPlatformSettings = cache(async (): Promise<PlatformSettings> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_settings")
    .select("timezone, soporte_email, soporte_telefono, soporte_whatsapp")
    .eq("id", true)
    .maybeSingle();

  if (!data) return PLATFORM_SETTINGS_DEFAULTS;

  return {
    timezone: data.timezone,
    soporteEmail: data.soporte_email,
    soporteTelefono: data.soporte_telefono,
    soporteWhatsapp: data.soporte_whatsapp,
  };
});
