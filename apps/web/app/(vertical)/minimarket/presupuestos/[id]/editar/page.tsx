import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listProductos, listSucursales } from "@/lib/minimarket/data/inventario";
import { listClientes } from "@/lib/minimarket/data/clientes";
import { getPresupuestoDetalle } from "@/lib/minimarket/data/presupuestos";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { PresupuestoForm } from "../../presupuesto-form";
import { actualizarPresupuesto } from "../../actions";

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: "Editar presupuesto" };

export default async function EditarPresupuestoPage({ params }: Props) {
  const { id } = await params;

  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/inicio");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);
  const tz = await getTimezoneNegocio(supabase, tenantId);

  const [presupuesto, productos, sucursales, clientes, configRes] = await Promise.all([
    getPresupuestoDetalle(supabase, tenantId, id, tz),
    listProductos(supabase, tenantId),
    listSucursales(supabase, tenantId),
    listClientes(supabase, tenantId),
    supabase.from("mm_config_negocio").select("parametros").eq("tenant_id", tenantId).maybeSingle(),
  ]);

  if (!presupuesto) notFound();
  if (presupuesto.estado !== "pendiente") redirect(`/minimarket/presupuestos/${id}`);

  const params_ = (configRes.data?.parametros as Record<string, unknown>) ?? {};
  const ivaActivo = Boolean(params_.iva_activo ?? false);
  const ivaPct = Number(params_.iva_pct ?? 16);

  const actualizarEstePresupuesto = actualizarPresupuesto.bind(null, presupuesto.id);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="space-y-1">
        <Link
          href={`/minimarket/presupuestos/${presupuesto.id}`}
          className="text-muted-foreground hover:text-heading mb-2 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          {presupuesto.numero}
        </Link>
        <h1 className="font-display text-heading text-2xl font-semibold">Editar presupuesto</h1>
      </header>

      <PresupuestoForm
        productos={productos
          .filter((p) => p.activo)
          .map((p) => ({
            id: p.id,
            nombre: p.nombre,
            codigo: p.codigos[0] ?? null,
            precio_usd: Number(p.precio_usd),
            imagen_url: p.imagen_url,
          }))}
        clientes={clientes.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          cedula: c.cedula,
          telefono: c.telefono,
        }))}
        sucursales={sucursales.map((s) => ({ id: s.id, nombre: s.nombre }))}
        tasa={presupuesto.tasaUsada}
        locale={country.locale}
        ivaActivo={ivaActivo}
        ivaPct={ivaPct}
        action={actualizarEstePresupuesto}
        volverA={`/minimarket/presupuestos/${presupuesto.id}`}
        presupuesto={presupuesto}
      />
    </div>
  );
}
