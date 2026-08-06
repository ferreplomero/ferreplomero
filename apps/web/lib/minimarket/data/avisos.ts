/**
 * Avisos importantes publicados por el admin (tabla `platform_avisos`, ver
 * migración 0051) que se muestran en el tablero de Minimarket. RLS ya
 * restringe la lectura a avisos `activo = true` con `vence_at > now()`
 * (defensa en profundidad) — aquí además se filtra por `producto_slug`
 * (solo los de Minimarket) y se excluyen los que este usuario ya descartó.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PlatformAvisoTipo } from "@arkiteq/db";
import { MINIMARKET_SLUG } from "../nav";

type Client = SupabaseClient<Database>;

export interface AvisoVigente {
  id: string;
  titulo: string;
  mensajeCorto: string;
  contenido: string;
  tipo: PlatformAvisoTipo;
}

export async function listAvisosVigentes(
  client: Client,
  profileId: string,
): Promise<AvisoVigente[]> {
  const [{ data: avisos }, { data: descartados }] = await Promise.all([
    client
      .from("platform_avisos")
      .select("id, titulo, mensaje_corto, contenido, tipo")
      .eq("producto_slug", MINIMARKET_SLUG)
      .order("created_at", { ascending: false }),
    client.from("platform_avisos_descartados").select("aviso_id").eq("profile_id", profileId),
  ]);

  const descartadosSet = new Set((descartados ?? []).map((d) => d.aviso_id));

  return (avisos ?? [])
    .filter((a) => !descartadosSet.has(a.id))
    .map((a) => ({
      id: a.id,
      titulo: a.titulo,
      mensajeCorto: a.mensaje_corto,
      contenido: a.contenido,
      tipo: a.tipo,
    }));
}
