/**
 * Cálculo ÚNICO de los totales de un presupuesto. Lo usan el servidor
 * (`presupuestos/actions.ts`: crear, editar, duplicar) y el formulario (vista
 * previa en vivo), para que lo que el usuario ve antes de guardar sea
 * exactamente lo que queda guardado — y, al convertir en venta, lo que el POS
 * cobra (ver `ventas/nueva/page.tsx`).
 *
 * El descuento es GLOBAL (sobre el subtotal de todas las líneas) y el IVA se
 * calcula sobre (subtotal − descuento), mismo criterio que el descuento de una
 * venta en el POS.
 */
import type { MmPresupuestoDescuentoTipo } from "@arkiteq/db";

const redondear = (n: number) => Math.round(n * 100) / 100;

export interface TotalesPresupuestoInput {
  items: { cantidad: number; precioUnitarioUsd: number }[];
  descuentoTipo: MmPresupuestoDescuentoTipo;
  /** Lo que escribió el usuario: 10 = 10 % (porcentaje) o $10 (monto). */
  descuentoValor: number;
  ivaActivo: boolean;
  ivaPct: number;
}

export interface TotalesPresupuesto {
  subtotalUsd: number;
  descuentoUsd: number;
  /** Subtotal menos descuento: base del IVA. */
  baseUsd: number;
  ivaUsd: number;
  totalUsd: number;
}

/**
 * Etiqueta del descuento para mostrar e imprimir, con el número en formato
 * venezolano ("Descuento (7,5 %)"). La comparten el detalle, la página
 * pública, el PDF y el Excel para que digan exactamente lo mismo.
 */
export function etiquetaDescuentoPresupuesto(
  tipo: MmPresupuestoDescuentoTipo,
  valor: number,
): string {
  if (tipo !== "porcentaje") return "Descuento";
  const pct = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 2 }).format(valor);
  return `Descuento (${pct} %)`;
}

/** Monto del descuento en USD, siempre entre 0 y el subtotal. */
export function calcularDescuentoPresupuesto(
  subtotalUsd: number,
  tipo: MmPresupuestoDescuentoTipo,
  valor: number,
): number {
  if (!Number.isFinite(valor) || valor <= 0 || subtotalUsd <= 0) return 0;
  if (tipo === "porcentaje") return redondear((subtotalUsd * Math.min(valor, 100)) / 100);
  if (tipo === "monto") return redondear(Math.min(valor, subtotalUsd));
  return 0;
}

export function calcularTotalesPresupuesto(input: TotalesPresupuestoInput): TotalesPresupuesto {
  const subtotalUsd = redondear(
    input.items.reduce((s, i) => s + redondear(i.cantidad * i.precioUnitarioUsd), 0),
  );
  const descuentoUsd = calcularDescuentoPresupuesto(
    subtotalUsd,
    input.descuentoTipo,
    input.descuentoValor,
  );
  const baseUsd = redondear(subtotalUsd - descuentoUsd);
  const ivaUsd =
    input.ivaActivo && input.ivaPct > 0 ? redondear((baseUsd * input.ivaPct) / 100) : 0;
  return { subtotalUsd, descuentoUsd, baseUsd, ivaUsd, totalUsd: redondear(baseUsd + ivaUsd) };
}
