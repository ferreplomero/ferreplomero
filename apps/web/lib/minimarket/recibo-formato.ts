/**
 * Formato compartido de los documentos de venta (recibo carta y ticket
 * térmico). Solo PRESENTACIÓN: nunca recalcula totales — todo monto sale ya
 * congelado de la venta (`DocumentoFiscal`). `metodoLabel`/`usd`/`bs` vivían
 * dentro de `ReciboDocumento`; se movieron aquí tal cual para que el ticket
 * muestre exactamente lo mismo que el recibo carta.
 */
import { METODOS_PAGO } from "@/lib/minimarket/constants";

export function metodoLabel(metodo: string): string {
  // "Saldo a favor" no vive en METODOS_PAGO (no es un método que el negocio
  // active/desactive en Configuración) — mismo caso puntual que ya se
  // resuelve así en el selector de cobro del POS.
  if (metodo === "credito_cliente") return "Saldo a favor";
  return METODOS_PAGO.find((m) => m.value === metodo)?.label ?? metodo;
}

export const usd = (n: number) =>
  new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD" }).format(n);
export const bs = (n: number) =>
  new Intl.NumberFormat("es-VE", { style: "currency", currency: "VES" }).format(n);

export const round2 = (n: number) => Math.round(n * 100) / 100;

export type ModoMoneda = "USD" | "VES" | "MIXTO";

/**
 * Moneda en la que conviene expresar el documento según cómo se cobró la
 * venta: solo Bs si TODOS los pagos reales fueron en Bs (pago móvil,
 * transferencia, efectivo Bs, tarjeta), solo USD si todos fueron en USD
 * (Zelle, efectivo USD), mixto en cualquier otro caso. Lee `moneda` tal como
 * quedó congelada en el pago. Fiado y saldo a favor no son dinero recibido
 * en una moneda concreta, así que no deciden el modo; sin pagos reales → MIXTO.
 */
export function monedaDelRecibo(pagos: readonly { metodo: string; moneda: string }[]): ModoMoneda {
  const reales = pagos.filter((p) => p.metodo !== "fiado" && p.metodo !== "credito_cliente");
  if (reales.length === 0) return "MIXTO";
  if (reales.every((p) => p.moneda === "VES")) return "VES";
  if (reales.every((p) => p.moneda === "USD")) return "USD";
  return "MIXTO";
}

/** Monto USD expresado en la moneda del documento: en modo Bs se convierte con
 * la tasa CONGELADA de la venta; en USD/mixto queda en USD. */
export function montoDocumento(valorUsd: number, tasa: number, modo: ModoMoneda): number {
  return modo === "VES" ? round2(valorUsd * tasa) : valorUsd;
}

/** Formatea un monto USD en la moneda del documento. */
export function fmtDocumento(valorUsd: number, tasa: number, modo: ModoMoneda): string {
  return modo === "VES" ? bs(montoDocumento(valorUsd, tasa, modo)) : usd(valorUsd);
}

// --- Formato del ticket térmico (`mm_config_negocio.parametros.formato_ticket`) ---

export interface FormatoTicket {
  /** Ancho del papel en mm (58 = tiquera térmica estándar en Venezuela). */
  anchoMm: number;
  /** Tamaño de letra relativo, en %. */
  fuentePct: number;
  mostrarLogo: boolean;
  mostrarDatosNegocio: boolean;
}

export const TICKET_ANCHO_MIN = 40;
export const TICKET_ANCHO_MAX = 120;
export const TICKET_FUENTE_MIN = 80;
export const TICKET_FUENTE_MAX = 150;

export const FORMATO_TICKET_DEFAULT: FormatoTicket = {
  anchoMm: 58,
  fuentePct: 100,
  mostrarLogo: true,
  mostrarDatosNegocio: true,
};

function numeroEnRango(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** Lee `parametros.formato_ticket`; cada campo ausente, de otro tipo o fuera
 * de rango cae a su valor por defecto. Nunca lanza. */
export function parseFormatoTicket(parametros: unknown): FormatoTicket {
  const raw =
    parametros && typeof parametros === "object" && !Array.isArray(parametros)
      ? (parametros as Record<string, unknown>).formato_ticket
      : undefined;
  const f =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = FORMATO_TICKET_DEFAULT;
  return {
    anchoMm: numeroEnRango(f.anchoMm, TICKET_ANCHO_MIN, TICKET_ANCHO_MAX) ?? d.anchoMm,
    fuentePct: numeroEnRango(f.fuentePct, TICKET_FUENTE_MIN, TICKET_FUENTE_MAX) ?? d.fuentePct,
    mostrarLogo: typeof f.mostrarLogo === "boolean" ? f.mostrarLogo : d.mostrarLogo,
    mostrarDatosNegocio:
      typeof f.mostrarDatosNegocio === "boolean" ? f.mostrarDatosNegocio : d.mostrarDatosNegocio,
  };
}
