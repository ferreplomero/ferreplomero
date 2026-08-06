"use server";

/**
 * Gestión del personal del minimarket (dueño/administrador registran a su
 * equipo con acceso propio). Usa `service_role` para las operaciones de Auth
 * (crear usuario, banear, borrar, cambiar clave/correo — nunca SQL directo
 * para la contraseña) porque el permiso real que gobierna esta pantalla es el
 * ROL OPERATIVO ('personal': crear/editar/eliminar en `mm_permisos_rol`), no
 * el rol de plataforma (`memberships.role`) que usa RLS — por eso cada acción
 * empieza verificando `requirePermisoAccion` explícitamente en vez de confiar
 * solo en RLS.
 *
 * "Desactivar" banea el login (`ban_duration`) y apaga `mm_usuarios_sucursal.
 * activo` — banear es lo que de verdad impide iniciar sesión; si solo se
 * apagara la fila de rol, `resolverContextoPermisos` devolvería `null` (sin
 * asignación) y por la regla de compatibilidad esa persona quedaría SIN
 * restricción, es decir con más acceso, no menos. "Eliminar" borra la cuenta
 * por completo (irreversible).
 */
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@arkiteq/db/service";
import {
  emailSchema,
  nombreSchema,
  apellidoSchema,
  phoneSchema,
  passwordSchema,
} from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { requirePermisoAccion } from "@/lib/minimarket/permisos";

const PERSONAL_PATH = "/minimarket/personal";
// ~100 años: equivalente a indefinido, se levanta con reactivarPersonalAction.
const BAN_INDEFINIDO = "876000h";

export interface PersonalResult {
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

function fieldErr(e: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of e.issues) {
    const k = issue.path[0];
    if (typeof k === "string" && !(k in out)) out[k] = issue.message;
  }
  return out;
}

/** El dueño principal (quien registró el negocio) no puede perder su rol ni su acceso. */
async function esDuenoPrincipal(
  supabase: NonNullable<Awaited<ReturnType<typeof contexto>>>["supabase"],
  tenantId: string,
  profileId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("tenants")
    .select("created_by")
    .eq("id", tenantId)
    .maybeSingle();
  return data?.created_by === profileId;
}

const registrarSchema = z.object({
  nombre: nombreSchema,
  apellido: apellidoSchema,
  email: emailSchema,
  whatsapp: phoneSchema,
  password: passwordSchema,
  sucursal_id: z.string().uuid("Selecciona una sucursal."),
  rol_id: z.string().uuid("Selecciona un rol."),
});

/** Registra a un nuevo miembro del personal con su propio acceso (Auth Admin API, server-only). */
export async function registrarPersonalAction(
  _prev: PersonalResult,
  formData: FormData,
): Promise<PersonalResult> {
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

  const parsed = registrarSchema.safeParse({
    nombre: formData.get("nombre"),
    apellido: formData.get("apellido"),
    email: formData.get("email"),
    whatsapp: formData.get("whatsapp"),
    password: formData.get("password"),
    sucursal_id: formData.get("sucursal_id"),
    rol_id: formData.get("rol_id"),
  });
  if (!parsed.success) return { fieldErrors: fieldErr(parsed.error) };

  const [{ data: sucursal }, { data: rol }] = await Promise.all([
    ctx.supabase
      .from("mm_sucursales")
      .select("id")
      .eq("tenant_id", ctx.tenantId)
      .eq("id", parsed.data.sucursal_id)
      .maybeSingle(),
    ctx.supabase
      .from("mm_roles")
      .select("id")
      .or(`tenant_id.is.null,tenant_id.eq.${ctx.tenantId}`)
      .eq("id", parsed.data.rol_id)
      .maybeSingle(),
  ]);
  if (!sucursal) return { error: "Sucursal inválida." };
  if (!rol) return { error: "Rol inválido." };

  const service = createServiceClient();
  const fullName = `${parsed.data.nombre} ${parsed.data.apellido}`.trim();

  const { data: creado, error: createError } = await service.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: fullName, whatsapp: parsed.data.whatsapp },
  });

  if (createError || !creado.user) {
    if (createError?.code === "email_exists") {
      return { error: "Ya existe una cuenta con ese correo." };
    }
    console.error("[registrarPersonalAction] createUser", createError);
    return { error: "No se pudo crear el acceso. Inténtalo de nuevo." };
  }

  const profileId = creado.user.id;

  const { error: membresiaError } = await service.from("memberships").insert({
    tenant_id: ctx.tenantId,
    profile_id: profileId,
    role: "colaborador",
  });
  if (membresiaError) {
    console.error("[registrarPersonalAction] membership", membresiaError);
    await service.auth.admin.deleteUser(profileId);
    return { error: "No se pudo vincular al negocio. Inténtalo de nuevo." };
  }

  const { error: asignacionError } = await service.from("mm_usuarios_sucursal").insert({
    tenant_id: ctx.tenantId,
    profile_id: profileId,
    sucursal_id: parsed.data.sucursal_id,
    rol_id: parsed.data.rol_id,
    activo: true,
  });
  if (asignacionError) {
    console.error("[registrarPersonalAction] asignacion", asignacionError);
    await service.auth.admin.deleteUser(profileId);
    return { error: "No se pudo asignar el rol. Inténtalo de nuevo." };
  }

  revalidatePath(PERSONAL_PATH);
  return { ok: true };
}

const datosSchema = z.object({
  nombre: nombreSchema,
  apellido: apellidoSchema,
  whatsapp: phoneSchema,
});

/** Edita nombre, apellido y WhatsApp de un miembro del personal (no toca su correo/clave). */
export async function actualizarDatosPersonalAction(
  profileId: string,
  _prev: PersonalResult,
  formData: FormData,
): Promise<PersonalResult> {
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

  const parsed = datosSchema.safeParse({
    nombre: formData.get("nombre"),
    apellido: formData.get("apellido"),
    whatsapp: formData.get("whatsapp"),
  });
  if (!parsed.success) return { fieldErrors: fieldErr(parsed.error) };

  const service = createServiceClient();
  const fullName = `${parsed.data.nombre} ${parsed.data.apellido}`.trim();

  const { error } = await service
    .from("profiles")
    .update({ full_name: fullName, whatsapp: parsed.data.whatsapp })
    .eq("id", profileId);

  if (error) {
    console.error("[actualizarDatosPersonalAction]", error);
    return { error: "No se pudieron guardar los datos." };
  }

  revalidatePath(PERSONAL_PATH);
  return { ok: true };
}

/** Establece una nueva contraseña para el miembro del personal (soporte, sin SQL directo). */
export async function establecerPasswordPersonalAction(
  profileId: string,
  _prev: PersonalResult,
  formData: FormData,
): Promise<PersonalResult> {
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

  const parsed = passwordSchema.safeParse(formData.get("password"));
  if (!parsed.success) {
    return { fieldErrors: { password: parsed.error.issues[0]?.message ?? "Contraseña inválida." } };
  }

  const service = createServiceClient();
  const { error } = await service.auth.admin.updateUserById(profileId, { password: parsed.data });
  if (error) {
    console.error("[establecerPasswordPersonalAction]", error);
    return { error: "No se pudo establecer la contraseña." };
  }

  return { ok: true };
}

const asignacionSchema = z.object({
  sucursal_id: z.string().uuid("Selecciona una sucursal."),
  rol_id: z.string().uuid("Selecciona un rol."),
});

/** Cambia la sucursal y/o el rol operativo de una asignación existente. */
export async function cambiarAsignacionPersonalAction(
  asignacionId: string,
  _prev: PersonalResult,
  formData: FormData,
): Promise<PersonalResult> {
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

  const parsed = asignacionSchema.safeParse({
    sucursal_id: formData.get("sucursal_id"),
    rol_id: formData.get("rol_id"),
  });
  if (!parsed.success) return { fieldErrors: fieldErr(parsed.error) };

  const { data: asignacion } = await ctx.supabase
    .from("mm_usuarios_sucursal")
    .select("profile_id")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", asignacionId)
    .maybeSingle();
  if (!asignacion) return { error: "Asignación no encontrada." };

  if (await esDuenoPrincipal(ctx.supabase, ctx.tenantId, asignacion.profile_id)) {
    return { error: "No se puede cambiar el rol del dueño principal del negocio." };
  }

  const service = createServiceClient();
  const { error } = await service
    .from("mm_usuarios_sucursal")
    .update({ sucursal_id: parsed.data.sucursal_id, rol_id: parsed.data.rol_id })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", asignacionId);

  if (error) {
    console.error("[cambiarAsignacionPersonalAction]", error);
    return { error: "No se pudo actualizar la asignación." };
  }

  revalidatePath(PERSONAL_PATH);
  return { ok: true };
}

/** Desactiva (revoca el acceso) de un miembro del personal — reversible con reactivarPersonalAction. */
export async function desactivarPersonalAction(profileId: string): Promise<PersonalResult> {
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

  if (await esDuenoPrincipal(ctx.supabase, ctx.tenantId, profileId)) {
    return { error: "No se puede desactivar al dueño principal del negocio." };
  }

  const service = createServiceClient();
  const { error: banError } = await service.auth.admin.updateUserById(profileId, {
    ban_duration: BAN_INDEFINIDO,
  });
  if (banError) {
    console.error("[desactivarPersonalAction] ban", banError);
    return { error: "No se pudo desactivar el acceso." };
  }

  const { error: rolError } = await service
    .from("mm_usuarios_sucursal")
    .update({ activo: false })
    .eq("tenant_id", ctx.tenantId)
    .eq("profile_id", profileId);
  if (rolError) console.error("[desactivarPersonalAction] rol", rolError);

  revalidatePath(PERSONAL_PATH);
  return { ok: true };
}

/** Levanta la desactivación: restaura el login y su(s) asignación(es) de rol previas. */
export async function reactivarPersonalAction(profileId: string): Promise<PersonalResult> {
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

  const service = createServiceClient();
  const { error: banError } = await service.auth.admin.updateUserById(profileId, {
    ban_duration: "none",
  });
  if (banError) {
    console.error("[reactivarPersonalAction] ban", banError);
    return { error: "No se pudo reactivar el acceso." };
  }

  const { error: rolError } = await service
    .from("mm_usuarios_sucursal")
    .update({ activo: true })
    .eq("tenant_id", ctx.tenantId)
    .eq("profile_id", profileId);
  if (rolError) console.error("[reactivarPersonalAction] rol", rolError);

  revalidatePath(PERSONAL_PATH);
  return { ok: true };
}

/** Elimina DEFINITIVAMENTE la cuenta de un miembro del personal (borrado físico, no reversible). */
export async function eliminarPersonalAction(profileId: string): Promise<PersonalResult> {
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

  if (await esDuenoPrincipal(ctx.supabase, ctx.tenantId, profileId)) {
    return { error: "No se puede eliminar al dueño principal del negocio." };
  }

  const service = createServiceClient();
  const { error } = await service.auth.admin.deleteUser(profileId);
  if (error) {
    console.error("[eliminarPersonalAction]", error);
    return { error: "No se pudo eliminar la cuenta." };
  }

  revalidatePath(PERSONAL_PATH);
  return { ok: true };
}
