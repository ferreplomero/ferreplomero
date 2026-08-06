/**
 * Permisos por rol operativo del minimarket. Los roles viven en `mm_roles`
 * (predefinidos, `tenant_id` null; o personalizados por negocio) y sus
 * permisos ver/crear/editar/eliminar por módulo en `mm_permisos_rol`. La
 * asignación de un rol a una persona vive en `mm_usuarios_sucursal` (por
 * tenant + sucursal), aparte del rol de plataforma (`memberships.role`) que
 * gobierna facturación y entitlements.
 *
 * Compatibilidad: si un usuario NO tiene ninguna asignación operativa activa
 * en el tenant, no se restringe (comportamiento histórico) — la restricción
 * solo aplica a quien el dueño/administrador le asignó explícitamente un rol
 * desde Personal > Usuarios.
 *
 * Un usuario puede tener más de una asignación activa (una por sucursal). Los
 * permisos combinados son la UNIÓN (OR) de todos sus roles activos: si
 * cualquiera de sus roles permite una acción en un módulo, se permite.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MmModulo } from "@arkiteq/db";

type Client = SupabaseClient<Database>;

export interface PermisoModulo {
  ver: boolean;
  crear: boolean;
  editar: boolean;
  eliminar: boolean;
}

export type PermisosPorModulo = Partial<Record<MmModulo, PermisoModulo>>;

export interface RolAsignado {
  id: string;
  slug: string;
  nombre: string;
  esSistema: boolean;
}

export interface ContextoPermisos {
  /** Roles activos asignados al usuario en el tenant (puede haber más de uno, por sucursal). */
  roles: RolAsignado[];
  /** Permisos combinados (OR) de todos sus roles activos, por módulo. */
  permisos: PermisosPorModulo;
}

interface ModuloDeRuta {
  prefix: string;
  modulo: MmModulo;
}

/** Prefijos NO listados aquí (Tablero, Sincronización) son visibles para todos los roles. */
const MODULO_POR_RUTA: ModuloDeRuta[] = [
  { prefix: "/minimarket/pos", modulo: "ventas" },
  { prefix: "/minimarket/ventas", modulo: "ventas" },
  { prefix: "/minimarket/caja", modulo: "caja" },
  { prefix: "/minimarket/clientes", modulo: "clientes" },
  { prefix: "/minimarket/fiado", modulo: "fiado" },
  { prefix: "/minimarket/inventario", modulo: "inventario" },
  { prefix: "/minimarket/compras", modulo: "compras" },
  { prefix: "/minimarket/proveedores", modulo: "proveedores" },
  { prefix: "/minimarket/tasa", modulo: "tasa" },
  { prefix: "/minimarket/reportes", modulo: "reportes" },
  { prefix: "/minimarket/finanzas", modulo: "finanzas" },
  { prefix: "/minimarket/configuracion", modulo: "configuracion" },
  { prefix: "/minimarket/personal", modulo: "personal" },
  { prefix: "/minimarket/deudas", modulo: "deudas" },
  { prefix: "/minimarket/bancos", modulo: "bancos" },
  { prefix: "/minimarket/presupuestos", modulo: "presupuestos" },
];

/** Todos los módulos configurables, en el orden en que se muestran en el editor de roles. */
export const MODULOS: MmModulo[] = [
  "ventas",
  "inventario",
  "compras",
  "proveedores",
  "clientes",
  "fiado",
  "caja",
  "tasa",
  "reportes",
  "finanzas",
  "configuracion",
  "personal",
  "deudas",
  "bancos",
  "presupuestos",
];

// `facturacion` ya no tiene ruta ni aparece en MODULOS/MODULO_POR_RUTA (el
// módulo de suscripción se eliminó) — sigue aquí solo porque `MmModulo` es un
// enum generado desde la base de datos que todavía incluye ese valor; quitarlo
// del todo requiere una migración que achique el enum y regenerar tipos.
export const MODULO_LABEL: Record<MmModulo, string> = {
  ventas: "Ventas / Punto de venta",
  inventario: "Inventario",
  compras: "Compras",
  proveedores: "Proveedores",
  clientes: "Clientes",
  fiado: "Fiado",
  caja: "Caja",
  tasa: "Tasa de cambio",
  reportes: "Reportes",
  finanzas: "Finanzas",
  facturacion: "Facturación",
  configuracion: "Configuración",
  personal: "Personal y roles",
  deudas: "Deudas del negocio",
  bancos: "Bancos (dinero digital)",
  presupuestos: "Presupuestos",
};

function moduloDeRuta(pathname: string): MmModulo | null {
  const entry = MODULO_POR_RUTA.find(
    (m) => pathname === m.prefix || pathname.startsWith(`${m.prefix}/`),
  );
  return entry?.modulo ?? null;
}

/** ¿El contexto de permisos dado puede entrar a esta ruta? `null` = sin restricción. */
export function moduloPermitido(pathname: string, ctx: ContextoPermisos | null): boolean {
  if (!ctx) return true;
  const modulo = moduloDeRuta(pathname);
  if (!modulo) return true;
  return ctx.permisos[modulo]?.ver === true;
}

/**
 * Resuelve el contexto de permisos del usuario en el tenant (todas sus
 * asignaciones activas, combinadas). `null` si no tiene ninguna asignación:
 * sin restricción (ver nota de compatibilidad arriba).
 */
export async function resolverContextoPermisos(
  supabase: Client,
  tenantId: string,
  profileId: string,
): Promise<ContextoPermisos | null> {
  const { data: asignaciones } = await supabase
    .from("mm_usuarios_sucursal")
    .select("rol_id")
    .eq("tenant_id", tenantId)
    .eq("profile_id", profileId)
    .eq("activo", true)
    .is("deleted_at", null);

  if (!asignaciones || asignaciones.length === 0) return null;

  const rolIds = [...new Set(asignaciones.map((a) => a.rol_id))];

  const [{ data: roles }, { data: permisosRows }] = await Promise.all([
    supabase.from("mm_roles").select("id, slug, nombre, es_sistema").in("id", rolIds),
    supabase
      .from("mm_permisos_rol")
      .select("rol_id, modulo, ver, crear, editar, eliminar")
      .in("rol_id", rolIds),
  ]);

  const rolesAsignados: RolAsignado[] = (roles ?? []).map((r) => ({
    id: r.id,
    slug: r.slug,
    nombre: r.nombre,
    esSistema: r.es_sistema,
  }));

  const permisos: PermisosPorModulo = {};
  for (const fila of permisosRows ?? []) {
    const actual = permisos[fila.modulo] ?? {
      ver: false,
      crear: false,
      editar: false,
      eliminar: false,
    };
    permisos[fila.modulo] = {
      ver: actual.ver || fila.ver,
      crear: actual.crear || fila.crear,
      editar: actual.editar || fila.editar,
      eliminar: actual.eliminar || fila.eliminar,
    };
  }

  return { roles: rolesAsignados, permisos };
}

/**
 * Verifica que el usuario pueda `accion` sobre `modulo` en el tenant. Devuelve
 * un mensaje de error si NO puede, o `null` si sí puede (incluye el caso sin
 * restricción). Para usar al INICIO de una server action de escritura.
 */
export async function requirePermisoAccion(
  supabase: Client,
  tenantId: string,
  profileId: string,
  modulo: MmModulo,
  accion: "crear" | "editar" | "eliminar",
): Promise<string | null> {
  const ctx = await resolverContextoPermisos(supabase, tenantId, profileId);
  if (!ctx) return null;
  if (ctx.permisos[modulo]?.[accion]) return null;
  return "No tienes permiso para realizar esta acción.";
}
