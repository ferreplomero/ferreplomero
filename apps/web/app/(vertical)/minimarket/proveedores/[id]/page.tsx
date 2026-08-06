import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Edit2, Package, ShoppingCart } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  getProveedorConStats,
  listComprasDeProveedor,
  getProductosDelProveedor,
} from "@/lib/minimarket/data/compras";

interface Props {
  params: Promise<{ id: string }>;
}

// `generateMetadata` y la página se ejecutan por separado — sin memoizar,
// getProveedorConStats (3 consultas internas) se pedía dos veces en cada
// carga. cache() dedupe por tenantId+id dentro de la misma request (mismo
// patrón que getSessionContext en lib/auth/session.ts).
const getProveedorConStatsCached = cache(async (tenantId: string, id: string) => {
  const supabase = await createClient();
  return getProveedorConStats(supabase, tenantId, id);
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const session = await getSessionContext();
  if (!session?.activeTenant?.id) return { title: "Proveedor" };
  const p = await getProveedorConStatsCached(session.activeTenant.id, id);
  return { title: p ? `${p.nombre} — Proveedor` : "Proveedor" };
}

const ESTADO_BADGE: Record<string, { label: string; cls: string }> = {
  borrador: { label: "Pendiente", cls: "bg-amber-100 text-amber-700" },
  recibida: { label: "Recibida", cls: "bg-green-100 text-green-700" },
  anulada: { label: "Anulada", cls: "bg-surface-2 text-heading" },
};

export default async function ProveedorDetallePage({ params }: Props) {
  const { id } = await params;

  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);

  const [proveedor, compras, productos] = await Promise.all([
    getProveedorConStatsCached(tenantId, id),
    listComprasDeProveedor(supabase, tenantId, id),
    getProductosDelProveedor(supabase, tenantId, id),
  ]);

  if (!proveedor) notFound();

  const usd = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(v);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/minimarket/proveedores"
          className="text-muted-foreground hover:text-heading mb-2 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Proveedores
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-heading text-2xl font-semibold">{proveedor.nombre}</h1>
            {!proveedor.activo ? (
              <span className="bg-surface-2 text-heading mt-1 inline-block rounded-full px-2 py-0.5 text-xs">
                Inactivo
              </span>
            ) : null}
          </div>
          <Link
            href={`/minimarket/proveedores/${id}/editar`}
            className="border-border text-heading hover:bg-surface-2 inline-flex items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors sm:shrink-0"
          >
            <Edit2 className="size-4" />
            Editar
          </Link>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-muted-foreground text-xs">Total compras recibidas</p>
          <p className="text-heading font-display mt-1 text-2xl font-bold tabular-nums">
            {proveedor.num_compras}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-muted-foreground text-xs">Total comprado</p>
          <p className="text-heading font-display mt-1 text-2xl font-bold tabular-nums">
            {usd(proveedor.total_comprado_usd)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-muted-foreground text-xs">Última compra</p>
          <p className="text-heading font-display mt-1 text-2xl font-bold">
            {proveedor.ultima_compra ?? "—"}
          </p>
        </Card>
      </div>

      <Card className="space-y-3 p-5">
        <h2 className="text-heading font-medium">Contacto</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {proveedor.contacto ? (
            <div>
              <dt className="text-muted-foreground text-xs">Persona de contacto</dt>
              <dd className="text-heading">{proveedor.contacto}</dd>
            </div>
          ) : null}
          {proveedor.telefono ? (
            <div>
              <dt className="text-muted-foreground text-xs">Teléfono</dt>
              <dd>
                <a href={`tel:${proveedor.telefono}`} className="text-accent-600 hover:underline">
                  {proveedor.telefono}
                </a>
              </dd>
            </div>
          ) : null}
          {proveedor.whatsapp ? (
            <div>
              <dt className="text-muted-foreground text-xs">WhatsApp</dt>
              <dd>
                <a
                  href={`https://wa.me/${proveedor.whatsapp.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-600 hover:underline"
                >
                  {proveedor.whatsapp}
                </a>
              </dd>
            </div>
          ) : null}
          {!proveedor.contacto && !proveedor.telefono && !proveedor.whatsapp ? (
            <p className="text-muted-foreground col-span-2">Sin datos de contacto.</p>
          ) : null}
        </dl>
        {proveedor.notas ? (
          <div className="border-border mt-2 border-t pt-3">
            <p className="text-muted-foreground text-xs">Notas</p>
            <p className="text-heading mt-1 whitespace-pre-line text-sm">{proveedor.notas}</p>
          </div>
        ) : null}
      </Card>

      {productos.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <div className="border-border flex items-center gap-2 border-b px-4 py-3">
            <Package className="text-muted-foreground size-4" />
            <p className="text-heading text-sm font-medium">
              {productos.length} producto{productos.length !== 1 ? "s" : ""} asociados
            </p>
          </div>
          <div className="divide-border divide-y">
            {productos.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="text-heading truncate font-medium">{p.nombre}</p>
                  {p.codigo ? <p className="text-muted-foreground text-xs">{p.codigo}</p> : null}
                </div>
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  Costo: {usd(p.costo_usd)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="text-muted-foreground size-4" />
            <p className="text-heading text-sm font-medium">Historial de compras</p>
          </div>
          <Link
            href="/minimarket/compras/nueva"
            className="text-accent-600 text-xs hover:underline"
          >
            + Nueva compra
          </Link>
        </div>
        {compras.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm">
            Sin compras registradas para este proveedor.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Sucursal</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {compras.map((c) => {
                  const badge = ESTADO_BADGE[c.estado] ?? {
                    label: "Pendiente",
                    cls: "bg-amber-100 text-amber-700",
                  };
                  return (
                    <tr key={c.id} className="hover:bg-surface-2 transition-colors">
                      <td className="text-muted-foreground px-4 py-3 tabular-nums">{c.fecha}</td>
                      <td className="text-muted-foreground px-4 py-3">
                        {c.sucursal_nombre ?? "—"}
                      </td>
                      <td className="text-heading px-4 py-3 text-right font-medium tabular-nums">
                        {usd(Number(c.total_usd))}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/minimarket/compras/${c.id}`}
                          className="text-accent-600 text-xs hover:underline"
                        >
                          Ver
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
