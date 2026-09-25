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
  /** En o por debajo del mínimo configurado — se pinta en rojo; si no, verde. */
  bajoStock?: boolean;
  /** Texto ya formateado de la cantidad (ej. granel con 3 decimales). Si no
   * viene, se muestra `cantidad` tal cual. */
  cantidadTexto?: string;
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
 * para leérselo al cliente en el mostrador sin armar una venta. Usa la misma
 * lógica fiscal del POS (`esLineaExenta` + `ivaPct` de la config del negocio).
 * El precio "con IVA" se muestra SIEMPRE (aunque el IVA esté desactivado en
 * Configuración) como referencia para el cliente — es solo informativo, no
 * cambia lo que se cobra en caja. NO incluye IGTF (depende de la forma de
 * pago, no del precio de lista).
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
  // Alícuota de referencia: la configurada; si no hay una válida, la general (16%).
  const pctReferencia = ivaPct > 0 ? ivaPct : 16;
  const precioConIvaUsd = exento ? precioSinIvaUsd : precioSinIvaUsd * (1 + pctReferencia / 100);

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
                  <p className="text-heading font-display text-3xl font-bold tabular-nums">
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
                    <p className="text-heading bg-surface-2 rounded-md px-1.5 py-1 text-lg font-bold tabular-nums">
                      {tasa ? money(precioSinIvaUsd * tasa, "VES") : "—"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                      Con IVA ({pctReferencia}%)
                    </p>
                    <p className="text-accent-600 font-display text-2xl font-bold tabular-nums">
                      {money(precioConIvaUsd, "USD")}
                    </p>
                    <p className="text-accent-600 bg-accent-50 rounded-md px-1.5 py-1 text-lg font-bold tabular-nums">
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
              {!exento && !ivaActivo ? (
                <p className="text-muted-foreground text-xs">
                  El IVA está desactivado en Configuración: el precio con IVA es solo referencial.
                </p>
              ) : null}

              {stock ? (
                <div className="border-border w-full border-t pt-3 text-center">
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                    Stock disponible
                  </p>
                  {stock.disponible ? (
                    <p
                      className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-lg font-semibold tabular-nums ${
                        stock.bajoStock ? "bg-danger/12 text-danger" : "bg-success/12 text-success"
                      }`}
                    >
                      {stock.cantidadTexto ?? `${stock.cantidad} ${stock.unidad}`}
                      {stock.bajoStock ? (
                        <span className="text-xs font-medium">· Bajo stock</span>
                      ) : null}
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
