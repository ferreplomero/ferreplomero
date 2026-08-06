import type { CountryCode } from "@arkiteq/db";

export type { CountryCode };

/** Una moneda con la que opera un país. */
export interface CurrencyConfig {
  /** Código ISO 4217 (p. ej. "USD", "VES", "COP"). */
  code: string;
  /** Símbolo para mostrar (p. ej. "$", "Bs."). */
  symbol: string;
  /** Decimales habituales para esta moneda. */
  decimals: number;
}

/** Un impuesto aplicable (p. ej. IVA). `rate` es una fracción: 0.16 = 16 %. */
export interface TaxRate {
  id: string;
  label: string;
  rate: number;
}

/**
 * Configuración intercambiable por país. La lógica de negocio NUNCA incrusta
 * moneda, impuestos ni formato de factura: los recibe desde aquí.
 */
export interface CountryConfig {
  code: CountryCode;
  name: string;
  /** Locale BCP-47 para formateo (p. ej. "es-VE"). */
  locale: string;
  /** Zona horaria IANA por defecto (p. ej. "America/Caracas"). */
  defaultTimezone: string;
  /** Moneda principal de facturación. */
  primaryCurrency: CurrencyConfig;
  /** Moneda secundaria (p. ej. USD como referencia en Venezuela). */
  secondaryCurrency?: CurrencyConfig;
  /** Impuestos aplicables por defecto. */
  taxes: TaxRate[];
  /**
   * IGTF — Impuesto a las Grandes Transacciones Financieras (Venezuela).
   * Undefined en países donde no aplica.
   */
  igtf?: {
    /** Tasa como fracción decimal: 0.03 = 3 %. */
    rate: number;
  };
  /** Etiquetas locales para documentos fiscales. */
  invoice: {
    /** Nombre del documento (p. ej. "Factura"). */
    documentLabel: string;
    /** Etiqueta del identificador fiscal (p. ej. "RIF", "NIT"). */
    taxIdLabel: string;
  };
}
