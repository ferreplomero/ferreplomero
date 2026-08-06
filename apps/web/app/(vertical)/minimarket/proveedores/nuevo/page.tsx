import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { crearProveedor } from "../../compras/actions";
import { ProveedorForm } from "../proveedor-form";

export const metadata: Metadata = { title: "Nuevo proveedor" };

export default async function NuevoProveedorPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/inicio");

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/minimarket/proveedores"
          className="text-muted-foreground hover:text-heading mb-2 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Proveedores
        </Link>
        <h1 className="font-display text-heading text-2xl font-semibold">Nuevo proveedor</h1>
      </header>
      <ProveedorForm action={crearProveedor} tenantId={tenantId} />
    </div>
  );
}
