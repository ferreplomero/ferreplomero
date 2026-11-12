/**
 * Precio sin IVA / IVA / precio con IVA de un producto para el Excel de
 * inventario (Reportes → Resumen general). Solo PRESENTACIÓN: no toca ventas.
 *
 * `precio_usd` del producto es SIEMPRE precio sin IVA (en la venta el IVA se
 * suma encima: `base gravada × iva_pct / 100`, ver `ventas/actions.ts`). Aquí
 * se aplica el mismo porcentaje a todo producto no exento — de forma
 * REFERENCIAL, aunque el negocio tenga el IVA desactivado en Configuración
 * (decisión del usuario); los exentos quedan en 0.
 */
import { ivaBsDe, productoPagaIva, redondearBs } from "@/lib/minimarket/pos-calc";

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface PreciosIva {
  gravado: boolean;
  sinIvaUsd: number;
  ivaUsd: number;
  conIvaUsd: number;
  sinIvaBs: number | null;
  ivaBs: number | null;
  conIvaBs: number | null;
}

export function preciosConIva(
  precioSinIvaUsd: number,
  impuestoId: string | null | undefined,
  ivaPct: number,
  tasa: number | null,
): PreciosIva {
  const gravado = productoPagaIva(impuestoId) && ivaPct > 0;
  const sinIvaUsd = r2(precioSinIvaUsd);
  const ivaUsd = gravado ? r2((precioSinIvaUsd * ivaPct) / 100) : 0;
  const conIvaUsd = r2(sinIvaUsd + ivaUsd);
  // En Bs el IVA se calcula sobre el precio YA convertido a Bs (`ivaBsDe`), no
  // `ivaUsd × tasa` (el redondeo a centavos de $ desviaba hasta ±4,5 Bs).
  const hayTasa = !!tasa && tasa > 0;
  const sinIvaBs = hayTasa ? redondearBs(sinIvaUsd * tasa) : null;
  const ivaBs = hayTasa ? ivaBsDe(sinIvaUsd, tasa, gravado, ivaPct) : null;
  return {
    gravado,
    sinIvaUsd,
    ivaUsd,
    conIvaUsd,
    sinIvaBs,
    ivaBs,
    conIvaBs: sinIvaBs !== null && ivaBs !== null ? redondearBs(sinIvaBs + ivaBs) : null,
  };
}

/** IVA del valor total de un stock (sobre la base completa, como en la venta:
 * se redondea una sola vez sobre el subtotal, no unidad por unidad). */
export function ivaDeValor(
  valorSinIvaUsd: number,
  impuestoId: string | null | undefined,
  ivaPct: number,
): number {
  if (!productoPagaIva(impuestoId) || ivaPct <= 0) return 0;
  return r2((valorSinIvaUsd * ivaPct) / 100);
}
