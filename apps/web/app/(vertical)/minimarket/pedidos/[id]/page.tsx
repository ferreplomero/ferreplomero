import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Receipt } from "lucide-react";
import { Button, WhatsAppIcon } from "@arkiteq/ui";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getPedidoDocumento, numeroPedido } from "@/lib/minimarket/pedidos/documento";
import { urlsComprobantes } from "@/lib/minimarket/pedidos/panel";
import { listCuentasBancarias } from "@/lib/minimarket/data/bancos";
import { parseMetodosPago } from "@/lib/minimarket/metodos-pago";
import { METODOS_LOCAL } from "@/lib/minimarket/pedidos/publico";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaHora } from "@/lib/minimarket/date-format";
import { numeroWhatsappPedido } from "@/lib/minimarket/pedidos/whatsapp";
import { PedidoReciboDocumento } from "@/components/minimarket/pedidos/pedido-recibo-documento";
import { ConDescargaPng } from "@/components/minimarket/pedidos/descargar-png";
import { PedidoAcciones } from "./pedido-acciones";

export const metadata: Metadata = { title: "Pedido" };

export default async function PedidoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const doc = await getPedidoDocumento(supabase, tenantId, id);
  if (!doc) notFound();

  const [tz, urls, cuentas, configRes] = await Promise.all([
    getTimezoneNegocio(supabase, tenantId),
    urlsComprobantes(supabase, doc.comprobantePath ? [doc.comprobantePath] : []),
    listCuentasBancarias(supabase, tenantId),
    supabase
      .from("mm_config_negocio")
      .select("metodos_pago")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);
  const comprobanteUrl = doc.comprobantePath ? (urls.get(doc.comprobantePath) ?? null) : null;
  const activos = new Set(
    parseMetodosPago(configRes.data?.metodos_pago)
      .filter((m) => m.activo)
      .map((m) => m.metodo as string),
  );
  const num = numeroPedido(doc.numero);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link
        href="/minimarket/pedidos"
        className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
      >
        <ArrowLeft className="size-4" />
        Pedidos
      </Link>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <ConDescargaPng nombreArchivo={`pedido-${num}.png`}>
          <PedidoReciboDocumento doc={doc} fecha={fmtFechaHora(doc.fecha, tz)} />
        </ConDescargaPng>

        <aside className="space-y-4">
          <PedidoAcciones
            pedidoId={doc.id}
            estado={doc.estado}
            ventaId={doc.ventaId}
            metodoCliente={doc.metodo}
            metodosLocal={METODOS_LOCAL.filter((m) => activos.has(m))}
            cuentas={cuentas
              .filter((c) => c.activa)
              .map((c) => ({
                id: c.id,
                metodo: c.metodo,
                banco: c.banco,
                predeterminada: c.predeterminada,
              }))}
          />

          <Button asChild variant="outline" className="w-full">
            <a
              href={`https://wa.me/${numeroWhatsappPedido(doc.cliente.telefono)}?text=${encodeURIComponent(`Hola ${doc.cliente.nombre}, te escribimos de ${doc.negocio.nombre} sobre tu pedido ${num}.`)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <WhatsAppIcon className="size-4" />
              Contactar por WhatsApp
            </a>
          </Button>

          {doc.ventaId ? (
            <Button asChild variant="outline" className="w-full">
              <Link href={`/minimarket/ventas/${doc.ventaId}/recibo`}>
                <Receipt className="size-4" />
                Ver recibo de la venta
              </Link>
            </Button>
          ) : null}

          {comprobanteUrl ? (
            <div className="space-y-1">
              <p className="text-heading text-sm font-medium">Comprobante de pago</p>
              <a href={comprobanteUrl} target="_blank" rel="noopener noreferrer" title="Ampliar">
                <img
                  src={comprobanteUrl}
                  alt={`Comprobante del pedido ${num}`}
                  className="border-border w-full rounded-lg border object-contain"
                />
              </a>
              <p className="text-muted-foreground text-xs">Toca la imagen para ampliarla.</p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
