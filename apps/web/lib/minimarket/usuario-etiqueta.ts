import { createServiceClient } from "@arkiteq/db/service";

/** Nombre + rol legible de un usuario del negocio (ej. "María Pérez", "Cajero"). */
export interface EtiquetaUsuario {
  nombre: string;
  rol: string;
}

const ROL_PLATAFORMA_LABEL: Record<string, string> = {
  propietario: "Dueño",
  administrador: "Administrador",
  colaborador: "Colaborador",
};

/**
 * Resuelve nombre y rol de varios usuarios DEL TENANT dado. Usa el cliente
 * de servicio SOLO para leer (un cajero no siempre puede leer por RLS las
 * asignaciones/roles de sus compañeros) y siempre filtrado por `tenantId`:
 * nunca devuelve datos de un perfil que no sea miembro de este negocio.
 *
 * Rol: el rol operativo asignado en `sucursalId` (Personal → roles) si lo
 * hay; si no, cualquiera de sus roles operativos; si no tiene ninguno, su
 * rol de plataforma (Dueño/Administrador/Colaborador).
 */
export async function resolverEtiquetasUsuarios(
  tenantId: string,
  profileIds: string[],
  sucursalId?: string | null,
): Promise<Map<string, EtiquetaUsuario>> {
  const ids = [...new Set(profileIds.filter(Boolean))];
  const out = new Map<string, EtiquetaUsuario>();
  if (ids.length === 0) return out;

  const admin = createServiceClient();
  const [{ data: miembros }, { data: asignaciones }] = await Promise.all([
    admin
      .from("memberships")
      .select("profile_id, role")
      .eq("tenant_id", tenantId)
      .in("profile_id", ids),
    admin
      .from("mm_usuarios_sucursal")
      .select("profile_id, sucursal_id, rol_id")
      .eq("tenant_id", tenantId)
      .in("profile_id", ids)
      .eq("activo", true)
      .is("deleted_at", null),
  ]);

  const miembrosIds = (miembros ?? []).map((m) => m.profile_id);
  if (miembrosIds.length === 0) return out;

  const rolIds = [...new Set((asignaciones ?? []).map((a) => a.rol_id))];
  const [{ data: perfiles }, { data: roles }] = await Promise.all([
    admin.from("profiles").select("id, full_name").in("id", miembrosIds),
    rolIds.length > 0
      ? admin.from("mm_roles").select("id, nombre").in("id", rolIds)
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
  ]);

  const nombrePorId = new Map((perfiles ?? []).map((p) => [p.id, p.full_name]));
  const rolNombre = new Map((roles ?? []).map((r) => [r.id, r.nombre]));

  for (const m of miembros ?? []) {
    const propias = (asignaciones ?? []).filter((a) => a.profile_id === m.profile_id);
    const asignacion = propias.find((a) => a.sucursal_id === sucursalId) ?? propias[0];
    const rolOperativo = asignacion ? rolNombre.get(asignacion.rol_id) : undefined;
    out.set(m.profile_id, {
      nombre: nombrePorId.get(m.profile_id)?.trim() || "Usuario sin nombre",
      rol: rolOperativo ?? ROL_PLATAFORMA_LABEL[m.role] ?? m.role,
    });
  }
  return out;
}
