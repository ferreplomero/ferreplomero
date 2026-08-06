"use server";

/**
 * Descarte (por usuario) de un aviso de plataforma en el tablero — distinto
 * de `descartarAvisoAction` en `actions.ts` (avisos de BIENVENIDA/onboarding,
 * otra tabla, otro concepto) — no se toca ese archivo. Inserta en
 * `platform_avisos_descartados`, cuya RLS solo permite a cada usuario
 * autenticado insertar/leer SUS PROPIAS filas (`profile_id = auth.uid()`).
 */
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function descartarAvisoPlataformaAction(avisoId: string): Promise<{ ok: boolean }> {
  const session = await getSessionContext();
  if (!session) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase
    .from("platform_avisos_descartados")
    .insert({ aviso_id: avisoId, profile_id: session.user.id });

  if (error) {
    console.error("[descartarAvisoPlataformaAction]", error);
    return { ok: false };
  }
  return { ok: true };
}
