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
 * desde Personal > Usuarios. EXCEPCIÓN: en los módulos sensibles (Personal,
 * Configuración — `MODULOS_SENSIBLES`), "sin asignación" nunca implica acceso
 * total; solo lo tiene el dueño/administrador de PLATAFORMA
 * (`esAdminPlataforma`), que es a quien esta regla de compatibilidad protegía
 * en la práctica (el dueño que aún no completó el asistente de bienvenida).
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
  /** Sucursales de sus asignaciones activas (`mm_usuarios_sucursal.sucursal_id`). */
  sucursalIds: string[];
  /** true si algún rol asignado es dueño/administrador — ve todas las
   * sucursales del tenant sin necesitar una fila por cada una (mismo
   * criterio que `auth_sucursal_ids()` en la migración 0111, para que UI y
   * RLS nunca diverjan). */
  todasLasSucursales: boolean;
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

/**
 * Módulos donde "sin ninguna asignación operativa" NO puede seguir
 * significando "sin restricción" — gestionar personal o la configuración del
 * negocio (sucursales incluidas) es la superficie sensible: fallar abierto
 * ahí es escalada de privilegios, no una conveniencia para el dueño sin
 * onboarding (ver `esAdminPlataforma` más abajo, que sí lo cubre). El resto
 * de módulos mantiene la compatibilidad histórica sin cambios.
 */
const MODULOS_SENSIBLES = new Set<MmModulo>(["personal", "configuracion"]);

/**
 * true si el usuario es propietario/administrador de PLATAFORMA del tenant
 * (`memberships.role`, ver `auth_has_tenant_role()` en la migración 0003).
 * Es la señal confiable para "es el dueño": se crea de forma atómica en el
 * registro (`asegurarNegocioInicial`) — a diferencia de la fila operativa en
 * `mm_usuarios_sucursal` (rol "dueno"), que solo se crea al terminar el
 * asistente de bienvenida (opcional) y puede no existir todavía. Es el bypass
 * que evita que ESE dueño legítimo (sin ninguna fila en mm_usuarios_sucursal)
 * quede bloqueado por el chequeo estricto de los módulos sensibles.
 */
export async function esAdminPlataforma(
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

/**
 * ¿El contexto de permisos dado puede entrar a esta ruta? `esAdmin` (ya
 * resuelto por el caller, ver `esAdminPlataforma`) solo importa cuando
 * `ctx` es `null` Y el módulo de la ruta es sensible (Personal/
 * Configuración) — ahí "sin asignación" deja de significar "sin
 * restricción" salvo que sea el dueño/administrador de plataforma.
 */
export function moduloPermitido(
  pathname: string,
  ctx: ContextoPermisos | null,
  esAdmin: boolean,
): boolean {
  const modulo = moduloDeRuta(pathname);
  if (!modulo) return true;
  if (ctx) return ctx.permisos[modulo]?.ver === true;
  if (MODULOS_SENSIBLES.has(modulo)) return esAdmin;
  return true;
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
    .select("rol_id, sucursal_id")
    .eq("tenant_id", tenantId)
    .eq("profile_id", profileId)
    .eq("activo", true)
    .is("deleted_at", null);

  if (!asignaciones || asignaciones.length === 0) return null;

  const rolIds = [...new Set(asignaciones.map((a) => a.rol_id))];
  const sucursalIds = [...new Set(asignaciones.map((a) => a.sucursal_id))];

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

  const todasLasSucursales = rolesAsignados.some(
    (r) => r.slug === "dueno" || r.slug === "administrador",
  );

  return { roles: rolesAsignados, permisos, sucursalIds, todasLasSucursales };
}

const SIN_PERMISO = "No tienes permiso para realizar esta acción.";

/**
 * Verifica que el usuario pueda `accion` sobre `modulo` en el tenant. Devuelve
 * un mensaje de error si NO puede, o `null` si sí puede. Para usar al INICIO
 * de una server action de escritura.
 *
 * "Sin ninguna asignación operativa" (`ctx === null`) sigue sin restringir
 * para la mayoría de los módulos (compatibilidad histórica — ver cabecera del
 * archivo), PERO en los módulos sensibles (`MODULOS_SENSIBLES`: Personal y
 * Configuración) eso dejaría de significar "puede todo" para significar
 * "no puede nada", salvo que además sea dueño/administrador de plataforma
 * (`esAdminPlataforma`) — el mismo bypass que ya protege al dueño sin
 * onboarding en `sucursalesPermitidas()`.
 */
export async function requirePermisoAccion(
  supabase: Client,
  tenantId: string,
  profileId: string,
  modulo: MmModulo,
  accion: "crear" | "editar" | "eliminar",
): Promise<string | null> {
  const ctx = await resolverContextoPermisos(supabase, tenantId, profileId);
  if (ctx) {
    return ctx.permisos[modulo]?.[accion] ? null : SIN_PERMISO;
  }
  if (MODULOS_SENSIBLES.has(modulo)) {
    return (await esAdminPlataforma(supabase, tenantId, profileId)) ? null : SIN_PERMISO;
  }
  return null;
}
