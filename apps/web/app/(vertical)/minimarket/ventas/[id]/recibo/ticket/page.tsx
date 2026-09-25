import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getVentaParaRecibo } from "@/lib/minimarket/data/ventas";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaHora } from "@/lib/minimarket/date-format";
import { parseFormatoTicket } from "@/lib/minimarket/recibo-formato";
import { TicketDocumento } from "@/components/minimarket/pos/ticket-documento";
import { TicketAutoPrint } from "@/components/minimarket/pos/ticket-auto-print";

export const metadata: Metadata = { title: "Ticket" };

/** Recibo de venta en formato ticket térmico — mismo documento que el recibo carta. */
export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const [doc, tz, configRes] = await Promise.all([
    getVentaParaRecibo(supabase, tenantId, id),
    getTimezoneNegocio(supabase, tenantId),
    supabase.from("mm_config_negocio").select("parametros").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (!doc) notFound();

  const formato = parseFormatoTicket(configRes.data?.parametros);
  const ancho = formato.anchoMm;

  return (
    <div className="ticket-root mx-auto max-w-full space-y-4">
      {/* Valores ya validados por `parseFormatoTicket` (números en rango). */}
      <style>{`
        .ticket-root { width: ${ancho}mm; }
        @page { size: ${ancho}mm auto; margin: 3mm; }
        @media print {
          html, body { width: ${ancho}mm; background: #fff !important; }
          .ticket-root { width: auto; }
        }
      `}</style>
      <div
        className="bg-white p-2 shadow-sm print:p-0 print:shadow-none"
        style={{ fontSize: `${formato.fuentePct}%` }}
      >
        <TicketDocumento doc={doc} fecha={fmtFechaHora(doc.fecha, tz)} formato={formato} />
      </div>
      <TicketAutoPrint volverHref={`/minimarket/ventas/${id}/recibo`} />
    </div>
  );
}
