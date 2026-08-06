import type { MmMetodoPago } from "@arkiteq/db";
import { getCountryConfig, getIgtfRate } from "@arkiteq/core";

/** IGTF (3 %) derivado de la capa de país VE. */
export const IGTF_RATE = getIgtfRate(getCountryConfig("VE"));

/** Métodos de pago que se liquidan en divisa (USD) y causan IGTF. */
export const METODOS_DIVISA: MmMetodoPago[] = ["efectivo_usd", "zelle"];

/**
 * Métodos cuya moneda de liquidación es el bolívar. Cashea vive aquí (no en
 * `METODOS_DIVISA`): el comerciante recibe el pago de Cashea por transferencia
 * a su cuenta, igual que pago móvil o transferencia — no es divisa física, así
 * que nunca causa IGTF (regla 13 de CLAUDE.md), sin importar que el crédito
 * que Cashea le da al cliente esté referenciado en dólares.
 */
export const METODOS_BS: MmMetodoPago[] = [
  "efectivo_bs",
  "pago_movil",
  "transferencia",
  "tarjeta",
  "cashea",
];

export interface MetodoPagoInfo {
  value: MmMetodoPago;
  label: string;
  /** Moneda en la que se ingresa el monto del pago. */
  moneda: "USD" | "VES" | "credito";
}

/** Catálogo de métodos de pago para la UI del POS. */
export const METODOS_PAGO: MetodoPagoInfo[] = [
  { value: "efectivo_bs", label: "Efectivo Bs", moneda: "VES" },
  { value: "efectivo_usd", label: "Efectivo USD", moneda: "USD" },
  { value: "pago_movil", label: "Pago móvil", moneda: "VES" },
  { value: "transferencia", label: "Transferencia", moneda: "VES" },
  { value: "zelle", label: "Zelle", moneda: "USD" },
  { value: "tarjeta", label: "Tarjeta", moneda: "VES" },
  { value: "cashea", label: "Cashea", moneda: "VES" },
  { value: "fiado", label: "Fiado (crédito)", moneda: "credito" },
];

/** Métodos aceptados para abonar al fiado (sin "fiado" — pago real). Incluye
 * "tarjeta" (punto de venta): hay clientes que abonan por datáfono. */
export const METODOS_ABONO: MetodoPagoInfo[] = [
  { value: "efectivo_bs", label: "Efectivo Bs", moneda: "VES" },
  { value: "efectivo_usd", label: "Efectivo USD", moneda: "USD" },
  { value: "pago_movil", label: "Pago móvil", moneda: "VES" },
  { value: "transferencia", label: "Transferencia", moneda: "VES" },
  { value: "zelle", label: "Zelle", moneda: "USD" },
  { value: "tarjeta", label: "Tarjeta / Punto", moneda: "VES" },
];

/** ¿El método causa IGTF? */
export function causaIgtf(metodo: MmMetodoPago): boolean {
  return METODOS_DIVISA.includes(metodo);
}

/**
 * Métodos válidos como origen del dinero de un GASTO (de dónde salió el
 * pago) — sin "fiado" (un gasto no se le fía a nadie) ni "cashea" (crédito
 * al cliente en una venta, no aplica a un pago que hace el negocio).
 */
export const METODOS_GASTO_IDS = [
  "efectivo_bs",
  "efectivo_usd",
  "pago_movil",
  "transferencia",
  "zelle",
  "tarjeta",
] as const satisfies readonly MmMetodoPago[];

export const METODOS_GASTO: MetodoPagoInfo[] = METODOS_PAGO.filter((m) =>
  (METODOS_GASTO_IDS as readonly MmMetodoPago[]).includes(m.value),
);

/**
 * Métodos válidos como destino del dinero de un OTRO INGRESO (a dónde entró
 * el pago) — mismo subconjunto que un gasto (sin "fiado" ni "cashea"), calco
 * de `METODOS_GASTO_IDS`: un ingreso que no es venta se recibe por los mismos
 * medios reales que el negocio ya usa para pagar sus gastos.
 */
export const METODOS_OTRO_INGRESO_IDS = METODOS_GASTO_IDS;

export const METODOS_OTRO_INGRESO: MetodoPagoInfo[] = METODOS_GASTO;

/**
 * Métodos válidos como origen del dinero de una COMPRA a un proveedor —
 * mismo subconjunto real que un gasto (`METODOS_GASTO_IDS`) más
 * "credito_proveedor": pseudo-método (mismo criterio que "credito_cliente"
 * en ventas, ver migración 0086) para una compra ya recibida que el negocio
 * AÚN NO le ha pagado al proveedor (cuenta por pagar real, distinta del
 * estado "borrador" que solo indica mercancía pendiente de RECIBIR). No
 * descuenta caja/banco hasta que se registre el pago real con
 * `pagarCompra` (ver `compras/actions.ts`).
 */
export const METODOS_COMPRA_IDS = [
  ...METODOS_GASTO_IDS,
  "credito_proveedor",
] as const satisfies readonly MmMetodoPago[];

export const METODOS_COMPRA: MetodoPagoInfo[] = [
  ...METODOS_GASTO,
  { value: "credito_proveedor", label: "Crédito (pago pendiente al proveedor)", moneda: "credito" },
];
