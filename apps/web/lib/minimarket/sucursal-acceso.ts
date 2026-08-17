/**
 * Sucursales a las que tiene acceso el usuario autenticado y su sucursal
 * "activa" (la que ve por defecto en Inventario y podrá cambiar desde el
 * menú). Es la contraparte, a nivel de sucursal, de `activeTenant` en
 * `lib/auth/session.ts` — mismo patrón: cookie httpOnly + fallback a la
 * primera disponible.
 *
 * El alcance real (qué filas puede leer/escribir en la base de datos) lo
 * impone RLS (`auth_sucursal_ids()`, migración 0112) — este archivo solo
 * decide qué mostrar en la interfaz, con el MISMO criterio (dueño/
 * administrador ven todas; el resto, solo sus asignaciones activas; sin
 * ninguna asignación, ninguna) para que UI y base de datos nunca diverjan.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@arkiteq/db";
import { ACTIVE_SUCURSAL_COOKIE } from "@/lib/site";
import { resolverContextoPermisos } from "@/lib/minimarket/permisos";

type Client = SupabaseClient<Database>;

export interface SucursalAcceso {
  id: string;
  nombre: string;
}

/** Todas las sucursales activas del tenant (bypass de dueño/administrador). */
async function todasLasSucursalesDelTenant(
  supabase: Client,
  tenantId: string,
): Promise<SucursalAcceso[]> {
  const { data } = await supabase
    .from("mm_sucursales")
    .select("id, nombre")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  return data ?? [];
}

/**
 * true si el usuario es propietario/administrador de PLATAFORMA del tenant
 * (`memberships.role`, ver `auth_has_tenant_role()` en la migración 0003).
 * Es la señal confiable para "es el dueño": se crea de forma atómica en el
 * registro (`asegurarNegocioInicial`) — a diferencia de la fila operativa en
 * `mm_usuarios_sucursal` (rol "dueno"), que solo se crea al terminar el
 * asistente de bienvenida (opcional) y puede no existir todavía.
 */
async function esAdminPlataforma(
  supabase: Client,
  tenantId: string,
  profileId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("memberships")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("profile_id", profileId)
    .maybeSingle();
  return data?.role === "propietario" || data?.role === "administrador";
}

/** Sucursales del tenant a las que el usuario tiene acceso (ver cabecera). */
export async function sucursalesPermitidas(
  supabase: Client,
  tenantId: string,
  profileId: string,
): Promise<SucursalAcceso[]> {
  if (await esAdminPlataforma(supabase, tenantId, profileId)) {
    return todasLasSucursalesDelTenant(supabase, tenantId);
  }

  const ctx = await resolverContextoPermisos(supabase, tenantId, profileId);

  // Sin ninguna asignación operativa: a diferencia del permiso de módulo (que
  // por compatibilidad histórica no restringe), aquí el default seguro es NO
  // ver ninguna sucursal — fallar abierto significaría stock ajeno visible.
  if (!ctx) return [];

  if (ctx.todasLasSucursales) {
    return todasLasSucursalesDelTenant(supabase, tenantId);
  }

  if (ctx.sucursalIds.length === 0) return [];

  const { data } = await supabase
    .from("mm_sucursales")
    .select("id, nombre")
    .eq("tenant_id", tenantId)
    .in("id", ctx.sucursalIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export interface SucursalActivaResult {
  activa: SucursalAcceso | null;
  permitidas: SucursalAcceso[];
}

/**
 * Sucursal activa del usuario (cookie `ACTIVE_SUCURSAL_COOKIE`, validada
 * contra sus sucursales permitidas, con fallback a la primera). `activa` es
 * `null` solo si `permitidas` está vacío (sin ninguna sucursal asignada).
 * Memoizado por request (React `cache`) — layout y página pueden llamarla
 * sin duplicar las consultas, mismo truco que `getSessionContext`.
 */
export const getSucursalActiva = cache(
  async (supabase: Client, tenantId: string, profileId: string): Promise<SucursalActivaResult> => {
    const permitidas = await sucursalesPermitidas(supabase, tenantId, profileId);
    if (permitidas.length === 0) return { activa: null, permitidas };

    const cookieStore = await cookies();
    const preferredId = cookieStore.get(ACTIVE_SUCURSAL_COOKIE)?.value;
    const activa = permitidas.find((s) => s.id === preferredId) ?? permitidas[0] ?? null;
    return { activa, permitidas };
  },
);
