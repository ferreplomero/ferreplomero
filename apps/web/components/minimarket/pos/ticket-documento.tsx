import { LeyendaNoFiscal } from "@arkiteq/ui";
import type { DocumentoFiscal } from "@/lib/minimarket/documento";
import {
  bs,
  fmtDocumento,
  metodoLabel,
  monedaDelRecibo,
  usd,
  type FormatoTicket,
} from "@/lib/minimarket/recibo-formato";

function Fila({
  izq,
  der,
  fuerte = false,
}: {
  izq: React.ReactNode;
  der: React.ReactNode;
  fuerte?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-2 ${fuerte ? "font-bold" : ""}`}>
      <span className="min-w-0">{izq}</span>
      <span className="shrink-0 tabular-nums">{der}</span>
    </div>
  );
}

const Separador = () => <hr className="my-1.5 border-0 border-t border-dashed border-black" />;

/**
 * Recibo de venta en formato ticket (impresora térmica). Mismo `DocumentoFiscal`
 * que `ReciboDocumento`: no recalcula nada, solo cambia la presentación. La
 * moneda en que se expresan los montos sale de `monedaDelRecibo` (cómo se
 * cobró la venta) y la conversión a Bs usa la tasa congelada de la venta.
 */
export function TicketDocumento({
  doc,
  fecha,
  formato,
}: {
  doc: DocumentoFiscal;
  fecha: string;
  formato: FormatoTicket;
}) {
  const modo = monedaDelRecibo(doc.pagos);
  const m = (valorUsd: number) => fmtDocumento(valorUsd, doc.tasa, modo);

  return (
    <div className="space-y-1 font-mono text-[0.72em] leading-snug text-black">
      {doc.estado === "anulada" ? (
        <p className="border border-black py-0.5 text-center font-bold">*** VENTA ANULADA ***</p>
      ) : null}

      {doc.mostrarEncabezado ? (
        <div className="text-center">
          {formato.mostrarLogo && doc.negocio.logoUrl ? (
            <img
              src={doc.negocio.logoUrl}
              alt={doc.negocio.nombre}
              className="mx-auto mb-1 size-12 object-contain grayscale"
            />
          ) : null}
          {formato.mostrarDatosNegocio ? (
            <>
              <p className="text-[1.15em] font-bold">{doc.negocio.nombre}</p>
              {doc.negocio.rif ? <p>RIF: {doc.negocio.rif}</p> : null}
              {doc.negocio.direccion ? <p>{doc.negocio.direccion}</p> : null}
            </>
          ) : null}
          <p className="mt-1 font-bold">Recibo de venta{doc.numero ? ` · ${doc.numero}` : ""}</p>
        </div>
      ) : null}
      <p className="text-center">{fecha}</p>

      <Separador />
      {doc.cliente ? (
        <div>
          <p>Cliente: {doc.cliente.nombre}</p>
          {doc.cliente.cedula ? <p>C.I./RIF: {doc.cliente.cedula}</p> : null}
          {doc.cliente.telefono ? <p>Tel.: {doc.cliente.telefono}</p> : null}
          {doc.cliente.direccion ? <p>Dir.: {doc.cliente.direccion}</p> : null}
        </div>
      ) : (
        <p>Cliente ocasional</p>
      )}

      <Separador />
      {doc.lineas.map((l, i) => (
        <div key={i}>
          <p>
            {l.cantidad}× {l.descripcion}
          </p>
          <Fila
            izq={
              <>
                {m(l.precioUsd)} c/u{l.exenta ? " · exento IVA" : ""}
              </>
            }
            der={m(l.totalUsd)}
          />
        </div>
      ))}

      <Separador />
      <Fila izq="Subtotal" der={m(doc.subtotalUsd)} />
      {doc.ivaUsd > 0 ? <Fila izq="IVA" der={m(doc.ivaUsd)} /> : null}
      {doc.igtfUsd > 0 ? <Fila izq="IGTF (3 %)" der={m(doc.igtfUsd)} /> : null}
      <div className="text-[1.15em]">
        <Fila izq="TOTAL" der={modo === "VES" ? bs(doc.totalBs) : usd(doc.totalUsd)} fuerte />
      </div>
      {modo === "MIXTO" ? <Fila izq="Total en Bs" der={bs(doc.totalBs)} /> : null}
      {modo !== "USD" ? <p className="text-right">Tasa: Bs. {doc.tasa.toFixed(2)}/USD</p> : null}

      {doc.pagos.length > 0 ? (
        <>
          <Separador />
          {doc.pagos.map((p, i) => (
            <Fila
              key={i}
              izq={metodoLabel(p.metodo)}
              der={p.moneda === "USD" ? usd(p.monto) : bs(p.monto)}
            />
          ))}
        </>
      ) : null}

      {doc.excedente ? (
        <>
          <Separador />
          <Fila
            izq="Pagó"
            der={
              modo === "VES"
                ? bs(doc.totalBs + doc.excedente.montoBs)
                : usd(doc.totalUsd + doc.excedente.montoUsd)
            }
          />
          <Fila
            izq="Vuelto / excedente"
            der={modo === "VES" ? bs(doc.excedente.montoBs) : usd(doc.excedente.montoUsd)}
            fuerte
          />
          <p>
            {doc.excedente.resolucion.tipo === "credito"
              ? "Saldo a favor acreditado a su cuenta."
              : doc.excedente.resolucion.tipo === "banco"
                ? `Vuelto por ${metodoLabel(doc.excedente.resolucion.metodo)} (${doc.excedente.resolucion.banco}).`
                : `Vuelto en efectivo ${doc.excedente.resolucion.moneda === "USD" ? "en dólares" : "en bolívares"}.`}
          </p>
        </>
      ) : null}

      {doc.devolucion ? (
        <>
          <Separador />
          <Fila
            izq="Devuelto al cliente"
            der={`${usd(doc.devolucion.montoUsd)} (${bs(doc.devolucion.montoBs)})`}
            fuerte
          />
          <p>
            Por {metodoLabel(doc.devolucion.metodo)}
            {doc.devolucion.banco ? ` (${doc.devolucion.banco})` : ""}.
          </p>
        </>
      ) : null}

      <Separador />
      <p className="text-center">¡Gracias por su compra!</p>
      {doc.mostrarLeyenda ? <LeyendaNoFiscal className="!text-[0.9em] !text-black" /> : null}
    </div>
  );
}
