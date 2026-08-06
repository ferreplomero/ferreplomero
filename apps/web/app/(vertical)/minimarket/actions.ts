"use server";

/**
 * Acciones del tablero del minimarket. Por ahora, solo descartar los avisos
 * de bienvenida (caja en 0, impuestos apagados, medios de pago sin datos) —
 * ver `components/minimarket/tablero/avisos-bienvenida.tsx`. Son tips, no
 * configuración operativa: exigen el mismo permiso de módulo que el propio
 * aviso necesitaría para actuar, para que un cajero no pueda ocultarle a todo
 * el negocio un aviso que ni siquiera puede ver.
 */
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@arkiteq/db";
import { moduloPermitido, resolverContextoPermisos } from "@/lib/minimarket/permisos";

export type TipoAvisoBienvenida = "caja" | "fiscal" | "pagos";

type ActualizacionConfig = TablesUpdate<"mm_config_negocio">;

const RUTA_REQUERIDA: Record<TipoAvisoBienvenida, string> = {
  caja: "/minimarket/caja",
  fiscal: "/minimarket/configuracion",
  pagos: "/minimarket/configuracion",
};

/** Marca un aviso de bienvenida como atendido/descartado para todo el negocio. */
export async function descartarAvisoAction(tipo: TipoAvisoBienvenida): Promise<{ ok: boolean }> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { ok: false };

  const supabase = await createClient();
  const permisos = await resolverContextoPermisos(supabase, tenantId, session.user.id);
  if (!moduloPermitido(RUTA_REQUERIDA[tipo], permisos)) return { ok: false };

  let datos: ActualizacionConfig;
  switch (tipo) {
    case "caja":
      datos = { aviso_caja_visto: true };
      break;
    case "fiscal":
      datos = { aviso_fiscal_visto: true };
      break;
    case "pagos":
      datos = { aviso_pagos_visto: true };
      break;
  }

  const { error } = await supabase
    .from("mm_config_negocio")
    .update(datos)
    .eq("tenant_id", tenantId);

  revalidatePath("/minimarket");
  return { ok: !error };
}
