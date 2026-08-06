import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, DollarSign, Package, Plus, ShoppingCart, Truck } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { listCompras, getResumenCompras } from "@/lib/minimarket/data/compras";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaCorta } from "@/lib/minimarket/date-format";

export const metadata: Metadata = { title: "Compras" };

const ESTADO_BADGE: Record<string, { label: string; cls: string }> = {
  borrador: { label: "Pendiente", cls: "bg-amber-100 text-amber-700" },
  recibida: { label: "Recibida", cls: "bg-green-100 text-green-700" },
  anulada: { label: "Anulada", cls: "bg-surface-2 text-heading" },
};

export default async function ComprasPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/inicio");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);

  const [compras, resumen, tasa, tz] = await Promise.all([
    listCompras(supabase, tenantId),
    getResumenCompras(supabase, tenantId),
    getTasaVigente(supabase, tenantId),
    getTimezoneNegocio(supabase, tenantId),
  ]);

  const tasaValor = tasa?.valor ?? 1;
  const usd = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(v);
  const bs = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "VES" }).format(v);

  const tarjetas = [
    { label: "Total compras", valor: String(resumen.totalCompras), Icon: ClipboardList },
    { label: "Pendientes de recibir", valor: String(resumen.comprasPendientes), Icon: Package },
    { label: "Comprado (recibidas)", valor: usd(resumen.totalCompradoUsd), Icon: DollarSign },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">Compras</h1>
          <p className="text-muted-foreground">
            Registra entradas de inventario. Al confirmar la recepción, el stock se suma
            automáticamente y el costo del producto se actualiza.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <Link
            href="/minimarket/proveedores"
            className="border-border text-heading hover:bg-surface-2 inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors"
          >
            <Truck className="size-4" />
            Proveedores
          </Link>
          <Link
            href="/minimarket/compras/nueva"
            className="bg-accent-500 hover:bg-accent-600 focus-visible:ring-ring inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2"
          >
            <Plus className="size-4" />
            Nueva compra
          </Link>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        {tarjetas.map(({ label, valor, Icon }) => (
          <Card key={label} className="flex items-center gap-3 p-4">
            <span className="bg-accent-500/12 text-accent-600 inline-flex size-10 items-center justify-center rounded-xl">
              <Icon className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-muted-foreground text-xs">{label}</p>
              <p className="text-heading font-display text-lg font-semibold tabular-nums">
                {valor}
              </p>
            </div>
          </Card>
        ))}
      </section>

      {compras.length === 0 ? (
        <Card className="py-16 text-center">
          <ShoppingCart className="text-muted-foreground mx-auto mb-3 size-10" />
          <p className="text-heading font-medium">Sin compras registradas</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Registra tu primera compra para comenzar a controlar el inventario.
          </p>
          <Link
            href="/minimarket/compras/nueva"
            className="bg-accent-500 hover:bg-accent-600 mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white"
          >
            <Plus className="size-4" />
            Nueva compra
          </Link>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <p className="text-heading text-sm font-medium">
              {compras.length} compra{compras.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Proveedor</th>
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
                      <td className="text-muted-foreground px-4 py-3 tabular-nums">
                        {fmtFechaCorta(c.fecha, tz)}
                      </td>
                      <td className="px-4 py-3">
                        {c.proveedor_nombre ? (
                          <span className="text-heading font-medium">{c.proveedor_nombre}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="text-muted-foreground px-4 py-3">
                        {c.sucursal_nombre ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-heading font-medium tabular-nums">
                          {usd(Number(c.total_usd))}
                        </p>
                        <p className="text-muted-foreground text-xs tabular-nums">
                          {bs(Number(c.total_usd) * tasaValor)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                        {c.metodo_pago === "credito_proveedor" && !c.pagada ? (
                          <span className="mt-1 block w-fit rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            Pago pendiente
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/minimarket/compras/${c.id}`}
                          className="text-accent-600 text-xs hover:underline"
                        >
                          Ver detalle
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
