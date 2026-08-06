import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, PackageOpen, ShoppingCart } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listCompras, type CompraConProveedor } from "@/lib/minimarket/data/compras";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";

export const metadata: Metadata = { title: "Cuentas por pagar" };

/** Lo que de verdad se le debe al proveedor por esta compra: costo + IVA +
 * IGTF — no solo `total_usd` (que antes esta página usaba solo, subestimando
 * el monto real cuando la compra tenía IVA/IGTF). Mismo criterio que ya usa
 * Finanzas → Compras. */
function montoAdeudado(c: CompraConProveedor): number {
  return Number(c.total_usd) + Number(c.iva_usd) + Number(c.igtf_usd);
}

export default async function PorPagarPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);

  // "Cuentas por pagar" de verdad: mercancía YA RECIBIDA y todavía sin
  // pagarle al proveedor (mm_compras.pagada = false). Antes esta página solo
  // mostraba compras en estado "borrador" (aún no recibidas, un concepto
  // distinto — ver comprasPendientesRecibir abajo) y las sumaba igual aunque
  // ya se hubieran pagado por adelantado.
  const [comprasPorPagar, comprasPendientesRecibir, tasa] = await Promise.all([
    listCompras(supabase, tenantId, { estado: "recibida", pagada: false }),
    listCompras(supabase, tenantId, { estado: "borrador" }),
    getTasaVigente(supabase, tenantId),
  ]);

  const tasaValor = tasa?.valor ?? 1;
  const usd = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(v);
  const bs = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "VES" }).format(v);

  const totalPorPagar = comprasPorPagar.reduce((s, c) => s + montoAdeudado(c), 0);
  // Órdenes en borrador que ya se pagaron por adelantado no representan
  // dinero pendiente (esa plata ya salió de caja/banco) — se excluyen del
  // total, aunque la orden en sí siga apareciendo en su propia sección como
  // referencia de mercancía en tránsito.
  const comprasEnTransitoSinPagar = comprasPendientesRecibir.filter((c) => !c.pagada);
  const totalEnTransitoSinPagar = comprasEnTransitoSinPagar.reduce(
    (s, c) => s + montoAdeudado(c),
    0,
  );

  const porProveedor = new Map<string, { nombre: string; total: number; num: number }>();
  for (const c of comprasPorPagar) {
    const key = c.proveedor_id ?? "sin-proveedor";
    const entry = porProveedor.get(key) ?? {
      nombre: c.proveedor_nombre ?? "Sin proveedor",
      total: 0,
      num: 0,
    };
    entry.total += montoAdeudado(c);
    entry.num += 1;
    porProveedor.set(key, entry);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">Cuentas por pagar</h1>
          <p className="text-muted-foreground">
            Mercancía ya recibida y todavía sin pagarle al proveedor.
          </p>
        </div>
        <Link
          href="/minimarket/compras/nueva"
          className="bg-accent-500 hover:bg-accent-600 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors sm:shrink-0"
        >
          + Nueva compra
        </Link>
      </header>

      {comprasPorPagar.length === 0 ? (
        <Card className="py-14 text-center">
          <ShoppingCart className="text-muted-foreground mx-auto mb-3 size-10" />
          <p className="text-heading font-medium">Sin cuentas por pagar</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Toda la mercancía recibida ya está pagada.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-muted-foreground text-xs">Compras sin pagar</p>
              <p className="text-heading font-display mt-1 text-2xl font-bold tabular-nums">
                {comprasPorPagar.length}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-muted-foreground text-xs">Total por pagar (USD)</p>
              <p className="font-display mt-1 text-2xl font-bold tabular-nums text-amber-600">
                {usd(totalPorPagar)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-muted-foreground text-xs">Equivalente en bolívares</p>
              <p className="text-heading font-display mt-1 text-2xl font-bold tabular-nums">
                {bs(totalPorPagar * tasaValor)}
              </p>
            </Card>
          </div>

          {porProveedor.size > 1 ? (
            <Card className="overflow-hidden p-0">
              <div className="border-border border-b px-4 py-3">
                <p className="text-heading text-sm font-medium">Resumen por proveedor</p>
              </div>
              <div className="divide-border divide-y">
                {[...porProveedor.values()]
                  .sort((a, b) => b.total - a.total)
                  .map((p) => (
                    <div
                      key={p.nombre}
                      className="flex items-center justify-between gap-2 px-4 py-3 text-sm"
                    >
                      <span className="text-heading min-w-0 truncate font-medium">{p.nombre}</span>
                      <div className="shrink-0 text-right">
                        <p className="font-medium tabular-nums text-amber-600">{usd(p.total)}</p>
                        <p className="text-muted-foreground text-xs">
                          {p.num} compra{p.num !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </Card>
          ) : null}

          <Card className="overflow-hidden p-0">
            <div className="border-border flex items-center gap-2 border-b px-4 py-3">
              <AlertTriangle className="size-4 text-amber-500" />
              <p className="text-heading text-sm font-medium">
                {comprasPorPagar.length} compra{comprasPorPagar.length !== 1 ? "s" : ""} recibida
                {comprasPorPagar.length !== 1 ? "s" : ""} sin pagar
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Proveedor</th>
                    <th className="px-4 py-3">Sucursal</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {comprasPorPagar.map((c) => (
                    <tr key={c.id} className="hover:bg-surface-2 transition-colors">
                      <td className="text-muted-foreground px-4 py-3 tabular-nums">{c.fecha}</td>
                      <td className="text-heading px-4 py-3 font-medium">
                        {c.proveedor_nombre ?? "Sin proveedor"}
                      </td>
                      <td className="text-muted-foreground px-4 py-3">
                        {c.sucursal_nombre ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-medium tabular-nums text-amber-600">
                          {usd(montoAdeudado(c))}
                        </p>
                        <p className="text-muted-foreground text-xs tabular-nums">
                          {bs(montoAdeudado(c) * tasaValor)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/minimarket/compras/${c.id}`}
                          className="text-accent-600 text-xs font-medium hover:underline"
                        >
                          Ver / registrar pago →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {comprasPendientesRecibir.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <div className="border-border flex items-center gap-2 border-b px-4 py-3">
            <PackageOpen className="text-muted-foreground size-4" />
            <div>
              <p className="text-heading text-sm font-medium">
                {comprasPendientesRecibir.length} orden
                {comprasPendientesRecibir.length !== 1 ? "es" : ""} pendiente
                {comprasPendientesRecibir.length !== 1 ? "s" : ""} de recibir
              </p>
              <p className="text-muted-foreground text-xs">
                Mercancía todavía no recibida — no cuenta como deuda hasta que se confirme la
                recepción.
                {comprasEnTransitoSinPagar.length > 0
                  ? ` De estas, ${usd(totalEnTransitoSinPagar)} quedarán pendientes de pago al proveedor cuando lleguen.`
                  : ""}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3">Sucursal</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {comprasPendientesRecibir.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2 transition-colors">
                    <td className="text-muted-foreground px-4 py-3 tabular-nums">{c.fecha}</td>
                    <td className="text-heading px-4 py-3 font-medium">
                      {c.proveedor_nombre ?? "Sin proveedor"}
                    </td>
                    <td className="text-muted-foreground px-4 py-3">{c.sucursal_nombre ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-heading font-medium tabular-nums">
                        {usd(Number(c.total_usd))}
                      </p>
                      <p className="text-muted-foreground text-xs tabular-nums">
                        {bs(Number(c.total_usd) * tasaValor)}
                      </p>
                      {c.pagada ? (
                        <p className="text-xs text-green-600">Ya pagada</p>
                      ) : (
                        <p className="text-xs text-amber-600">Sin pagar</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/minimarket/compras/${c.id}`}
                        className="text-accent-600 text-xs font-medium hover:underline"
                      >
                        Ver y recibir →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
