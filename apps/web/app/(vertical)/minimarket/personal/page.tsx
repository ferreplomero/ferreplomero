import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listSucursales } from "@/lib/minimarket/data/inventario";
import { PersonalPanel } from "./personal-panel";
import type { MiembroPersonal, RolDisponible } from "./personal-panel";

export const metadata: Metadata = { title: "Personal" };

export default async function PersonalPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/inicio");

  const supabase = await createClient();

  const [asignacionesRes, sucursales, rolesRes, tenantRes] = await Promise.all([
    supabase
      .from("mm_usuarios_sucursal")
      .select("id, profile_id, sucursal_id, rol_id, activo")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null),
    listSucursales(supabase, tenantId),
    supabase
      .from("mm_roles")
      .select("id, slug, nombre, es_sistema")
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
      .order("es_sistema", { ascending: false }),
    supabase.from("tenants").select("created_by").eq("id", tenantId).maybeSingle(),
  ]);

  const asignaciones = asignacionesRes.data ?? [];
  const roles = rolesRes.data ?? [];
  const duenoPrincipalId = tenantRes.data?.created_by ?? null;

  const profileIds = [...new Set(asignaciones.map((a) => a.profile_id))];
  const { data: profiles } =
    profileIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, full_name, email, whatsapp")
          .in("id", profileIds)
      : {
          data: [] as {
            id: string;
            full_name: string | null;
            email: string | null;
            whatsapp: string | null;
          }[],
        };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const rolMap = new Map(roles.map((r) => [r.id, r]));
  const sucursalMap = new Map(sucursales.map((s) => [s.id, s.nombre]));

  const miembros: MiembroPersonal[] = asignaciones.map((a) => {
    const perfil = profileMap.get(a.profile_id);
    const rol = rolMap.get(a.rol_id);
    return {
      asignacionId: a.id,
      profileId: a.profile_id,
      nombre: perfil?.full_name ?? "(sin nombre)",
      email: perfil?.email ?? "",
      whatsapp: perfil?.whatsapp ?? "",
      sucursalId: a.sucursal_id,
      sucursalNombre: sucursalMap.get(a.sucursal_id) ?? "Sucursal",
      rolId: a.rol_id,
      rolNombre: rol?.nombre ?? "Rol",
      activo: a.activo,
      esDuenoPrincipal: a.profile_id === duenoPrincipalId,
    };
  });

  const rolesDisponibles: RolDisponible[] = roles.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    esSistema: r.es_sistema,
  }));

  const sucursalesSimples = sucursales.map((s) => ({ id: s.id, nombre: s.nombre }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-heading text-2xl font-semibold">Personal</h1>
        <p className="text-muted-foreground">
          Registra a tu equipo con su propio acceso, asígnales un rol y gestiona sus cuentas. Solo
          tú y tus administradores ven esta sección.
        </p>
      </header>

      <PersonalPanel miembros={miembros} roles={rolesDisponibles} sucursales={sucursalesSimples} />
    </div>
  );
}
