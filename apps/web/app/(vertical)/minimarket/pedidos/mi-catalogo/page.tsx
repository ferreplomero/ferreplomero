import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { requirePermisoAccion } from "@/lib/minimarket/permisos";
import { sucursalesPermitidas } from "@/lib/minimarket/sucursal-acceso";
import { SITE } from "@/lib/site";
import { MiCatalogo } from "./mi-catalogo";

export const metadata: Metadata = { title: "Mi catálogo" };

function slugSugerido(...partes: string[]): string {
  const base = partes
    .join(" ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base.length >= 3 ? base : `tienda-${base || "online"}`;
}

export default async function MiCatalogoPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const [sucursales, catalogosRes, configRes, clientesRes, sinPermiso] = await Promise.all([
    sucursalesPermitidas(supabase, tenantId, session.user.id),
    supabase
      .from("mm_catalogo_publico")
      .select("sucursal_id, slug, activo")
      .eq("tenant_id", tenantId),
    supabase
      .from("mm_config_negocio")
      .select("nombre_comercial")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("mm_clientes")
      .select("id, nombre, cedula, telefono, whatsapp")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("nombre", { ascending: true })
      .limit(2000),
    requirePermisoAccion(supabase, tenantId, session.user.id, "pedidos", "crear"),
  ]);
  const catalogos = new Map((catalogosRes.data ?? []).map((c) => [c.sucursal_id, c]));
  const negocio = configRes.data?.nombre_comercial || "mi-tienda";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/minimarket/pedidos"
        className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
      >
        <ArrowLeft className="size-4" />
        Pedidos
      </Link>
      <header className="space-y-1">
        <h1 className="font-display text-heading text-2xl font-semibold">Mi catálogo</h1>
        <p className="text-muted-foreground">
          Activa un enlace público por sucursal. Tus clientes ven tus productos con precios en USD y
          Bs y te hacen pedidos sin crear cuenta. Nunca se muestran costos, márgenes ni cantidades
          de stock.
        </p>
      </header>
      <MiCatalogo
        baseUrl={SITE.url}
        negocioNombre={negocio}
        puedeEditar={sinPermiso === null}
        filas={sucursales.map((s) => {
          const c = catalogos.get(s.id);
          return {
            sucursalId: s.id,
            sucursalNombre: s.nombre,
            slug: c?.slug ?? slugSugerido(negocio, sucursales.length > 1 ? s.nombre : ""),
            activo: c?.activo ?? false,
            existe: Boolean(c),
          };
        })}
        clientes={(clientesRes.data ?? []).map((c) => ({
          id: c.id,
          nombre: c.nombre,
          cedula: c.cedula,
          telefono: c.whatsapp || c.telefono || null,
        }))}
      />
    </div>
  );
}
