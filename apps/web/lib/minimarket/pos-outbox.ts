/**
 * Respaldo local (localStorage) de una venta en espera pendiente de guardar
 * en PowerSync. Existe porque una venta NUNCA debe perderse por timing: si el
 * cajero cierra el diálogo de cobro en el instante exacto en que PowerSync
 * todavía está inicializando (WASM + IndexedDB), el guardado en
 * `mm_ventas_pendientes` puede tardar unos intentos en tener éxito (ver
 * `reintentar.ts`). Mientras tanto, esta entrada vive en localStorage —
 * síncrono y siempre disponible, sin depender de que PowerSync esté listo —
 * así que sobrevive incluso a un cierre del navegador a medio guardar. En
 * cuanto la escritura real en PowerSync tiene éxito (en esta sesión o en la
 * siguiente, al volver a abrir el POS), la entrada se quita de aquí.
 */
import type {
  EstadoVentaPendiente,
  VentaPendienteCarritoItem,
  VentaPendientePago,
} from "@/lib/minimarket/powersync/ventas-pendientes-local";

export interface OutboxEntrada {
  id: string;
  tenantId: string;
  sucursalId: string;
  usuarioId: string;
  clienteId: string | null;
  nota: string | null;
  carrito: VentaPendienteCarritoItem[];
  pagos: VentaPendientePago[];
  descuentoPct: string;
  descuentoMonto: string;
  tasaTipo: string;
  subtotalUsd: number;
  estado: EstadoVentaPendiente;
  guardadoEn: string;
}

function claveOutbox(tenantId: string): string {
  return `arkiteq_mm_pos_outbox_${tenantId}`;
}

/** Todas las entradas de este tenant pendientes de confirmar en PowerSync. */
export function leerOutbox(tenantId: string): OutboxEntrada[] {
  try {
    const raw = localStorage.getItem(claveOutbox(tenantId));
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? (data as OutboxEntrada[]) : [];
  } catch {
    return [];
  }
}

/** Guarda (o reemplaza, por `id`) una entrada. Síncrono — no depende de PowerSync. */
export function guardarEnOutbox(tenantId: string, entrada: OutboxEntrada): void {
  try {
    const actuales = leerOutbox(tenantId).filter((e) => e.id !== entrada.id);
    actuales.push(entrada);
    localStorage.setItem(claveOutbox(tenantId), JSON.stringify(actuales));
  } catch {
    // localStorage puede fallar (modo privado con cuota agotada); no es
    // crítico para la sesión actual — `reintentar()` sigue intentando el
    // guardado real en memoria durante la misma sesión.
  }
}

/** Quita una entrada ya confirmada en PowerSync. */
export function quitarDeOutbox(tenantId: string, id: string): void {
  try {
    const restantes = leerOutbox(tenantId).filter((e) => e.id !== id);
    if (restantes.length > 0) {
      localStorage.setItem(claveOutbox(tenantId), JSON.stringify(restantes));
    } else {
      localStorage.removeItem(claveOutbox(tenantId));
    }
  } catch {
    // no crítico
  }
}
