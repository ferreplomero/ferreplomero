import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@arkiteq/db/service";
import { getPedidoDocumento, numeroPedido } from "@/lib/minimarket/pedidos/documento";
import { tokenPedidoValido, linkEstadoPedido } from "@/lib/minimarket/pedidos/link";
import { esSlugValido } from "@/lib/minimarket/pedidos/publico";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaHora } from "@/lib/minimarket/date-format";
import { metodoLabel, usd, bs } from "@/lib/minimarket/recibo-formato";
import { numeroWhatsappPedido } from "@/lib/minimarket/pedidos/whatsapp";
import { PedidoReciboDocumento } from "@/components/minimarket/pedidos/pedido-recibo-documento";
import { ConDescargaPng } from "@/components/minimarket/pedidos/descargar-png";
import { PedidoConfirmado } from "@/components/minimarket/pedidos/pedido-confirmado";

export const dynamic = "force-dynamic";
// Datos personales del cliente: nunca indexable.
export const metadata: Metadata = {
  title: "Estado de tu pedido",
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Props {
  params: Promise<{ slug: string; pedidoId: string; token: string }>;
  searchParams: Promise<{ nuevo?: string }>;
}

/**
 * Estado público de un pedido (sin sesión). Valida el token HMAC antes de
 * leer nada más, y que el pedido pertenezca al catálogo del slug.
 */
export default async function EstadoPedidoPage({ params, searchParams }: Props) {
  const { slug, pedidoId, token } = await params;
  const { nuevo } = await searchParams;
  if (!UUID.test(pedidoId) || !esSlugValido(slug)) notFound();

  const service = createServiceClient();
  const { data: pedido } = await service
    .from("mm_pedidos_publicos")
    .select("tenant_id, sucursal_id")
    .eq("id", pedidoId)
    .maybeSingle();
  if (!pedido || !tokenPedidoValido(pedidoId, pedido.tenant_id, token)) notFound();

  const { data: catalogo } = await service
    .from("mm_catalogo_publico")
    .select("id")
    .eq("slug", slug)
    .eq("tenant_id", pedido.tenant_id)
    .eq("sucursal_id", pedido.sucursal_id)
    .maybeSingle();
  if (!catalogo) notFound();

  const [doc, tz] = await Promise.all([
    getPedidoDocumento(service, pedido.tenant_id, pedidoId),
    getTimezoneNegocio(service, pedido.tenant_id),
  ]);
  if (!doc) notFound();

  const num = numeroPedido(doc.numero);
  const mensaje = [
    `Hola, acabo de hacer el pedido ${num} en ${doc.negocio.nombre}.`,
    ...doc.lineas.map((l) => `• ${l.cantidad}× ${l.nombre}`),
    `Total: ${usd(doc.totalUsd)} (${bs(doc.totalBs)})`,
    `Pago: ${doc.formaPago === "online" ? "en línea" : "en el local"} · ${metodoLabel(doc.metodo)}`,
    `Nombre: ${doc.cliente.nombre}`,
    `Estado: ${linkEstadoPedido(slug, pedidoId, pedido.tenant_id)}`,
  ].join("\n");

  return (
    <div className="bg-background mx-auto min-h-dvh max-w-md space-y-4 p-4 sm:p-6">
      <PedidoConfirmado
        nuevo={nuevo === "1"}
        numero={num}
        telefonoNegocio={doc.sucursal.telefono ? numeroWhatsappPedido(doc.sucursal.telefono) : null}
        mensajeWhatsapp={mensaje}
      />
      <ConDescargaPng nombreArchivo={`pedido-${num}.png`}>
        <PedidoReciboDocumento doc={doc} fecha={fmtFechaHora(doc.fecha, tz)} />
      </ConDescargaPng>
      <Link
        href={`/tienda/${slug}`}
        className="text-accent-600 block text-center text-sm font-medium"
      >
        Volver al catálogo
      </Link>
    </div>
  );
}
