"use client";

import * as React from "react";
import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@arkiteq/ui";
import { esLineaExenta } from "@/lib/minimarket/pos-calc";

/** Datos mínimos que necesita el modal — cualquier producto del catálogo los tiene. */
export interface ProductoParaPrecioRapido {
  nombre: string;
  precio_usd: number | string;
  imagen_url: string | null;
  impuesto_id: string | null;
}

/** Stock a mostrar — `disponible: false` es "no disponible aquí" (sucursal filtrada sin presencia). */
export interface StockParaPrecioRapido {
  disponible: boolean;
  cantidad: number;
  unidad: string;
}

interface PrecioRapidoModalProps {
  /** `null` = cerrado (no hay producto que mostrar). */
  producto: ProductoParaPrecioRapido | null;
  onClose: () => void;
  /** Tasa vigente del sistema — la MISMA que usa el POS, para que el Bs coincida. */
  tasa: number | null;
  /** Config fiscal del negocio (mm_config_negocio.parametros) — igual que en el POS. */
  ivaActivo: boolean;
  ivaPct: number;
  locale: string;
  /** Stock del producto (mismo criterio de sucursal que el listado). Opcional
   * — algún llamador puede no tener este dato a mano; el modal simplemente
   * no muestra la fila de stock en ese caso. */
  stock?: StockParaPrecioRapido;
}

/**
 * Modal "Precio rápido": foto + nombre + precio en USD/Bs, sin IVA y con IVA,
 * para leérselo al cliente en el mostrador sin armar una venta. Reutiliza
 * exactamente la lógica fiscal del POS (`esLineaExenta`, `ivaActivo`/`ivaPct`
 * de la config del negocio) para que los números coincidan con lo que se
 * cobraría en caja. NO incluye IGTF (depende de la forma de pago, no del
 * precio de lista).
 */
export function PrecioRapidoModal({
  producto,
  onClose,
  tasa,
  ivaActivo,
  ivaPct,
  locale,
  stock,
}: PrecioRapidoModalProps) {
  const money = React.useCallback(
    (valor: number, moneda: string) => {
      try {
        return new Intl.NumberFormat(locale, { style: "currency", currency: moneda }).format(valor);
      } catch {
        return `${moneda} ${valor.toFixed(2)}`;
      }
    },
    [locale],
  );

  const exento = producto ? esLineaExenta(producto.impuesto_id) : false;
  const precioSinIvaUsd = producto ? Number(producto.precio_usd) : 0;
  const aplicaIva = !exento && ivaActivo && ivaPct > 0;
  const precioConIvaUsd = aplicaIva ? precioSinIvaUsd * (1 + ivaPct / 100) : precioSinIvaUsd;

  return (
    <Dialog open={Boolean(producto)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        {producto ? (
          <>
            <DialogHeader>
              <DialogTitle>Precio rápido</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 pt-1 text-center">
              <div className="bg-surface-2 border-border relative size-28 shrink-0 overflow-hidden rounded-xl border">
                {producto.imagen_url ? (
                  <Image
                    src={producto.imagen_url}
                    alt={producto.nombre}
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                ) : (
                  <div className="text-muted-foreground/50 flex size-full items-center justify-center">
                    <ImageIcon className="size-10" aria-hidden />
                  </div>
                )}
              </div>
              <p className="text-heading text-lg font-semibold leading-tight">{producto.nombre}</p>

              {exento ? (
                <div className="w-full space-y-1.5">
                  <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium">
                    Exento de IVA
                  </span>
                  <p className="text-accent-600 font-display text-4xl font-bold tabular-nums">
                    {money(precioSinIvaUsd, "USD")}
                  </p>
                  <p className="text-muted-foreground text-xl tabular-nums">
                    {tasa ? money(precioSinIvaUsd * tasa, "VES") : "Sin tasa registrada"}
                  </p>
                </div>
              ) : (
                <div className="border-border grid w-full grid-cols-2 gap-3 border-t pt-4">
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                      Sin IVA
                    </p>
                    <p className="text-heading font-display text-2xl font-bold tabular-nums">
                      {money(precioSinIvaUsd, "USD")}
                    </p>
                    <p className="text-muted-foreground text-sm tabular-nums">
                      {tasa ? money(precioSinIvaUsd * tasa, "VES") : "—"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                      {aplicaIva ? `Con IVA (${ivaPct}%)` : "Con IVA"}
                    </p>
                    <p className="text-accent-600 font-display text-2xl font-bold tabular-nums">
                      {money(precioConIvaUsd, "USD")}
                    </p>
                    <p className="text-muted-foreground text-sm tabular-nums">
                      {tasa ? money(precioConIvaUsd * tasa, "VES") : "—"}
                    </p>
                  </div>
                </div>
              )}

              {!tasa ? (
                <p className="text-warning text-xs">
                  No hay tasa registrada — no se puede mostrar el precio en bolívares.
                </p>
              ) : null}
              {!exento && !aplicaIva ? (
                <p className="text-muted-foreground text-xs">
                  El IVA está desactivado en Configuración — no se está cobrando por ahora.
                </p>
              ) : null}

              {stock ? (
                <div className="border-border w-full border-t pt-3 text-center">
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                    Stock disponible
                  </p>
                  {stock.disponible ? (
                    <p className="text-heading text-lg font-semibold tabular-nums">
                      {stock.cantidad} <span className="text-muted-foreground">{stock.unidad}</span>
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-sm">No disponible aquí</p>
                  )}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
