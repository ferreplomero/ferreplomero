"use server";

import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTasaParaFecha } from "@/lib/minimarket/exchange-rate";

export interface TasaFechaResult {
  valor: number;
  fuente: string;
}

/**
 * Tasa a mostrar en el formulario para la fecha elegida por el usuario —
 * histórica si es una fecha pasada, vigente si es hoy (mismo criterio que
 * `getTasaParaFecha`, usado también al guardar). Se consulta desde el
 * cliente cada vez que cambia el campo "fecha" en Otros ingresos/Gastos,
 * para que el usuario vea la tasa REAL que se va a congelar (CLAUDE.md
 * punto 6: mostrar la tasa de ese día en fechas pasadas).
 */
export async function obtenerTasaParaFecha(fecha: string): Promise<TasaFechaResult | null> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id ?? null;
  if (!session || !tenantId) return null;
  const supabase = await createClient();
  const tasa = await getTasaParaFecha(supabase, tenantId, fecha);
  if (!tasa || tasa.valor <= 0) return null;
  return { valor: tasa.valor, fuente: tasa.fuente === "manual" ? "Personalizada" : "Oficial" };
}
