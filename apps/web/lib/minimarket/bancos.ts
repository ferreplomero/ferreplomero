import type { MmMetodoPago } from "@arkiteq/db";

/**
 * Métodos de pago que tienen cuentas bancarias configurables (módulo Bancos).
 * Zelle se sumó en la migración 0089 (se identifica por CORREO en vez de
 * banco, ver esa migración) — sigue el mismo mecanismo de cuentas/ledger que
 * pago_movil/transferencia/tarjeta desde 0083. Cashea se suma en la migración
 * 0091: el negocio registra el banco donde Cashea le deposita, igual que
 * transferencia (banco/titular/cuenta).
 */
export const METODOS_CON_CUENTA = [
  "pago_movil",
  "transferencia",
  "tarjeta",
  "zelle",
  "cashea",
] as const;

export type MetodoConCuenta = (typeof METODOS_CON_CUENTA)[number];

export function esMetodoConCuenta(metodo: MmMetodoPago): metodo is MetodoConCuenta {
  return (METODOS_CON_CUENTA as readonly string[]).includes(metodo);
}

/**
 * Moneda NATIVA y FIJA de una cuenta bancaria — nunca cambia con la tasa.
 * Zelle es la única en USD (se recibe en dólares); el resto (pago móvil,
 * transferencia, tarjeta, Cashea) se recibe y se guarda en bolívares. El
 * saldo de una cuenta se muestra SIEMPRE en su moneda nativa, jamás
 * reconvertido con la tasa del momento — ver `saldoNativo` en
 * `lib/minimarket/data/bancos.ts`.
 */
export function monedaNativaCuenta(metodo: MetodoConCuenta): "USD" | "VES" {
  return metodo === "zelle" ? "USD" : "VES";
}

/** Pago móvil, transferencia y Zelle tienen sentido como destino de un vuelto
 * digital: son medios "push" (el negocio envía el dinero, USD por Zelle o Bs
 * por los otros dos). Tarjeta/punto no se puede usar para devolver vuelto —
 * eso requeriría una reversa en el propio datáfono, una operación distinta
 * que este módulo no cubre. */
export const METODOS_VUELTO_DIGITAL = ["pago_movil", "transferencia", "zelle"] as const;

export type MetodoVueltoDigital = (typeof METODOS_VUELTO_DIGITAL)[number];

export function esMetodoVueltoDigital(metodo: MmMetodoPago): metodo is MetodoVueltoDigital {
  return (METODOS_VUELTO_DIGITAL as readonly string[]).includes(metodo);
}

export const METODO_CUENTA_LABEL: Record<MetodoConCuenta, string> = {
  pago_movil: "Pago Móvil",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta / Punto",
  zelle: "Zelle",
  cashea: "Cashea",
};

/**
 * Segmento de ruta (kebab-case) de la página de Bancos dedicada a cada
 * método — `/minimarket/bancos/{RUTA_TIPO_CUENTA[metodo]}`. Fuente única
 * para el submenú del sidebar (`lib/minimarket/nav.ts`) y para cualquier
 * link cruzado (ej. "volver" desde el detalle de una cuenta a su tipo).
 */
export const RUTA_TIPO_CUENTA: Record<MetodoConCuenta, string> = {
  pago_movil: "pago-movil",
  transferencia: "transferencia",
  tarjeta: "tarjeta",
  zelle: "zelle",
  cashea: "cashea",
};
