import type { CountryConfig, CurrencyConfig, TaxRate } from "./types";

export interface Money {
  /** Importe en la unidad menor (céntimos). */
  amountCents: number;
  /** Código ISO 4217. */
  currency: string;
}

/**
 * Formatea un importe (en céntimos) como texto monetario localizado.
 * Centraliza el formateo para que ningún módulo lo reimplemente.
 */
export function formatMoney(amountCents: number, currency: CurrencyConfig, locale: string): string {
  const amount = amountCents / 10 ** currency.decimals;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.code,
      minimumFractionDigits: currency.decimals,
      maximumFractionDigits: currency.decimals,
    }).format(amount);
  } catch {
    // Respaldo si el runtime no conoce la moneda.
    return `${currency.symbol} ${amount.toFixed(currency.decimals)}`;
  }
}

/** Formatea usando la moneda principal del país. */
export function formatPrimary(amountCents: number, country: CountryConfig): string {
  return formatMoney(amountCents, country.primaryCurrency, country.locale);
}

/** Calcula el impuesto (en céntimos) sobre una base imponible. */
export function taxFor(baseCents: number, tax: TaxRate): number {
  return Math.round(baseCents * tax.rate);
}

/** Suma de todos los impuestos del país sobre una base imponible. */
export function totalTaxes(baseCents: number, country: CountryConfig): number {
  return country.taxes.reduce((sum, tax) => sum + taxFor(baseCents, tax), 0);
}

/** Tasa IGTF del país como fracción decimal (0 si el país no aplica IGTF). */
export function getIgtfRate(country: CountryConfig): number {
  return country.igtf?.rate ?? 0;
}
