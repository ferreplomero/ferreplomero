import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getProveedorConStats } from "@/lib/minimarket/data/compras";
import { actualizarProveedor } from "../../../compras/actions";
import { ProveedorForm } from "../../proveedor-form";

interface Props {
  params: Promise<{ id: string }>;
}

// `generateMetadata` y la página se ejecutan por separado — sin memoizar,
// getProveedorConStats se pedía dos veces en cada carga. cache() dedupe por
// tenantId+id dentro de la misma request.
const getProveedorConStatsCached = cache(async (tenantId: string, id: string) => {
  const supabase = await createClient();
  return getProveedorConStats(supabase, tenantId, id);
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const session = await getSessionContext();
  if (!session?.activeTenant?.id) return { title: "Editar proveedor" };
  const p = await getProveedorConStatsCached(session.activeTenant.id, id);
  return { title: p ? `Editar ${p.nombre}` : "Editar proveedor" };
}

export default async function EditarProveedorPage({ params }: Props) {
  const { id } = await params;

  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/inicio");

  const proveedor = await getProveedorConStatsCached(tenantId, id);
  if (!proveedor) notFound();

  const action = actualizarProveedor.bind(null, id);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="space-y-1">
        <Link
          href={`/minimarket/proveedores/${id}`}
          className="text-muted-foreground hover:text-heading mb-2 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          {proveedor.nombre}
        </Link>
        <h1 className="font-display text-heading text-2xl font-semibold">Editar proveedor</h1>
      </header>
      <ProveedorForm action={action} proveedor={proveedor} tenantId={tenantId} />
    </div>
  );
}
