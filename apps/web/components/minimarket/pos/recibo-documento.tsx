import { LeyendaNoFiscal } from "@arkiteq/ui";
import type { DocumentoFiscal } from "@/lib/minimarket/documento";
import { METODOS_PAGO } from "@/lib/minimarket/constants";

function metodoLabel(metodo: string): string {
  // "Saldo a favor" no vive en METODOS_PAGO (no es un método que el negocio
  // active/desactive en Configuración) — mismo caso puntual que ya se
  // resuelve así en el selector de cobro del POS.
  if (metodo === "credito_cliente") return "Saldo a favor";
  return METODOS_PAGO.find((m) => m.value === metodo)?.label ?? metodo;
}

const usd = (n: number) =>
  new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD" }).format(n);
const bs = (n: number) =>
  new Intl.NumberFormat("es-VE", { style: "currency", currency: "VES" }).format(n);

/**
 * Contenido del recibo de venta (para pintar dentro de un `<Card>`). Compartido
 * entre la vista privada (`/minimarket/ventas/[id]/recibo`) y la vista pública
 * sin sesión (`/r/[ventaId]/[token]`) para que ambas se vean idénticas.
 */
export function ReciboDocumento({ doc, fecha }: { doc: DocumentoFiscal; fecha: string }) {
  return (
    <>
      {doc.estado === "anulada" ? (
        <div className="border-danger/30 bg-danger/10 text-danger rounded-md border px-3 py-2 text-center text-sm font-semibold">
          VENTA ANULADA
        </div>
      ) : null}

      <header className="space-y-0.5 text-center">
        {doc.mostrarEncabezado ? (
          <>
            {doc.negocio.logoUrl ? (
              <img
                src={doc.negocio.logoUrl}
                alt={doc.negocio.nombre}
                className="mx-auto size-14 rounded-xl object-cover"
              />
            ) : null}
            <h1 className="font-display text-heading text-lg font-semibold">
              {doc.negocio.nombre}
            </h1>
            {doc.negocio.rif ? (
              <p className="text-muted-foreground text-xs">RIF: {doc.negocio.rif}</p>
            ) : null}
            {doc.negocio.direccion ? (
              <p className="text-muted-foreground text-xs">{doc.negocio.direccion}</p>
            ) : null}
            <p className="text-muted-foreground text-xs">
              Recibo de venta{doc.numero ? ` · ${doc.numero}` : ""}
            </p>
          </>
        ) : null}
        <p className="text-muted-foreground text-xs">{fecha}</p>
      </header>

      <div className="border-border space-y-1 border-t pt-3 text-sm">
        <p className="text-heading font-medium">Cliente</p>
        {doc.cliente ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
            <dt className="text-muted-foreground">Nombre</dt>
            <dd className="text-heading text-right">{doc.cliente.nombre}</dd>
            <dt className="text-muted-foreground">Cédula</dt>
            <dd className="text-right">{doc.cliente.cedula || "Sin cédula"}</dd>
            <dt className="text-muted-foreground">Teléfono</dt>
            <dd className="text-right">{doc.cliente.telefono || "Sin teléfono"}</dd>
            <dt className="text-muted-foreground">Dirección</dt>
            <dd className="text-right">{doc.cliente.direccion || "Sin dirección"}</dd>
          </dl>
        ) : (
          <p className="text-muted-foreground">Cliente ocasional — sin datos registrados.</p>
        )}
      </div>

      <div className="border-border border-y py-3">
        <table className="w-full text-sm">
          <tbody>
            {doc.lineas.map((l, i) => (
              <tr key={i} className="align-top">
                <td className="py-1 pr-2">
                  <span className="tabular-nums">{l.cantidad}×</span> {l.descripcion}
                  <div className="text-muted-foreground text-xs tabular-nums">
                    {usd(l.precioUsd)} c/u
                  </div>
                  {l.exenta ? (
                    <span className="bg-surface-2 text-muted-foreground mt-0.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                      Exento de IVA
                    </span>
                  ) : null}
                  {l.sinIgtf && doc.igtfUsd > 0 ? (
                    <span className="bg-surface-2 text-muted-foreground ml-1 mt-0.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                      Sin IGTF
                    </span>
                  ) : null}
                </td>
                <td className="py-1 text-right tabular-nums">{usd(l.totalUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums">{usd(doc.subtotalUsd)}</span>
        </div>
        {doc.ivaUsd > 0 ? (
          <div className="flex justify-between">
            <span className="text-muted-foreground">IVA</span>
            <span className="tabular-nums">{usd(doc.ivaUsd)}</span>
          </div>
        ) : null}
        {doc.igtfUsd > 0 ? (
          <div className="flex justify-between">
            <span className="text-muted-foreground">IGTF (3 %)</span>
            <span className="tabular-nums">{usd(doc.igtfUsd)}</span>
          </div>
        ) : null}
        <div className="border-border flex justify-between border-t pt-1.5 text-base font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{usd(doc.totalUsd)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total en Bs</span>
          <span className="tabular-nums">{bs(doc.totalBs)}</span>
        </div>
        <p className="text-muted-foreground pt-1 text-right text-xs tabular-nums">
          Tasa: Bs. {doc.tasa.toFixed(2)} / USD
        </p>
      </div>

      {doc.pagos.length > 0 ? (
        <div className="border-border border-t pt-3 text-sm">
          {doc.pagos.map((p, i) => (
            <div key={i} className="flex justify-between">
              <span className="text-muted-foreground">{metodoLabel(p.metodo)}</span>
              <span className="tabular-nums">
                {p.moneda === "USD" ? usd(p.monto) : bs(p.monto)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Excedente: solo aparece cuando el cliente pagó de más — nunca en una
          venta con pago exacto. Refleja lo que ya quedó registrado al cobrar
          (vuelto en efectivo, vuelto por banco, o saldo a favor acreditado),
          sin recalcular nada. */}
      {doc.excedente ? (
        <div className="space-y-1.5 rounded-md border border-dashed border-emerald-300 bg-emerald-50 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pagó</span>
            <span className="tabular-nums">{usd(doc.totalUsd + doc.excedente.montoUsd)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total de la venta</span>
            <span className="tabular-nums">{usd(doc.totalUsd)}</span>
          </div>
          <div className="flex justify-between font-medium text-emerald-700">
            <span>Excedente</span>
            <span className="tabular-nums">
              {usd(doc.excedente.montoUsd)} ({bs(doc.excedente.montoBs)})
            </span>
          </div>
          <p className="border-t border-emerald-200 pt-1 text-xs text-emerald-700">
            {doc.excedente.resolucion.tipo === "credito"
              ? `Saldo a favor acreditado a su cuenta — disponible para su próxima compra.`
              : doc.excedente.resolucion.tipo === "banco"
                ? `Vuelto entregado por ${metodoLabel(doc.excedente.resolucion.metodo)} (${doc.excedente.resolucion.banco}).`
                : `Vuelto entregado en efectivo ${doc.excedente.resolucion.moneda === "USD" ? "en dólares" : "en bolívares"}.`}
          </p>
        </div>
      ) : null}

      {/* Devolución: solo aparece en una venta ANULADA que sí devolvió dinero
          real (ver `getDevolucionVenta` en data/ventas.ts) — nunca en una
          venta vigente. */}
      {doc.devolucion ? (
        <div className="space-y-1.5 rounded-md border border-dashed border-red-300 bg-red-50 p-3 text-sm">
          <div className="flex justify-between font-medium text-red-700">
            <span>Devuelto al cliente</span>
            <span className="tabular-nums">
              {usd(doc.devolucion.montoUsd)} ({bs(doc.devolucion.montoBs)})
            </span>
          </div>
          <p className="border-t border-red-200 pt-1 text-xs text-red-700">
            Por {metodoLabel(doc.devolucion.metodo)}
            {doc.devolucion.banco ? ` (${doc.devolucion.banco})` : ""}.
          </p>
        </div>
      ) : null}

      <p className="text-muted-foreground pt-2 text-center text-xs">¡Gracias por su compra!</p>
      {doc.mostrarLeyenda ? <LeyendaNoFiscal className="pt-1 opacity-70" /> : null}
    </>
  );
}
