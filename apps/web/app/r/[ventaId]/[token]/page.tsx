import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@arkiteq/ui";
import { createServiceClient } from "@arkiteq/db/service";
import { getVentaParaRecibo } from "@/lib/minimarket/data/ventas";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaHora } from "@/lib/minimarket/date-format";
import { tokenReciboValido } from "@/lib/minimarket/recibo-link";
import { ReciboDocumento } from "@/components/minimarket/pos/recibo-documento";
import { ImprimirBoton } from "@/components/minimarket/pos/imprimir-boton";

// Contiene datos del cliente (nombre, teléfono, dirección) y de la compra: nunca indexable.
export const metadata: Metadata = { title: "Tu recibo", robots: { index: false, follow: false } };

interface Props {
  params: Promise<{ ventaId: string; token: string }>;
}

/**
 * Recibo público de solo lectura, SIN sesión: es el link que el cliente recibe
 * por WhatsApp para ver su comprobante. No usa RLS de sesión — valida un token
 * firmado por servidor (ver `lib/minimarket/recibo-link.ts`) y lee con
 * `service_role` solo esa venta puntual. Nunca lista ni expone otras ventas.
 */
export default async function ReciboPublicoPage({ params }: Props) {
  const { ventaId, token } = await params;

  const service = createServiceClient();
  const { data: venta } = await service
    .from("mm_ventas")
    .select("tenant_id")
    .eq("id", ventaId)
    .maybeSingle();
  if (!venta || !tokenReciboValido(ventaId, venta.tenant_id, token)) notFound();

  const [doc, tz] = await Promise.all([
    getVentaParaRecibo(service, venta.tenant_id, ventaId),
    getTimezoneNegocio(service, venta.tenant_id),
  ]);
  if (!doc) notFound();

  const fecha = fmtFechaHora(doc.fecha, tz);

  return (
    <div className="bg-background mx-auto min-h-dvh max-w-md space-y-4 p-4 sm:p-6">
      <Card className="space-y-4 p-6">
        <ReciboDocumento doc={doc} fecha={fecha} />
      </Card>

      <ImprimirBoton />
    </div>
  );
}
