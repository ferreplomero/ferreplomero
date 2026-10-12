import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download, FileSpreadsheet } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getPresupuestoDetalle } from "@/lib/minimarket/data/presupuestos";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaCorta, fmtFechaLarga } from "@/lib/minimarket/date-format";
import { linkPublicoPresupuesto } from "@/lib/minimarket/presupuesto-link";
import { PresupuestoWhatsappBoton } from "@/components/minimarket/presupuestos/presupuesto-whatsapp-boton";
import { etiquetaDescuentoPresupuesto } from "@/lib/minimarket/presupuestos/totales";
import { PresupuestoAcciones } from "./presupuesto-acciones";

interface Props {
  params: Promise<{ id: string }>;
}

const cargarDetalle = cache(async (tenantId: string, id: string) => {
  const supabase = await createClient();
  const tz = await getTimezoneNegocio(supabase, tenantId);
  const [presupuesto, configRes] = await Promise.all([
    getPresupuestoDetalle(supabase, tenantId, id, tz),
    supabase
      .from("mm_config_negocio")
      .select("nombre_comercial")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);
  return { presupuesto, tz, nombreComercial: configRes.data?.nombre_comercial || "el negocio" };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const session = await getSessionContext();
  if (!session?.activeTenant?.id) return { title: "Presupuesto" };
  const { presupuesto } = await cargarDetalle(session.activeTenant.id, id);
  return { title: presupuesto ? `Presupuesto ${presupuesto.numero}` : "Presupuesto" };
}

const ESTADO_BADGE: Record<string, { label: string; cls: string }> = {
  pendiente: { label: "Pendiente", cls: "bg-amber-100 text-amber-700" },
  vencido: { label: "Vencido", cls: "bg-red-100 text-red-600" },
  convertido: { label: "Convertido en venta", cls: "bg-green-100 text-green-700" },
  rechazado: { label: "Rechazado", cls: "bg-surface-2 text-heading" },
};

function badgeDe(estado: string): { label: string; cls: string } {
  return ESTADO_BADGE[estado] ?? { label: "Pendiente", cls: "bg-amber-100 text-amber-700" };
}

export default async function PresupuestoDetallePage({ params }: Props) {
  const { id } = await params;

  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const { presupuesto, tz, nombreComercial } = await cargarDetalle(tenantId, id);
  if (!presupuesto) notFound();

  const country = getCountryConfig(session.activeTenant?.country);
  const usd = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(v);
  const bs = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "VES" }).format(v);

  const estadoVisible = presupuesto.vencido ? "vencido" : presupuesto.estado;
  const badge = badgeDe(estadoVisible);
  const linkPublico = linkPublicoPresupuesto(presupuesto.id, tenantId);

  const tasaTexto = new Intl.NumberFormat(country.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(presupuesto.tasaUsada);
  const etiquetaDescuento = etiquetaDescuentoPresupuesto(
    presupuesto.descuentoTipo,
    presupuesto.descuentoValor,
  );
  const cantidadProductos = `${presupuesto.items.length} producto${presupuesto.items.length !== 1 ? "s" : ""}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/minimarket/presupuestos"
          className="text-muted-foreground hover:text-heading mb-2 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Presupuestos
        </Link>
        {/* flex-wrap + basis: si los botones no caben junto al título, bajan a
            la línea siguiente en vez de comprimir el título hasta dejarlo en
            una columna de una letra. */}
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1 basis-64">
            <h1 className="font-display text-heading text-2xl font-semibold">
              Presupuesto <span className="whitespace-nowrap">{presupuesto.numero}</span>
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}
              >
                {badge.label}
              </span>
              <span className="text-muted-foreground text-sm">
                {presupuesto.clienteNombre ?? "Cliente ocasional"}
              </span>
            </div>
          </div>
          <PresupuestoAcciones
            presupuestoId={presupuesto.id}
            estado={presupuesto.estado}
            vencido={presupuesto.vencido}
          />
        </div>
      </header>

      {presupuesto.estado === "convertido" && presupuesto.ventaId ? (
        <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          Este presupuesto ya se convirtió en venta.{" "}
          <Link
            href={`/minimarket/ventas/${presupuesto.ventaId}/recibo`}
            className="font-medium underline"
          >
            Ver el recibo
          </Link>
        </p>
      ) : null}

      {presupuesto.estado === "convertido" && !presupuesto.ventaId ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Este presupuesto figura como convertido, pero no se pudo confirmar la venta asociada
          (posible falla de conexión al momento del cobro). Verifica en el{" "}
          <Link href="/minimarket/ventas" className="font-medium underline">
            historial de ventas
          </Link>{" "}
          antes de volver a cobrarlo. Si la venta no aparece, duplica este presupuesto para generar
          uno nuevo.
        </p>
      ) : null}

      <Card className="grid gap-4 p-5 sm:grid-cols-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs">Cliente</p>
          <p className="text-heading mt-0.5 font-medium">
            {presupuesto.clienteNombre ?? "Cliente ocasional"}
          </p>
          {presupuesto.clienteCedula ? (
            <p className="text-muted-foreground text-xs">{presupuesto.clienteCedula}</p>
          ) : null}
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Fecha de emisión</p>
          <p className="text-heading mt-0.5 font-medium">
            {fmtFechaLarga(presupuesto.fechaEmision, tz)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Válido hasta</p>
          <p className="text-heading mt-0.5 font-medium tabular-nums">
            {fmtFechaCorta(presupuesto.validezHasta, tz)}
          </p>
        </div>
        <div className="sm:col-span-3">
          <p className="text-muted-foreground text-xs">Tasa de cambio al emitir</p>
          <p className="text-heading mt-0.5 font-medium tabular-nums">Bs {tasaTexto} por USD</p>
        </div>
        {presupuesto.notas ? (
          <div className="sm:col-span-3">
            <p className="text-muted-foreground text-xs">Notas</p>
            <p className="text-heading mt-0.5 whitespace-pre-line text-sm">{presupuesto.notas}</p>
          </div>
        ) : null}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-border border-b px-4 py-3">
          <p className="text-heading text-sm font-medium">{cantidadProductos}</p>
        </div>

        {/* Móvil: cada producto como tarjeta (sin una tabla que obligue a
            desplazarse de lado para ver los precios). */}
        <ul className="divide-border divide-y sm:hidden">
          {presupuesto.items.map((item) => (
            <li key={item.id} className="space-y-1 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-heading min-w-0 font-medium">{item.descripcion}</p>
                <p className="text-heading shrink-0 whitespace-nowrap font-medium tabular-nums">
                  {usd(item.subtotalUsd)}
                </p>
              </div>
              <p className="text-muted-foreground text-xs tabular-nums">
                {item.cantidad} × {usd(item.precioUnitarioUsd)}
              </p>
              {item.precioAjustado ? (
                <p className="text-muted-foreground text-xs">
                  Precio de lista: {usd(item.precioListaUsd)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>

        {/* Tablet y escritorio: tabla. */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Producto</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Cant.</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Precio unit.</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {presupuesto.items.map((item) => (
                <tr key={item.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-heading font-medium">{item.descripcion}</p>
                    {item.precioAjustado ? (
                      <p className="text-muted-foreground text-xs">
                        Precio de lista: {usd(item.precioListaUsd)}
                      </p>
                    ) : null}
                  </td>
                  <td className="text-muted-foreground whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {item.cantidad}
                  </td>
                  <td className="text-muted-foreground whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {usd(item.precioUnitarioUsd)}
                  </td>
                  <td className="text-heading whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">
                    {usd(item.subtotalUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totales fuera de la tabla: siempre visibles completos, en
            cualquier ancho de pantalla. */}
        <dl className="border-border space-y-2 border-t px-4 py-4 text-sm">
          <div className="flex items-center justify-between gap-4 sm:ml-auto sm:max-w-sm">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="text-heading whitespace-nowrap tabular-nums">
              {usd(presupuesto.subtotalUsd)}
            </dd>
          </div>
          {presupuesto.descuentoUsd > 0 ? (
            <div className="flex items-center justify-between gap-4 sm:ml-auto sm:max-w-sm">
              <dt className="text-muted-foreground">{etiquetaDescuento}</dt>
              <dd className="text-success whitespace-nowrap tabular-nums">
                −{usd(presupuesto.descuentoUsd)}
              </dd>
            </div>
          ) : null}
          {presupuesto.ivaUsd > 0 ? (
            <div className="flex items-center justify-between gap-4 sm:ml-auto sm:max-w-sm">
              <dt className="text-muted-foreground">IVA</dt>
              <dd className="text-heading whitespace-nowrap tabular-nums">
                {usd(presupuesto.ivaUsd)}
              </dd>
            </div>
          ) : null}
          <div className="border-border flex items-start justify-between gap-4 border-t pt-2 sm:ml-auto sm:max-w-sm">
            <dt className="text-heading font-medium">Total</dt>
            <dd className="text-right">
              <p className="text-heading font-display whitespace-nowrap text-lg font-bold tabular-nums">
                {usd(presupuesto.totalUsd)}
              </p>
              <p className="text-muted-foreground whitespace-nowrap text-xs tabular-nums">
                {bs(presupuesto.totalBs)}
              </p>
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-heading text-base font-medium">Compartir y exportar</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <a
            href={`/minimarket/presupuestos/${presupuesto.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border text-heading hover:bg-surface-2 inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors"
          >
            <Download className="size-4" />
            Descargar PDF
          </a>
          <a
            href={`/minimarket/presupuestos/${presupuesto.id}/excel`}
            className="border-border text-heading hover:bg-surface-2 inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors"
          >
            <FileSpreadsheet className="size-4" />
            Descargar Excel
          </a>
          <PresupuestoWhatsappBoton
            link={linkPublico}
            clienteNombre={presupuesto.clienteNombre}
            numeroRegistrado={presupuesto.clienteWhatsapp ?? presupuesto.clienteTelefono}
            negocioNombre={nombreComercial}
            totalUsd={presupuesto.totalUsd}
            totalBs={presupuesto.totalBs}
            validezHasta={fmtFechaCorta(presupuesto.validezHasta, tz)}
          />
        </div>
      </Card>
    </div>
  );
}
