import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { RolesPanel } from "./roles-panel";
import type { RolConPermisos } from "./roles-panel";

export const metadata: Metadata = { title: "Roles — Personal" };

export default async function PersonalRolesPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/inicio");

  const supabase = await createClient();

  const { data: roles } = await supabase
    .from("mm_roles")
    .select("id, slug, nombre, es_sistema, descripcion")
    .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
    .order("es_sistema", { ascending: false })
    .order("nombre", { ascending: true });

  const rolIds = (roles ?? []).map((r) => r.id);
  const { data: permisos } =
    rolIds.length > 0
      ? await supabase
          .from("mm_permisos_rol")
          .select("rol_id, modulo, ver, crear, editar, eliminar")
          .in("rol_id", rolIds)
      : { data: [] };

  const rolesConPermisos: RolConPermisos[] = (roles ?? []).map((r) => ({
    id: r.id,
    slug: r.slug,
    nombre: r.nombre,
    esSistema: r.es_sistema,
    descripcion: r.descripcion,
    permisos: (permisos ?? [])
      .filter((p) => p.rol_id === r.id)
      .map((p) => ({
        modulo: p.modulo,
        ver: p.ver,
        crear: p.crear,
        editar: p.editar,
        eliminar: p.eliminar,
      })),
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-heading text-2xl font-semibold">Roles</h1>
        <p className="text-muted-foreground">
          Los roles predefinidos no se pueden modificar. Crea un rol personalizado si necesitas una
          combinación distinta de permisos.
        </p>
      </header>

      <RolesPanel roles={rolesConPermisos} />
    </div>
  );
}
