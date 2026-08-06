import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BookOpen, Clock, CreditCard, Printer, User } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getVentaDetalle } from "@/lib/minimarket/data/ventas";
import { METODOS_PAGO } from "@/lib/minimarket/constants";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import {
  fmtFechaHora as dfFechaHora,
  fmtFechaLarga as dfFechaLarga,
} from "@/lib/minimarket/date-format";
import { BotonAnular } from "@/components/minimarket/ventas/boton-anular";

interface Props {
  params: Promise<{ id: string }>;
}

// `generateMetadata` y la página se ejecutan por separado — sin memoizar,
// getVentaDetalle (7 consultas internas) se pedía dos veces en cada carga.
// cache() dedupe por tenantId+id dentro de la misma request (mismo patrón que
// getSessionContext en lib/auth/session.ts).
const getVentaDetalleCached = cache(async (tenantId: string, id: string) => {
  const supabase = await createClient();
  return getVentaDetalle(supabase, tenantId, id);
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const session = await getSessionContext();
  if (!session?.activeTenant?.id) return { title: "Venta" };
  const venta = await getVentaDetalleCached(session.activeTenant.id, id);
  return { title: venta ? `Venta ${venta.numero ?? id.slice(0, 8)}` : "Venta" };
}

const ESTADO_BADGE = {
  completada: { label: "Pagada", cls: "bg-green-100 text-green-800" },
  anulada: { label: "Anulada", cls: "bg-red-100 text-red-600" },
} as const;

function metodoLabel(metodo: string): string {
  return METODOS_PAGO.find((m) => m.value === metodo)?.label ?? metodo;
}

export default async function VentaDetallePage({ params }: Props) {
  const { id } = await params;

  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);
  const [venta, tz] = await Promise.all([
    getVentaDetalleCached(tenantId, id),
    getTimezoneNegocio(supabase, tenantId),
  ]);

  if (!venta) notFound();

  const usd = (n: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(n);
  const bs = (n: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "VES" }).format(n);
  const fmtFecha = (s: string) => dfFechaLarga(s, tz);
  const fmtFechaHora = (s: string) => dfFechaHora(s, tz);

  const badge =
    venta.fiado?.estado === "abierto"
      ? { label: "Fiada", cls: "bg-orange-100 text-orange-700" }
      : (ESTADO_BADGE[venta.estado] ?? ESTADO_BADGE.completada);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Cabecera */}
      <header className="space-y-1">
        <Link
          href="/minimarket/ventas"
          className="text-muted-foreground hover:text-heading mb-2 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Historial de ventas
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-display text-heading text-2xl font-semibold">
              {"Recibo"} {venta.numero ? `· ${venta.numero}` : ""}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                {badge.label}
              </span>
              <span className="text-muted-foreground text-sm">{fmtFecha(venta.fecha)}</span>
              {venta.cajero_nombre ? (
                <span className="text-muted-foreground flex items-center gap-1 text-sm">
                  <Clock className="size-3.5" aria-hidden />
                  {fmtFechaHora(venta.created_at).split(",")[1]?.trim() ?? ""}
                  {" · "}
                  {venta.cajero_nombre}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:shrink-0 sm:flex-row sm:items-center">
            <Link
              href={`/minimarket/ventas/${id}/recibo`}
              className="border-border text-heading hover:bg-surface-2 inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors"
            >
              <Printer className="size-4" />
              Ver recibo
            </Link>
            {venta.estado === "completada" ? <BotonAnular ventaId={id} /> : null}
          </div>
        </div>
      </header>

      {/* Datos generales */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Negocio */}
        <Card className="space-y-3 p-5">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Negocio
          </p>
          <div>
            <p className="text-heading font-medium">{venta.negocio.nombre}</p>
            {venta.negocio.rif ? (
              <p className="text-muted-foreground text-sm">RIF: {venta.negocio.rif}</p>
            ) : null}
          </div>
        </Card>

        {/* Cliente */}
        <Card className="space-y-3 p-5">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Cliente
          </p>
          {venta.cliente ? (
            <div className="flex items-start gap-2">
              <User className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              <div>
                <Link
                  href={`/minimarket/clientes/${venta.cliente.id}`}
                  className="text-accent-600 font-medium hover:underline"
                >
                  {venta.cliente.nombre}
                </Link>
                {venta.cliente.cedula ? (
                  <p className="text-muted-foreground text-sm">CI: {venta.cliente.cedula}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">Consumidor final</p>
          )}
        </Card>
      </div>

      {/* Ítems */}
      <Card className="overflow-hidden p-0">
        <div className="border-border border-b px-4 py-3">
          <p className="text-heading text-sm font-medium">
            {venta.lineas.length} producto{venta.lineas.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Descripción</th>
                <th className="px-4 py-3 text-right">Cant.</th>
                <th className="px-4 py-3 text-right">Precio unit.</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {venta.lineas.map((l, i) => (
                <tr key={i} className="hover:bg-surface-2 transition-colors">
                  <td className="text-heading px-4 py-3 font-medium">{l.descripcion}</td>
                  <td className="text-muted-foreground px-4 py-3 text-right tabular-nums">
                    {l.cantidad}
                  </td>
                  <td className="text-muted-foreground px-4 py-3 text-right tabular-nums">
                    {usd(l.precioUsd)}
                  </td>
                  <td className="text-heading px-4 py-3 text-right font-medium tabular-nums">
                    {usd(l.totalUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Totales y pagos */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Totales */}
        <Card className="space-y-2 p-5 text-sm">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Resumen
          </p>
          {venta.descuento_usd > 0 ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal bruto</span>
                <span className="tabular-nums">{usd(venta.subtotalUsd + venta.descuento_usd)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Descuento</span>
                <span className="text-success tabular-nums">−{usd(venta.descuento_usd)}</span>
              </div>
            </>
          ) : null}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{usd(venta.subtotalUsd)}</span>
          </div>
          {(() => {
            const ivaUsd = Math.max(0, venta.totalUsd - venta.igtfUsd - venta.subtotalUsd);
            return ivaUsd > 0.001 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">IVA registrado</span>
                <span className="tabular-nums">{usd(ivaUsd)}</span>
              </div>
            ) : null;
          })()}
          {venta.igtfUsd > 0 ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">IGTF cobrado (3 %)</span>
              <span className="tabular-nums">{usd(venta.igtfUsd)}</span>
            </div>
          ) : null}
          <div className="border-border flex justify-between border-t pt-2 text-base font-semibold">
            <span>Total USD</span>
            <span className="tabular-nums">{usd(venta.totalUsd)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Bs</span>
            <span className="tabular-nums">{bs(venta.totalBs)}</span>
          </div>
          <p className="text-muted-foreground border-border border-t pt-2 text-right text-xs tabular-nums">
            Tasa: Bs.&nbsp;{venta.tasa.toFixed(2)} / USD
          </p>
        </Card>

        {/* Métodos de pago */}
        <Card className="space-y-2 p-5 text-sm">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Forma de pago
          </p>
          {venta.pagos.length > 0 ? (
            venta.pagos.map((p, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-muted-foreground">{metodoLabel(p.metodo)}</span>
                <span className="tabular-nums">
                  {p.moneda === "USD" ? usd(p.monto) : bs(p.monto)}
                </span>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">Sin información de pago</p>
          )}
          {venta.cajero_nombre ? (
            <div className="border-border mt-2 flex items-center gap-1.5 border-t pt-2 text-xs">
              <User className="text-muted-foreground size-3.5" aria-hidden />
              <span className="text-muted-foreground">Cajero:</span>
              <span className="text-heading font-medium">{venta.cajero_nombre}</span>
            </div>
          ) : null}
        </Card>
      </div>

      {/* Cuenta por cobrar (fiado) */}
      {venta.fiado ? (
        <Card className="space-y-4 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="size-5 text-orange-500" aria-hidden />
              <p className="text-heading font-medium">Cuenta por cobrar (fiado)</p>
            </div>
            {venta.cliente ? (
              <Link
                href={`/minimarket/fiado`}
                className="text-accent-600 flex items-center gap-1 text-sm hover:underline"
              >
                <BookOpen className="size-4" />
                Ver en Fiado →
              </Link>
            ) : null}
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="bg-surface-2 rounded-lg p-3">
              <p className="text-muted-foreground text-xs">Monto original</p>
              <p className="text-heading font-display mt-0.5 font-semibold tabular-nums">
                {usd(venta.fiado.monto_usd)}
              </p>
            </div>
            <div className="bg-surface-2 rounded-lg p-3">
              <p className="text-muted-foreground text-xs">Total abonado</p>
              <p className="text-heading font-display mt-0.5 font-semibold tabular-nums">
                {usd(venta.fiado.monto_usd - venta.fiado.saldo_usd)}
              </p>
            </div>
            <div
              className={`rounded-lg p-3 ${venta.fiado.saldo_usd > 0 ? "bg-orange-50" : "bg-green-50"}`}
            >
              <p className="text-muted-foreground text-xs">Saldo pendiente</p>
              <p
                className={`font-display mt-0.5 font-semibold tabular-nums ${venta.fiado.saldo_usd > 0 ? "text-orange-700" : "text-green-700"}`}
              >
                {usd(venta.fiado.saldo_usd)}
              </p>
            </div>
          </div>

          {venta.fiado.abonos.length > 0 ? (
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
                Abonos recibidos
              </p>
              <div className="divide-border divide-y rounded-lg border text-sm">
                {venta.fiado.abonos.map((a) => (
                  <div key={a.id} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <span className="text-heading font-medium">{metodoLabel(a.metodo)}</span>
                      <span className="text-muted-foreground ml-2 text-xs">
                        {fmtFechaHora(a.created_at)}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-heading tabular-nums">{usd(a.monto_usd)}</p>
                      {a.igtf_usd > 0 ? (
                        <p className="text-muted-foreground text-xs tabular-nums">
                          IGTF: {usd(a.igtf_usd)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Sin abonos registrados aún.</p>
          )}
        </Card>
      ) : null}

      {/* Devolución de dinero (venta anulada) */}
      {venta.devolucion ? (
        <Card className="space-y-3 border-red-200 p-5">
          <div className="flex items-center gap-2">
            <CreditCard className="text-danger size-5" aria-hidden />
            <p className="text-heading font-medium">Devolución registrada</p>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg bg-red-50 p-3">
              <p className="text-muted-foreground text-xs">Monto devuelto</p>
              <p className="text-danger font-display mt-0.5 font-semibold tabular-nums">
                {usd(venta.devolucion.montoUsd)}
              </p>
              <p className="text-muted-foreground text-xs tabular-nums">
                {bs(venta.devolucion.montoBs)}
              </p>
            </div>
            <div className="bg-surface-2 rounded-lg p-3">
              <p className="text-muted-foreground text-xs">Método</p>
              <p className="text-heading mt-0.5 font-medium">
                {metodoLabel(venta.devolucion.metodo)}
                {venta.devolucion.banco ? ` · ${venta.devolucion.banco}` : ""}
              </p>
            </div>
            <div className="bg-surface-2 rounded-lg p-3">
              <p className="text-muted-foreground text-xs">Fecha</p>
              <p className="text-heading mt-0.5 font-medium">
                {fmtFechaHora(venta.devolucion.fecha)}
              </p>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
