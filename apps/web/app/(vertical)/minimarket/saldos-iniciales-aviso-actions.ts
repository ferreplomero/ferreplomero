"use server";

/**
 * Marca visto el modal de aviso de "configura tus medios de pago y saldo
 * inicial" (independiente de haber completado la configuración de verdad —
 * ver migración 0106 y `MinimarketLayout`). Archivo aparte de
 * `actions.ts` (avisos de bienvenida existentes) para no tocar el tipo
 * `TipoAvisoBienvenida` de ese archivo, que no incluye este caso.
 */
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { moduloPermitido, resolverContextoPermisos } from "@/lib/minimarket/permisos";

export async function marcarAvisoSaldosVistoAction(): Promise<{ ok: boolean }> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { ok: false };

  const supabase = await createClient();
  const permisos = await resolverContextoPermisos(supabase, tenantId, session.user.id);
  if (!moduloPermitido("/minimarket/configuracion", permisos)) return { ok: false };

  const { error } = await supabase
    .from("mm_config_negocio")
    .update({ medios_saldos_aviso_visto_en: new Date().toISOString() })
    .eq("tenant_id", tenantId);

  revalidatePath("/minimarket");
  return { ok: !error };
}
