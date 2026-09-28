import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { Button, Card } from "@arkiteq/ui";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { obtenerDatosNotaEntrega } from "@/lib/minimarket/nota-entrega/datos";
import { NotaEntregaVista } from "@/components/minimarket/ventas/nota-entrega-vista";
import { ReciboWhatsappBoton } from "@/components/minimarket/pos/recibo-whatsapp-boton";

export const metadata: Metadata = { title: "Nota de entrega" };

/**
 * Nota de entrega de una venta — documento APARTE del recibo de venta (que
 * sigue en `/minimarket/ventas/[id]/recibo`, intacto). Se ve en pantalla, se
 * descarga en PDF y se envía por WhatsApp al cliente o a otro número (link
 * público firmado al PDF, ver `lib/minimarket/nota-entrega-link.ts`).
 */
export default async function NotaEntregaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const tz = await getTimezoneNegocio(supabase, tenantId);
  const datos = await obtenerDatosNotaEntrega(supabase, tenantId, id, tz);
  if (!datos) notFound();

  const pdfUrl = `/minimarket/ventas/${id}/nota-entrega/pdf`;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        href="/minimarket/ventas"
        className="text-muted-foreground hover:text-heading inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        Historial de ventas
      </Link>

      <Card className="p-5 sm:p-6">
        <NotaEntregaVista datos={datos} />
      </Card>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button asChild className="w-full">
          <a href={`${pdfUrl}?descargar=1`} download={`nota-entrega-${datos.numero}.pdf`}>
            <Download className="size-4" />
            Descargar PDF
          </a>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
            <FileText className="size-4" />
            Ver / imprimir PDF
          </a>
        </Button>
      </div>

      <ReciboWhatsappBoton
        link={datos.linkPublico}
        clienteNombre={datos.doc.cliente?.nombre ?? null}
        numeroRegistrado={datos.doc.cliente?.whatsapp || datos.doc.cliente?.telefono || null}
        negocioNombre={datos.doc.negocio.nombre}
        totalUsd={datos.doc.totalUsd}
        totalBs={datos.doc.totalBs}
        documento="nota de entrega"
        articulo="la"
      />
    </div>
  );
}
