/**
 * Capa abstracta de tipo de cambio divisas.
 *
 * Define la interfaz `ExchangeRateSource` para encapsular cualquier fuente de
 * tasa (BCV, paralelo, fija, etc.) y `resolveExchangeRate` como función pura
 * y determinista para seleccionar la tasa vigente. Los verticales instancian
 * su propia capa de persistencia (tabla específica) importando estos contratos.
 */

export interface ExchangeRate {
  /** Tasa (unidades de moneda destino por unidad de moneda origen). */
  valor: number;
  /** Identificador de la fuente usada ("manual", "auto", etc.). */
  fuente: string;
  /** Fecha de la tasa en formato YYYY-MM-DD. */
  fecha: string;
}

/**
 * Fuente automática de tasa de cambio. Cada implementación encapsula de dónde
 * se obtiene el valor (BCV, paralelo, proveedor externo, etc.).
 */
export interface ExchangeRateSource {
  /** Clave que identifica esta fuente en la configuración del negocio. */
  readonly key: string;
  /** Etiqueta legible para la UI. */
  readonly label: string;
  /** Obtiene la tasa. Lanza si no hay conexión o la fuente falla. */
  fetchRate(): Promise<number>;
}

const SOURCES = new Map<string, ExchangeRateSource>();

/** Registra (o reemplaza) una fuente automática de tasa. */
export function registerExchangeRateSource(source: ExchangeRateSource): void {
  SOURCES.set(source.key, source);
}

/** Devuelve la fuente para una clave de configuración, o null si no existe. */
export function getExchangeRateSource(key: string | null | undefined): ExchangeRateSource | null {
  if (!key || key === "manual") return null;
  return SOURCES.get(key) ?? null;
}

/**
 * Selecciona la tasa vigente: el override manual del día prevalece sobre
 * cualquier otra; si no hay manual de hoy, usa la última registrada.
 * Función pura — no accede a bases de datos.
 */
export function resolveExchangeRate(
  manualHoy: Pick<ExchangeRate, "valor" | "fuente" | "fecha"> | null,
  ultima: Pick<ExchangeRate, "valor" | "fuente" | "fecha"> | null,
): ExchangeRate | null {
  const elegida = manualHoy ?? ultima;
  if (!elegida) return null;
  return { valor: Number(elegida.valor), fuente: elegida.fuente, fecha: elegida.fecha };
}
