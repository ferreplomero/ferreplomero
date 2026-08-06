import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  CreditCard,
  DollarSign,
  Download,
  FileText,
  Package,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import {
  getResumenPeriodo,
  getVentasPorDia,
  getVentasPorMetodo,
  getProductosMasVendidos,
  getCierresDiarios,
  rangoPreset,
  getInventarioReporte,
  getProductosBajaRotacion,
  getVentasPorCajero,
} from "@/lib/minimarket/data/reportes";
import { getResumenCartera } from "@/lib/minimarket/data/clientes";
import { listCompras } from "@/lib/minimarket/data/compras";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { ReportesTabs } from "./reportes-tabs";

export const metadata: Metadata = { title: "Reportes" };

const METODO_LABEL: Record<string, string> = {
  efectivo_bs: "Efectivo Bs",
  efectivo_usd: "Efectivo USD",
  pago_movil: "Pago móvil",
  transferencia: "Transferencia",
  zelle: "Zelle",
  tarjeta: "Tarjeta / Punto",
  cashea: "Cashea",
  fiado: "Fiado",
};

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const sp = await searchParams;
  const periodo = (sp.periodo ?? "mes") as "hoy" | "semana" | "mes" | "mes-anterior";

  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);
  const tz = await getTimezoneNegocio(supabase, tenantId);
  const rango = rangoPreset(periodo, tz);

  const [
    resumen,
    ventasDia,
    porMetodo,
    masVendidos,
    cierres,
    cartera,
    comprasPendientes,
    tasa,
    inventario,
    bajaRotacion,
    porCajero,
  ] = await Promise.all([
    getResumenPeriodo(supabase, tenantId, rango, tz),
    getVentasPorDia(supabase, tenantId, rango, tz),
    getVentasPorMetodo(supabase, tenantId, rango, tz),
    getProductosMasVendidos(supabase, tenantId, rango, tz, 10),
    getCierresDiarios(supabase, tenantId, rango, tz),
    getResumenCartera(supabase, tenantId),
    listCompras(supabase, tenantId, { estado: "borrador" }),
    getTasaVigente(supabase, tenantId),
    getInventarioReporte(supabase, tenantId),
    getProductosBajaRotacion(supabase, tenantId, rango, tz, 15),
    getVentasPorCajero(supabase, tenantId, rango, tz),
  ]);

  const tasaValor = tasa?.valor ?? 1;
  const usd = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(v);
  const bs = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "VES" }).format(v);
  const pct = (v: number, total: number) =>
    total > 0 ? ((v / total) * 100).toFixed(1) + "%" : "—";

  const periodos = [
    { key: "hoy", label: "Hoy" },
    { key: "semana", label: "7 días" },
    { key: "mes", label: "30 días" },
    { key: "mes-anterior", label: "Mes anterior" },
  ] as const;

  const periodoLabel = periodos.find((p) => p.key === periodo)?.label ?? "30 días";

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <ReportesTabs activo="/minimarket/reportes" />

      {/* Encabezado + selector de período */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">Reportes</h1>
          <p className="text-muted-foreground">
            {rango.desde === rango.hasta ? rango.desde : `${rango.desde} — ${rango.hasta}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {periodos.map((p) => (
            <a
              key={p.key}
              href={`/minimarket/reportes?periodo=${p.key}`}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                periodo === p.key
                  ? "bg-accent-500 text-white"
                  : "border-border text-muted-foreground hover:text-heading border"
              }`}
            >
              {p.label}
            </a>
          ))}
        </div>
      </header>

      {/* Métricas principales */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Ventas totales",
            valor: usd(resumen.totalVentasUsd),
            sub: bs(resumen.totalVentasUsd * tasaValor),
            Icon: TrendingUp,
          },
          {
            label: `${resumen.numVentas} transacciones`,
            valor: usd(resumen.ticketPromedioUsd),
            sub: "Ticket promedio",
            Icon: ShoppingCart,
          },
          {
            label: "Utilidad estimada",
            valor: usd(resumen.utilidadEstimadaUsd),
            sub: pct(resumen.utilidadEstimadaUsd, resumen.totalVentasUsd) + " de margen",
            Icon: BarChart3,
          },
          {
            label: "IGTF cobrado",
            valor: usd(resumen.igtfUsd),
            sub: bs(resumen.igtfUsd * tasaValor),
            Icon: DollarSign,
          },
        ].map(({ label, valor, sub, Icon }) => (
          <Card key={label} className="space-y-3 p-5">
            <span className="bg-accent-500/12 text-accent-600 inline-flex size-10 items-center justify-center rounded-xl">
              <Icon className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-muted-foreground text-xs">{label}</p>
              <p className="text-heading font-display mt-0.5 text-xl font-semibold tabular-nums">
                {valor}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">{sub}</p>
            </div>
          </Card>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Ventas por día */}
        <Card className="overflow-hidden p-0">
          <div className="border-border border-b px-4 py-3">
            <p className="text-heading text-sm font-medium">Ventas por día — {periodoLabel}</p>
          </div>
          {ventasDia.length === 0 ? (
            <p className="text-muted-foreground px-4 py-8 text-center text-sm">
              Sin ventas en este período.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2.5">Fecha</th>
                    <th className="px-4 py-2.5 text-right">Ventas</th>
                    <th className="px-4 py-2.5 text-right">Total USD</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {ventasDia.map((d) => (
                    <tr key={d.fecha} className="hover:bg-surface-2 transition-colors">
                      <td className="text-muted-foreground px-4 py-2.5 tabular-nums">{d.fecha}</td>
                      <td className="text-muted-foreground px-4 py-2.5 text-right tabular-nums">
                        {d.num_ventas}
                      </td>
                      <td className="text-heading px-4 py-2.5 text-right font-medium tabular-nums">
                        {usd(d.total_usd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Por método de pago */}
        <Card className="overflow-hidden p-0">
          <div className="border-border border-b px-4 py-3">
            <p className="text-heading text-sm font-medium">Por método de pago</p>
          </div>
          {porMetodo.length === 0 ? (
            <p className="text-muted-foreground px-4 py-8 text-center text-sm">
              Sin datos de pagos.
            </p>
          ) : (
            <div className="divide-border divide-y">
              {porMetodo.map((m) => {
                const total = porMetodo.reduce((s, x) => s + x.monto_total, 0);
                const pctWidth = total > 0 ? (m.monto_total / total) * 100 : 0;
                return (
                  <div key={`${m.metodo}:${m.moneda}`} className="space-y-1 px-4 py-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-heading font-medium">
                        {METODO_LABEL[m.metodo] ?? m.metodo}
                      </span>
                      <span className="tabular-nums">
                        {m.moneda === "VES" ? bs(m.monto_total) : usd(m.monto_total)}
                      </span>
                    </div>
                    <div className="bg-surface-2 h-1.5 overflow-hidden rounded-full">
                      <div
                        className="bg-accent-500 h-full rounded-full"
                        style={{ width: `${pctWidth}%` }}
                      />
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {m.num_pagos} pago{m.num_pagos !== 1 ? "s" : ""} — {pct(m.monto_total, total)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Productos más vendidos */}
        <Card className="overflow-hidden p-0">
          <div className="border-border border-b px-4 py-3">
            <p className="text-heading text-sm font-medium">Top 10 — más vendidos</p>
          </div>
          {masVendidos.length === 0 ? (
            <p className="text-muted-foreground px-4 py-8 text-center text-sm">
              Sin datos de ventas.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2.5">#</th>
                    <th className="px-4 py-2.5">Producto</th>
                    <th className="px-4 py-2.5 text-right">Unidades</th>
                    <th className="px-4 py-2.5 text-right">Ingreso</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {masVendidos.map((p, i) => (
                    <tr
                      key={p.producto_id ?? p.descripcion}
                      className="hover:bg-surface-2 transition-colors"
                    >
                      <td className="text-muted-foreground px-4 py-2.5 tabular-nums">{i + 1}</td>
                      <td className="text-heading px-4 py-2.5 font-medium">{p.descripcion}</td>
                      <td className="text-muted-foreground px-4 py-2.5 text-right tabular-nums">
                        {p.unidades}
                      </td>
                      <td className="text-heading px-4 py-2.5 text-right tabular-nums">
                        {usd(p.ingreso_usd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Fiado y compras pendientes */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <CreditCard className="text-muted-foreground size-4" />
              <p className="text-heading text-sm font-medium">Cuentas por cobrar</p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Clientes con deuda</p>
                <p className="text-heading mt-0.5 text-xl font-bold tabular-nums">
                  {cartera.clientesConDeuda}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Total por cobrar</p>
                <p className="text-danger mt-0.5 text-xl font-bold tabular-nums">
                  {usd(cartera.totalCarteraUsd)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Morosos (+30 días)</p>
                <p className="text-heading mt-0.5 text-lg font-semibold tabular-nums">
                  {cartera.clientesMorosos}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Fiado otorgado en período</p>
                <p className="text-heading mt-0.5 text-lg font-semibold tabular-nums">
                  {usd(resumen.fiadoOtorgadoUsd)}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-heading mb-3 text-sm font-medium">Compras por pagar</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Compras pendientes</p>
                <p className="text-heading mt-0.5 text-xl font-bold tabular-nums">
                  {comprasPendientes.length}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Total pendiente</p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-amber-600">
                  {usd(comprasPendientes.reduce((s, c) => s + Number(c.total_usd), 0))}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Cierre diario */}
      <Card className="overflow-hidden p-0">
        <div className="border-border border-b px-4 py-3">
          <p className="text-heading text-sm font-medium">Cierre diario</p>
        </div>
        {cierres.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm">
            Sin cierres en este período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3 text-right">Ventas</th>
                  <th className="px-4 py-3 text-right">Total USD</th>
                  <th className="px-4 py-3 text-right">IGTF</th>
                  <th className="px-4 py-3 text-right">Fiado</th>
                  <th className="px-4 py-3">Métodos</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {cierres.map((c) => (
                  <tr key={c.fecha} className="hover:bg-surface-2 transition-colors">
                    <td className="text-muted-foreground px-4 py-3 tabular-nums">{c.fecha}</td>
                    <td className="text-muted-foreground px-4 py-3 text-right tabular-nums">
                      {c.num_ventas}
                    </td>
                    <td className="text-heading px-4 py-3 text-right font-medium tabular-nums">
                      {usd(c.total_usd)}
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-right tabular-nums">
                      {usd(c.igtf_usd)}
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-right tabular-nums">
                      {usd(c.fiado_usd)}
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-xs">
                      {c.metodos
                        .map((m) => `${METODO_LABEL[m.metodo] ?? m.metodo}: ${usd(m.monto)}`)
                        .join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Inventario — valorización */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="font-display text-heading text-lg font-semibold">Inventario actual</h2>
            <p className="text-muted-foreground text-sm">
              {inventario.totalProductos} productos · {inventario.productosBajoMinimo} bajo mínimo
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href={`/minimarket/reportes/exportar?tipo=inventario`}
              className="border-border text-muted-foreground hover:text-heading inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
            >
              <Download className="size-3.5" aria-hidden />
              Exportar CSV
            </a>
          </div>
        </div>

        {/* Resumen de valor */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              label: "Valor a costo (USD)",
              valor: usd(inventario.valorCostoUsd),
              sub: bs(inventario.valorCostoUsd * tasaValor),
              Icon: Package,
            },
            {
              label: "Valor a precio venta (USD)",
              valor: usd(inventario.valorVentaUsd),
              sub: `Margen potencial: ${usd(inventario.valorVentaUsd - inventario.valorCostoUsd)}`,
              Icon: TrendingUp,
            },
            {
              label: "Productos bajo mínimo",
              valor: String(inventario.productosBajoMinimo),
              sub: inventario.productosBajoMinimo > 0 ? "Requieren reposición" : "Todo en orden",
              Icon: AlertTriangle,
              danger: inventario.productosBajoMinimo > 0,
            },
          ].map(({ label, valor, sub, Icon, danger }) => (
            <Card key={label} className="space-y-3 p-5">
              <span
                className={`inline-flex size-10 items-center justify-center rounded-xl ${
                  danger ? "bg-red-100 text-red-600" : "bg-accent-500/12 text-accent-600"
                }`}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-muted-foreground text-xs">{label}</p>
                <p
                  className={`font-display mt-0.5 text-xl font-semibold tabular-nums ${
                    danger ? "text-danger" : "text-heading"
                  }`}
                >
                  {valor}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">{sub}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* Tabla de inventario completa */}
        {inventario.items.length > 0 ? (
          <Card className="overflow-hidden p-0">
            <div className="border-border flex items-center justify-between border-b px-4 py-3">
              <p className="text-heading text-sm font-medium">Detalle por producto</p>
              {inventario.productosBajoMinimo > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                  <AlertTriangle className="size-3" />
                  {inventario.productosBajoMinimo} bajo mínimo
                </span>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2.5">Producto</th>
                    <th className="px-4 py-2.5">Categoría</th>
                    <th className="px-4 py-2.5 text-right">Stock</th>
                    <th className="px-4 py-2.5 text-right">Costo USD</th>
                    <th className="px-4 py-2.5 text-right">Precio USD</th>
                    <th className="px-4 py-2.5 text-right">Val. costo</th>
                    <th className="px-4 py-2.5 text-right">Val. venta</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {inventario.items.map((p) => (
                    <tr
                      key={p.id}
                      className={`hover:bg-surface-2 transition-colors ${p.bajo_minimo ? "bg-red-50/40" : ""}`}
                    >
                      <td className="px-4 py-2.5">
                        <span className="text-heading font-medium">{p.nombre}</span>
                        {p.codigo ? (
                          <span className="text-muted-foreground ml-1.5 text-xs">{p.codigo}</span>
                        ) : null}
                        {p.bajo_minimo ? (
                          <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                            bajo mín.
                          </span>
                        ) : null}
                      </td>
                      <td className="text-muted-foreground px-4 py-2.5 text-xs">
                        {p.categoria ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span
                          className={`font-medium ${p.bajo_minimo ? "text-danger" : "text-heading"}`}
                        >
                          {p.stock_actual}
                        </span>
                        {p.stock_minimo !== null ? (
                          <span className="text-muted-foreground ml-1 text-xs">
                            / mín {p.stock_minimo}
                          </span>
                        ) : null}
                      </td>
                      <td className="text-muted-foreground px-4 py-2.5 text-right text-xs tabular-nums">
                        {p.costo_usd > 0 ? usd(p.costo_usd) : "—"}
                      </td>
                      <td className="text-muted-foreground px-4 py-2.5 text-right text-xs tabular-nums">
                        {p.precio_usd > 0 ? usd(p.precio_usd) : "—"}
                      </td>
                      <td className="text-heading px-4 py-2.5 text-right text-xs font-medium tabular-nums">
                        {p.costo_usd > 0 ? usd(p.valor_costo_total) : "—"}
                      </td>
                      <td className="text-heading px-4 py-2.5 text-right text-xs font-medium tabular-nums">
                        {p.precio_usd > 0 ? usd(p.valor_venta_total) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-border bg-surface-2/50 border-t">
                  <tr>
                    <td
                      colSpan={5}
                      className="text-muted-foreground px-4 py-2.5 text-xs font-medium uppercase tracking-wide"
                    >
                      Totales
                    </td>
                    <td className="text-heading px-4 py-2.5 text-right text-xs font-bold tabular-nums">
                      {usd(inventario.valorCostoUsd)}
                    </td>
                    <td className="text-heading px-4 py-2.5 text-right text-xs font-bold tabular-nums">
                      {usd(inventario.valorVentaUsd)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        ) : (
          <Card className="py-12 text-center">
            <p className="text-muted-foreground text-sm">Sin productos con stock registrado.</p>
          </Card>
        )}
      </section>

      {/* Ventas por cajero */}
      {porCajero.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <div className="border-border border-b px-4 py-3">
            <p className="text-heading text-sm font-medium">Ventas por cajero — {periodoLabel}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2.5">Cajero</th>
                  <th className="px-4 py-2.5 text-right">Ventas</th>
                  <th className="px-4 py-2.5 text-right">Total USD</th>
                  <th className="px-4 py-2.5 text-right">IGTF</th>
                  <th className="px-4 py-2.5 text-right">Ticket prom.</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {porCajero.map((c) => (
                  <tr
                    key={c.cajero_id ?? "sin-cajero"}
                    className="hover:bg-surface-2 transition-colors"
                  >
                    <td className="text-heading px-4 py-2.5 font-medium">{c.cajero_nombre}</td>
                    <td className="text-muted-foreground px-4 py-2.5 text-right tabular-nums">
                      {c.num_ventas}
                    </td>
                    <td className="text-heading px-4 py-2.5 text-right font-medium tabular-nums">
                      {usd(c.total_usd)}
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5 text-right tabular-nums">
                      {usd(c.igtf_usd)}
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5 text-right tabular-nums">
                      {usd(c.ticket_promedio_usd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* Baja rotación */}
      {bajaRotacion.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <div className="border-border border-b px-4 py-3">
            <p className="text-heading text-sm font-medium">Productos de baja rotación</p>
            <p className="text-muted-foreground text-xs">
              Con stock disponible pero pocas o ninguna venta en el período seleccionado
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2.5">Producto</th>
                  <th className="px-4 py-2.5 text-right">Stock</th>
                  <th className="px-4 py-2.5 text-right">Unid. vendidas</th>
                  <th className="px-4 py-2.5 text-right">Días sin venta</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {bajaRotacion.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className="text-heading font-medium">{p.nombre}</span>
                      {p.codigo ? (
                        <span className="text-muted-foreground ml-1.5 text-xs">{p.codigo}</span>
                      ) : null}
                    </td>
                    <td className="text-heading px-4 py-2.5 text-right font-medium tabular-nums">
                      {p.stock_actual}
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5 text-right tabular-nums">
                      {p.unidades_vendidas}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {p.dias_sin_venta !== null ? (
                        <span
                          className={
                            p.dias_sin_venta > 30
                              ? "font-semibold text-amber-600"
                              : "text-muted-foreground"
                          }
                        >
                          {p.dias_sin_venta} días
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Sin ventas</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* Exportar */}
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="text-heading text-sm font-medium">Exportar datos</p>
          <p className="text-muted-foreground text-xs">
            Descarga los datos del período seleccionado en formato CSV compatible con Excel.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/minimarket/reportes/exportar?tipo=ventas&desde=${rango.desde}&hasta=${rango.hasta}`}
            className="border-border text-muted-foreground hover:text-heading inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
          >
            <Download className="size-4" aria-hidden />
            Ventas CSV
          </a>
          <a
            href={`/minimarket/reportes/exportar?tipo=inventario`}
            className="border-border text-muted-foreground hover:text-heading inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
          >
            <Download className="size-4" aria-hidden />
            Inventario CSV
          </a>
          <a
            href={`/minimarket/reportes/exportar?tipo=pdf&desde=${rango.desde}&hasta=${rango.hasta}`}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border text-muted-foreground hover:text-heading inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
          >
            <FileText className="size-4" aria-hidden />
            Imprimir / PDF
          </a>
        </div>
      </Card>
    </div>
  );
}
