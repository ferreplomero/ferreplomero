"use server";

/**
 * CRUD de roles personalizados del minimarket. A diferencia de `personal/
 * actions.ts` (que crea usuarios de Auth y por eso necesita `service_role`),
 * esto son filas normales de `mm_roles`/`mm_permisos_rol` — se escriben con el
 * cliente de la sesión (RLS ya exige `es_sistema = false` y `tenant_id` propio
 * para editar/borrar, ver 0039_mm_roles_personal.sql) y además se verifica
 * `requirePermisoAccion` para que la autoridad real sea el ROL OPERATIVO
 * ('personal'), no el rol de plataforma que usa RLS.
 */
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { slugify } from "@arkiteq/core";
import type { MmModulo } from "@arkiteq/db";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { requirePermisoAccion, MODULOS } from "@/lib/minimarket/permisos";

const ROLES_PATH = "/minimarket/personal/roles";

export interface RolResult {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function contexto() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id ?? null;
  if (!session || !tenantId) return null;
  const supabase = await createClient();
  return { supabase, tenantId, userId: session.user.id };
}

function permisosDesdeFormData(
  formData: FormData,
): Record<MmModulo, [boolean, boolean, boolean, boolean]> {
  const out = {} as Record<MmModulo, [boolean, boolean, boolean, boolean]>;
  for (const modulo of MODULOS) {
    out[modulo] = [
      formData.get(`perm_${modulo}_ver`) === "1",
      formData.get(`perm_${modulo}_crear`) === "1",
      formData.get(`perm_${modulo}_editar`) === "1",
      formData.get(`perm_${modulo}_eliminar`) === "1",
    ];
  }
  return out;
}

async function slugDisponible(
  supabase: NonNullable<Awaited<ReturnType<typeof contexto>>>["supabase"],
  tenantId: string,
  base: string,
): Promise<string> {
  for (let intento = 0; intento < 50; intento++) {
    const candidato = intento === 0 ? base : `${base}-${intento + 1}`;
    const { data } = await supabase
      .from("mm_roles")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("slug", candidato)
      .maybeSingle();
    if (!data) return candidato;
  }
  return `${base}-${Date.now()}`;
}

const nombreRolSchema = z
  .string({ required_error: "El nombre del rol es obligatorio." })
  .trim()
  .min(2, "Indica un nombre para el rol.")
  .max(60, "El nombre es demasiado largo.");

/** Crea un rol personalizado con sus permisos por módulo. */
export async function crearRolPersonalizadoAction(
  _prev: RolResult,
  formData: FormData,
): Promise<RolResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };

  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "personal",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const parsedNombre = nombreRolSchema.safeParse(formData.get("nombre"));
  if (!parsedNombre.success) {
    return { fieldErrors: { nombre: parsedNombre.error.issues[0]?.message ?? "Nombre inválido." } };
  }
  const descripcion = (formData.get("descripcion") as string | null)?.trim() || null;

  const baseSlug = slugify(parsedNombre.data) || "rol";
  const slug = await slugDisponible(ctx.supabase, ctx.tenantId, baseSlug);

  const { data: rol, error: rolError } = await ctx.supabase
    .from("mm_roles")
    .insert({
      tenant_id: ctx.tenantId,
      slug,
      nombre: parsedNombre.data,
      es_sistema: false,
      descripcion,
    })
    .select("id")
    .single();

  if (rolError || !rol) {
    console.error("[crearRolPersonalizadoAction] rol", rolError);
    return { error: "No se pudo crear el rol." };
  }

  const permisos = permisosDesdeFormData(formData);
  const filas = MODULOS.map((modulo) => {
    const [ver, crear, editar, eliminar] = permisos[modulo];
    return { rol_id: rol.id, modulo, ver, crear, editar, eliminar };
  });

  const { error: permisosError } = await ctx.supabase.from("mm_permisos_rol").insert(filas);
  if (permisosError) {
    console.error("[crearRolPersonalizadoAction] permisos", permisosError);
    await ctx.supabase.from("mm_roles").delete().eq("id", rol.id);
    return { error: "No se pudieron guardar los permisos del rol." };
  }

  revalidatePath(ROLES_PATH);
  return { ok: true };
}

/** Edita el nombre, la descripción y los permisos de un rol personalizado. */
export async function actualizarRolPersonalizadoAction(
  rolId: string,
  _prev: RolResult,
  formData: FormData,
): Promise<RolResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };

  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "personal",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  const { data: rolActual } = await ctx.supabase
    .from("mm_roles")
    .select("id, es_sistema")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", rolId)
    .maybeSingle();
  if (!rolActual) return { error: "Rol no encontrado." };
  if (rolActual.es_sistema) return { error: "Los roles predefinidos no se pueden editar." };

  const parsedNombre = nombreRolSchema.safeParse(formData.get("nombre"));
  if (!parsedNombre.success) {
    return { fieldErrors: { nombre: parsedNombre.error.issues[0]?.message ?? "Nombre inválido." } };
  }
  const descripcion = (formData.get("descripcion") as string | null)?.trim() || null;

  const { error: updateError } = await ctx.supabase
    .from("mm_roles")
    .update({ nombre: parsedNombre.data, descripcion })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", rolId);
  if (updateError) {
    console.error("[actualizarRolPersonalizadoAction] rol", updateError);
    return { error: "No se pudo actualizar el rol." };
  }

  const permisos = permisosDesdeFormData(formData);
  for (const modulo of MODULOS) {
    const [ver, crear, editar, eliminar] = permisos[modulo];
    const { error } = await ctx.supabase
      .from("mm_permisos_rol")
      .update({ ver, crear, editar, eliminar })
      .eq("rol_id", rolId)
      .eq("modulo", modulo);
    if (error) console.error("[actualizarRolPersonalizadoAction] permiso", modulo, error);
  }

  revalidatePath(ROLES_PATH);
  return { ok: true };
}

/** Elimina un rol personalizado (falla con un mensaje claro si aún tiene personal asignado). */
export async function eliminarRolPersonalizadoAction(rolId: string): Promise<RolResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };

  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "personal",
    "eliminar",
  );
  if (permisoError) return { error: permisoError };

  const { data: rolActual } = await ctx.supabase
    .from("mm_roles")
    .select("id, es_sistema")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", rolId)
    .maybeSingle();
  if (!rolActual) return { error: "Rol no encontrado." };
  if (rolActual.es_sistema) return { error: "Los roles predefinidos no se pueden eliminar." };

  const { count } = await ctx.supabase
    .from("mm_usuarios_sucursal")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", ctx.tenantId)
    .eq("rol_id", rolId)
    .is("deleted_at", null);
  if (count && count > 0) {
    return {
      error: `No se puede eliminar: ${count} persona${count !== 1 ? "s" : ""} tiene${count !== 1 ? "n" : ""} este rol asignado. Cámbiale${count !== 1 ? "s" : ""} el rol primero desde Personal > Usuarios.`,
    };
  }

  const { error } = await ctx.supabase
    .from("mm_roles")
    .delete()
    .eq("tenant_id", ctx.tenantId)
    .eq("id", rolId);
  if (error) {
    console.error("[eliminarRolPersonalizadoAction]", error);
    return { error: "No se pudo eliminar el rol." };
  }

  revalidatePath(ROLES_PATH);
  return { ok: true };
}
