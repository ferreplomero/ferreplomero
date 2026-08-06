import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Truck } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listProveedores } from "@/lib/minimarket/data/compras";
import { ContactoAcciones } from "@/components/minimarket/contacto-acciones";

export const metadata: Metadata = { title: "Proveedores" };

export default async function ProveedoresPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);
  const proveedores = await listProveedores(supabase, tenantId);

  const usd = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(v);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">Proveedores</h1>
          <p className="text-muted-foreground">
            Gestiona los proveedores de tu negocio y los productos que surten.
          </p>
        </div>
        <Link
          href="/minimarket/proveedores/nuevo"
          className="bg-accent-500 hover:bg-accent-600 focus-visible:ring-ring inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2 sm:shrink-0"
        >
          <Plus className="size-4" />
          Nuevo proveedor
        </Link>
      </header>

      {proveedores.length === 0 ? (
        <Card className="py-16 text-center">
          <Truck className="text-muted-foreground mx-auto mb-3 size-10" />
          <p className="text-heading font-medium">Sin proveedores registrados</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Agrega proveedores para asociarlos a tus compras.
          </p>
          <Link
            href="/minimarket/proveedores/nuevo"
            className="bg-accent-500 hover:bg-accent-600 mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white"
          >
            <Plus className="size-4" />
            Nuevo proveedor
          </Link>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <p className="text-heading text-sm font-medium">
              {proveedores.length} proveedor{proveedores.length !== 1 ? "es" : ""}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3">Contacto</th>
                  <th className="px-4 py-3 text-right">Compras</th>
                  <th className="px-4 py-3 text-right">Total comprado</th>
                  <th className="px-4 py-3">Última compra</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {proveedores.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/minimarket/proveedores/${p.id}`}
                        className="text-accent-600 hover:underline"
                      >
                        <p className="font-medium">{p.nombre}</p>
                        {p.num_productos > 0 ? (
                          <p className="text-muted-foreground text-xs">
                            {p.num_productos} producto{p.num_productos !== 1 ? "s" : ""}
                          </p>
                        ) : null}
                      </Link>
                    </td>
                    <td className="text-muted-foreground px-4 py-3">
                      <div className="space-y-1.5">
                        <p>{p.contacto ?? p.telefono ?? "—"}</p>
                        <ContactoAcciones telefono={p.telefono} whatsapp={p.whatsapp} />
                      </div>
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-right tabular-nums">
                      {p.num_compras}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-heading font-medium tabular-nums">
                        {usd(p.total_comprado_usd)}
                      </span>
                    </td>
                    <td className="text-muted-foreground px-4 py-3 tabular-nums">
                      {p.ultima_compra ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {p.activo ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          Activo
                        </span>
                      ) : (
                        <span className="bg-surface-2 text-heading rounded-full px-2 py-0.5 text-xs">
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3">
                        <Link
                          href={`/minimarket/proveedores/${p.id}`}
                          className="text-accent-600 text-xs hover:underline"
                        >
                          Ver
                        </Link>
                        <Link
                          href={`/minimarket/proveedores/${p.id}/editar`}
                          className="text-muted-foreground hover:text-heading text-xs"
                        >
                          Editar
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
