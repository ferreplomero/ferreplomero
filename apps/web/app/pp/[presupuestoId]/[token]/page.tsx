import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, LeyendaNoFiscal } from "@arkiteq/ui";
import { createServiceClient } from "@arkiteq/db/service";
import { getPresupuestoDetalle } from "@/lib/minimarket/data/presupuestos";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaCorta, fmtFechaLarga } from "@/lib/minimarket/date-format";
import { tokenPresupuestoValido } from "@/lib/minimarket/presupuesto-link";

// Contiene datos del cliente y precios cotizados: nunca indexable.
export const metadata: Metadata = {
  title: "Tu presupuesto",
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ presupuestoId: string; token: string }>;
}

/**
 * Vista pública de solo lectura de un presupuesto, SIN sesión — el link que
 * el cliente recibe por WhatsApp. Mismo patrón que `/r/[ventaId]/[token]`
 * (recibo de venta): valida un token firmado por servidor (ver
 * `lib/minimarket/presupuesto-link.ts`) y lee con `service_role` solo ese
 * presupuesto puntual, nunca lista ni expone otros.
 */
export default async function PresupuestoPublicoPage({ params }: Props) {
  const { presupuestoId, token } = await params;

  const service = createServiceClient();
  const { data: presupuestoRow } = await service
    .from("mm_presupuestos")
    .select("tenant_id")
    .eq("id", presupuestoId)
    .maybeSingle();
  if (!presupuestoRow || !tokenPresupuestoValido(presupuestoId, presupuestoRow.tenant_id, token)) {
    notFound();
  }

  const tz = await getTimezoneNegocio(service, presupuestoRow.tenant_id);
  const [presupuesto, configRes] = await Promise.all([
    getPresupuestoDetalle(service, presupuestoRow.tenant_id, presupuestoId, tz),
    service
      .from("mm_config_negocio")
      .select("nombre_comercial")
      .eq("tenant_id", presupuestoRow.tenant_id)
      .maybeSingle(),
  ]);
  if (!presupuesto) notFound();

  const nombreComercial = configRes.data?.nombre_comercial || "el negocio";
  const usd = (v: number) =>
    new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD" }).format(v);
  const bs = (v: number) =>
    new Intl.NumberFormat("es-VE", { style: "currency", currency: "VES" }).format(v);

  return (
    <div className="bg-background mx-auto min-h-dvh max-w-md space-y-4 p-4 sm:p-6">
      <Card className="space-y-4 p-6">
        <div className="space-y-1 text-center">
          <p className="text-heading font-display text-lg font-semibold">{nombreComercial}</p>
          <p className="text-muted-foreground text-sm">
            Presupuesto {presupuesto.numero} · {fmtFechaLarga(presupuesto.fechaEmision, tz)}
          </p>
          <p className="text-muted-foreground text-xs">
            Válido hasta {fmtFechaCorta(presupuesto.validezHasta, tz)}
          </p>
        </div>

        <div className="border-border divide-border divide-y rounded-md border">
          {presupuesto.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="text-heading truncate font-medium">{item.descripcion}</p>
                <p className="text-muted-foreground text-xs">
                  {item.cantidad} × {usd(item.precioUnitarioUsd)}
                </p>
              </div>
              <p className="text-heading shrink-0 font-medium tabular-nums">
                {usd(item.subtotalUsd)}
              </p>
            </div>
          ))}
        </div>

        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{usd(presupuesto.subtotalUsd)}</span>
          </div>
          {presupuesto.ivaUsd > 0 ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">IVA</span>
              <span className="tabular-nums">{usd(presupuesto.ivaUsd)}</span>
            </div>
          ) : null}
          <div className="border-border flex justify-between border-t pt-1.5 font-semibold">
            <span className="text-heading">Total</span>
            <div className="text-right">
              <p className="tabular-nums">{usd(presupuesto.totalUsd)}</p>
              <p className="text-muted-foreground text-xs font-normal tabular-nums">
                {bs(presupuesto.totalBs)}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 print:hidden">
          <a
            href={`/pp/${presupuestoId}/${token}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border text-heading hover:bg-surface-2 inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition-colors"
          >
            Descargar PDF
          </a>
          <a
            href={`/pp/${presupuestoId}/${token}/excel`}
            className="border-border text-heading hover:bg-surface-2 inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition-colors"
          >
            Descargar Excel
          </a>
        </div>

        <p className="text-muted-foreground text-center text-xs">
          Este es un presupuesto/cotización, no es una factura ni un recibo de venta.
        </p>
        <LeyendaNoFiscal className="pt-1 text-center opacity-70" />
      </Card>
    </div>
  );
}
