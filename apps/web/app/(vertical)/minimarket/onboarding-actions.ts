"use server";

import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Marca (o reinicia, con `completado = false`) el tour de bienvenida de Arki
 * para el usuario autenticado en su negocio activo. Usa el RPC
 * `set_onboarding_minimarket` (SECURITY DEFINER, ver migración 0029): así
 * cualquier rol operativo puede descartar/completar SU PROPIO tour aunque
 * "memberships_manage" restrinja la escritura normal de `memberships` a
 * propietario/administrador.
 */
export async function marcarOnboardingMinimarket(completado: boolean): Promise<{ ok: boolean }> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_onboarding_minimarket", {
    p_tenant_id: tenantId,
    p_completado: completado,
  });

  return { ok: !error };
}
