import type { CountryCode, CountryConfig } from "./types";

/**
 * Catálogo de configuraciones de país. Para añadir un país nuevo basta con
 * registrar su CountryConfig aquí: la lógica de negocio no cambia.
 */
export const COUNTRY_CONFIGS: Record<CountryCode, CountryConfig> = {
  VE: {
    code: "VE",
    name: "Venezuela",
    locale: "es-VE",
    defaultTimezone: "America/Caracas",
    primaryCurrency: { code: "VES", symbol: "Bs.", decimals: 2 },
    secondaryCurrency: { code: "USD", symbol: "$", decimals: 2 },
    taxes: [{ id: "iva", label: "IVA", rate: 0.16 }],
    igtf: { rate: 0.03 },
    invoice: { documentLabel: "Factura", taxIdLabel: "RIF" },
  },
  CO: {
    code: "CO",
    name: "Colombia",
    locale: "es-CO",
    defaultTimezone: "America/Bogota",
    primaryCurrency: { code: "COP", symbol: "$", decimals: 0 },
    taxes: [{ id: "iva", label: "IVA", rate: 0.19 }],
    invoice: { documentLabel: "Factura electrónica", taxIdLabel: "NIT" },
  },
};

export const DEFAULT_COUNTRY: CountryCode =
  (process.env.NEXT_PUBLIC_DEFAULT_COUNTRY as CountryCode | undefined) ?? "VE";

/** Obtiene la configuración de un país (con respaldo al país por defecto). */
export function getCountryConfig(code: CountryCode = DEFAULT_COUNTRY): CountryConfig {
  return COUNTRY_CONFIGS[code] ?? COUNTRY_CONFIGS[DEFAULT_COUNTRY];
}
