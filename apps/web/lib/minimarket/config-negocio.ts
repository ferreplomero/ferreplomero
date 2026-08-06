/**
 * Helpers de `mm_config_negocio` compartidos entre Configuración y el
 * asistente de bienvenida (`/minimarket/bienvenida`) — sobre todo la subida
 * de logo, que AMBOS necesitan. La lógica de guardado en sí es idéntica, así
 * que vive aquí una sola vez.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import type { Database } from "@arkiteq/db";

type Client = SupabaseClient<Database>;

interface ConfigNegocioCtx {
  supabase: Client;
  tenantId: string;
}

export interface LogoResult {
  ok?: boolean;
  error?: string;
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Id de `mm_config_negocio` del tenant, creando la fila con valores por defecto si aún no existe. */
export async function getOrCreateConfigId(ctx: ConfigNegocioCtx): Promise<string | null> {
  const { data } = await ctx.supabase
    .from("mm_config_negocio")
    .select("id")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  if (data) return data.id;

  // Mismos valores por defecto que `aprovisionarMinimarketInicial` (IVA/IGTF
  // apagados, tasa BCV) — este es solo un respaldo por si la config no se
  // creó al activar el acceso (tenants de antes de esta función).
  const { data: nueva, error } = await ctx.supabase
    .from("mm_config_negocio")
    .insert({
      tenant_id: ctx.tenantId,
      nombre_comercial: "Mi negocio",
      fuente_tasa: "bcv",
      parametros: { igtf_activo: false, iva_activo: false },
    })
    .select("id")
    .single();

  if (error || !nueva) return null;
  return nueva.id;
}

/** Sube o elimina el logo del negocio en Storage y actualiza `logo_url`. */
export async function guardarLogoNegocio(
  ctx: ConfigNegocioCtx,
  formData: FormData,
): Promise<LogoResult> {
  const quitar = formData.get("logo_remove") === "1";
  const archivo = formData.get("logo");

  let logoUrl: string | null | undefined;

  if (archivo instanceof Blob && archivo.size > 0) {
    const tipo = archivo.type || "";
    if (!["image/jpeg", "image/png", "image/webp"].includes(tipo)) {
      return { error: "Solo se permiten imágenes PNG, JPG o WEBP." };
    }
    if (archivo.size > MAX_LOGO_BYTES) {
      return { error: "El logo no debe superar 2 MB." };
    }
    const nombre = archivo instanceof File ? archivo.name : "";
    const ext = (nombre.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const ruta = `${ctx.tenantId}/logos/${crypto.randomUUID()}.${ext}`;

    const { error: uploadErr } = await ctx.supabase.storage
      .from("productos")
      .upload(ruta, archivo, { contentType: tipo, upsert: false });

    if (uploadErr) {
      return { error: "No se pudo subir el logo. Verifica que el bucket 'productos' exista." };
    }

    logoUrl = ctx.supabase.storage.from("productos").getPublicUrl(ruta).data.publicUrl;
  } else if (quitar) {
    logoUrl = null;
  } else {
    return { error: "No se recibió ningún archivo." };
  }

  const id = await getOrCreateConfigId(ctx);
  if (!id) return { error: "No se pudo acceder a la configuración." };

  const { error } = await ctx.supabase
    .from("mm_config_negocio")
    .update({ logo_url: logoUrl })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id);

  if (error) return { error: "No se pudo guardar el logo." };

  revalidatePath("/minimarket");
  revalidatePath("/minimarket/configuracion");
  revalidatePath("/minimarket/bienvenida");
  return { ok: true };
}
