import { LeyendaNoFiscal } from "@arkiteq/ui";
import {
  ESTADO_PEDIDO_LABEL,
  numeroPedido,
  vueltoEstimado,
  type PedidoDocumento,
} from "@/lib/minimarket/pedidos/documento";
import { bs, metodoLabel, usd } from "@/lib/minimarket/recibo-formato";

const ESTADO_CLASES: Record<PedidoDocumento["estado"], string> = {
  pendiente: "border-amber-300 bg-amber-50 text-amber-800",
  pago_reportado: "border-sky-300 bg-sky-50 text-sky-800",
  para_pagar_local: "border-emerald-300 bg-emerald-50 text-emerald-800",
  aceptado_validado: "border-emerald-300 bg-emerald-50 text-emerald-800",
  rechazado: "border-red-300 bg-red-50 text-red-700",
  completado: "border-gray-300 bg-gray-50 text-gray-700",
};

/**
 * Recibo de un pedido del catálogo público. Propio de Pedidos: no reutiliza
 * ni modifica el recibo de venta. Se usa en la confirmación al cliente, en la
 * página de estado (link firmado) y en el detalle del panel.
 */
export function PedidoReciboDocumento({ doc, fecha }: { doc: PedidoDocumento; fecha: string }) {
  const vuelto = vueltoEstimado(doc);
  return (
    <div className="space-y-4 bg-white p-5 text-gray-900">
      <header className="space-y-0.5 text-center">
        {doc.negocio.logoUrl ? (
          <img
            src={doc.negocio.logoUrl}
            alt={doc.negocio.nombre}
            crossOrigin="anonymous"
            className="mx-auto size-14 rounded-xl object-cover"
          />
        ) : null}
        <h2 className="text-lg font-semibold">{doc.negocio.nombre}</h2>
        {doc.negocio.rif ? <p className="text-xs text-gray-500">RIF: {doc.negocio.rif}</p> : null}
        <p className="text-xs text-gray-500">
          {doc.sucursal.nombre}
          {doc.sucursal.direccion ? ` · ${doc.sucursal.direccion}` : ""}
        </p>
        <p className="pt-1 text-sm font-medium">Pedido {numeroPedido(doc.numero)}</p>
        <p className="text-xs text-gray-500">{fecha}</p>
      </header>

      <div
        className={`rounded-md border px-3 py-2 text-center text-sm font-semibold ${ESTADO_CLASES[doc.estado]}`}
      >
        {ESTADO_PEDIDO_LABEL[doc.estado]}
        {doc.estado === "rechazado" && doc.motivoRechazo ? (
          <span className="block text-xs font-normal">Motivo: {doc.motivoRechazo}</span>
        ) : null}
      </div>

      <div className="space-y-0.5 border-t border-gray-200 pt-3 text-sm">
        <p className="font-medium">Cliente</p>
        <p>{doc.cliente.nombre}</p>
        <p className="text-gray-500">{doc.cliente.telefono}</p>
      </div>

      <ul className="divide-y divide-gray-100 border-y border-gray-200">
        {doc.lineas.map((l, i) => (
          <li key={i} className="flex items-center gap-3 py-2 text-sm">
            {l.imagenUrl ? (
              <img
                src={l.imagenUrl}
                alt=""
                crossOrigin="anonymous"
                className="size-10 shrink-0 rounded-md object-cover"
              />
            ) : (
              <div className="size-10 shrink-0 rounded-md bg-gray-100" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate">
                <span className="tabular-nums">{l.cantidad}×</span> {l.nombre}
              </p>
              <p className="text-xs tabular-nums text-gray-500">{usd(l.precioUsd)} c/u</p>
            </div>
            <span className="tabular-nums">{usd(l.totalUsd)}</span>
          </li>
        ))}
      </ul>

      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Subtotal</span>
          <span className="tabular-nums">{usd(doc.subtotalUsd)}</span>
        </div>
        {doc.ivaUsd > 0 ? (
          <div className="flex justify-between">
            <span className="text-gray-500">IVA</span>
            <span className="tabular-nums">{usd(doc.ivaUsd)}</span>
          </div>
        ) : null}
        {doc.igtfUsd > 0 ? (
          <div className="flex justify-between">
            <span className="text-gray-500">IGTF (3 %)</span>
            <span className="tabular-nums">{usd(doc.igtfUsd)}</span>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-gray-200 pt-1.5 text-base font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{usd(doc.totalUsd)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Total en Bs</span>
          <span className="tabular-nums">{bs(doc.totalBs)}</span>
        </div>
        <p className="text-right text-xs tabular-nums text-gray-500">
          Tasa: Bs. {doc.tasa.toFixed(2)} / USD
        </p>
      </div>

      <div className="space-y-1 border-t border-gray-200 pt-3 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Forma de pago</span>
          <span>
            {doc.formaPago === "online" ? "Pago en línea" : "Pago en el local"} ·{" "}
            {metodoLabel(doc.metodo)}
          </span>
        </div>
        {vuelto && doc.montoEntregado !== null ? (
          <>
            <div className="flex justify-between">
              <span className="text-gray-500">Paga con</span>
              <span className="tabular-nums">
                {vuelto.moneda === "USD" ? usd(doc.montoEntregado) : bs(doc.montoEntregado)}
              </span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Vuelto estimado</span>
              <span className="tabular-nums">
                {vuelto.moneda === "USD" ? usd(vuelto.monto) : bs(vuelto.monto)}
              </span>
            </div>
          </>
        ) : null}
      </div>

      <p className="text-center text-xs text-gray-500">
        Los montos son informativos y pueden actualizarse al confirmar el pedido.
      </p>
      <LeyendaNoFiscal className="!text-gray-500" />
    </div>
  );
}
