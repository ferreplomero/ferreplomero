import { LeyendaNoFiscal } from "@arkiteq/ui";
import type { NotaEntregaDatos } from "@/lib/minimarket/nota-entrega/datos";
import { NOTA_ENTREGA_TEXTO } from "@/lib/minimarket/pdf/constants";
import { bs, metodoLabel, usd } from "@/lib/minimarket/recibo-formato";

/**
 * Vista en pantalla de la nota de entrega — mismo contenido y paleta (ámbar)
 * que su PDF (`lib/minimarket/pdf/nota-entrega-documento.tsx`). Solo
 * presentación: todos los montos vienen congelados de la venta.
 */
export function NotaEntregaVista({ datos }: { datos: NotaEntregaDatos }) {
  const { doc } = datos;
  const totalUnidades = doc.lineas.reduce((s, l) => s + l.cantidad, 0);
  const direccionEntrega = doc.cliente?.direccion?.trim() || null;

  return (
    <div className="space-y-4 text-sm">
      <div className="h-1.5 rounded-full bg-amber-700" />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          {doc.mostrarEncabezado && doc.negocio.logoUrl ? (
            <img
              src={doc.negocio.logoUrl}
              alt={doc.negocio.nombre}
              className="mb-1 size-12 rounded-lg object-contain"
            />
          ) : null}
          <p className="font-display text-heading text-lg font-semibold">{doc.negocio.nombre}</p>
          {doc.mostrarEncabezado && doc.negocio.rif ? (
            <p className="text-muted-foreground text-xs">RIF: {doc.negocio.rif}</p>
          ) : null}
          {doc.mostrarEncabezado && doc.negocio.direccion ? (
            <p className="text-muted-foreground text-xs">{doc.negocio.direccion}</p>
          ) : null}
        </div>
        <div className="shrink-0 rounded-md border-2 border-amber-700 px-3 py-2 sm:text-right">
          <p className="text-base font-bold tracking-wide text-amber-700">NOTA DE ENTREGA</p>
          <p className="text-heading font-semibold tabular-nums">N.º {datos.numero}</p>
          <p className="text-muted-foreground text-xs">{datos.fecha}</p>
          {datos.ventaNumero ? (
            <p className="text-muted-foreground text-xs">Venta relacionada: {datos.ventaNumero}</p>
          ) : null}
          {datos.sucursal ? (
            <p className="text-muted-foreground text-xs">Sucursal: {datos.sucursal.nombre}</p>
          ) : null}
        </div>
      </header>

      {doc.estado === "anulada" ? (
        <div className="border-danger/30 bg-danger/10 text-danger rounded-md border px-3 py-2 text-center font-semibold">
          VENTA ANULADA — esta nota de entrega no tiene validez
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-md bg-amber-50 p-3 dark:bg-amber-950/30">
          <p className="text-muted-foreground text-[10px] font-medium uppercase">Cliente</p>
          <p className="text-heading font-semibold">{doc.cliente?.nombre ?? "Cliente ocasional"}</p>
          {doc.cliente?.cedula ? (
            <p className="text-muted-foreground text-xs">C.I./RIF: {doc.cliente.cedula}</p>
          ) : null}
          {doc.cliente?.telefono ? (
            <p className="text-muted-foreground text-xs">Tel: {doc.cliente.telefono}</p>
          ) : null}
        </div>
        <div className="rounded-md bg-amber-50 p-3 dark:bg-amber-950/30">
          <p className="text-muted-foreground text-[10px] font-medium uppercase">
            Lugar de entrega
          </p>
          {direccionEntrega ? (
            <p className="text-heading font-semibold">{direccionEntrega}</p>
          ) : (
            <>
              <p className="text-heading font-semibold">Retiro en tienda</p>
              {datos.sucursal ? (
                <p className="text-muted-foreground text-xs">
                  {datos.sucursal.nombre}
                  {datos.sucursal.direccion ? ` — ${datos.sucursal.direccion}` : ""}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div>
        <p className="text-heading mb-1.5 font-medium">
          Mercancía entregada ({totalUnidades} {totalUnidades === 1 ? "unidad" : "unidades"})
        </p>
        <div className="border-border overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-heading text-left text-[11px] uppercase text-white dark:bg-slate-800">
              <tr>
                <th className="px-2 py-1.5 text-center">Cant.</th>
                <th className="px-2 py-1.5">Descripción</th>
                <th className="px-2 py-1.5 text-right">Precio</th>
                <th className="px-2 py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {doc.lineas.map((l, i) => (
                <tr key={i} className="align-top">
                  <td className="px-2 py-1.5 text-center tabular-nums">{l.cantidad}</td>
                  <td className="px-2 py-1.5">
                    {l.descripcion}
                    {l.exenta ? (
                      <span className="text-muted-foreground ml-1 text-[10px]">(Exento)</span>
                    ) : null}
                  </td>
                  <td className="text-muted-foreground px-2 py-1.5 text-right tabular-nums">
                    {usd(l.precioUsd)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{usd(l.totalUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          {doc.pagos.length > 0 ? (
            <>
              <p className="text-heading mb-1 font-medium">Forma de pago</p>
              {doc.pagos.map((p, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-muted-foreground">{metodoLabel(p.metodo)}</span>
                  <span className="tabular-nums">
                    {p.moneda === "USD" ? usd(p.monto) : bs(p.monto)}
                  </span>
                </div>
              ))}
            </>
          ) : null}
        </div>
        <div className="space-y-1 rounded-md bg-amber-50 p-3 dark:bg-amber-950/30">
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
          <div className="flex justify-between border-t border-amber-700/40 pt-1.5 text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums text-amber-700">{usd(doc.totalUsd)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total en Bs</span>
            <span className="tabular-nums">{bs(doc.totalBs)}</span>
          </div>
          <p className="text-muted-foreground text-right text-xs tabular-nums">
            Tasa del día de la venta: Bs. {doc.tasa.toFixed(2)} / USD
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 pt-8">
        {["Entregado por", "Recibido conforme"].map((t) => (
          <div key={t} className="border-heading border-t pt-1 text-center text-xs font-medium">
            {t}
          </div>
        ))}
      </div>

      <p className="text-muted-foreground border-border border-t pt-2 text-center text-xs">
        {NOTA_ENTREGA_TEXTO}
      </p>
      {doc.mostrarLeyenda ? <LeyendaNoFiscal className="text-center opacity-70" /> : null}
    </div>
  );
}
