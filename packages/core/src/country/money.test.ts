import { describe, expect, it } from "vitest";
import { getCountryConfig } from "./configs";
import { formatPrimary, taxFor, totalTaxes } from "./money";

describe("capa de país", () => {
  it("formatea el precio principal de Venezuela en bolívares", () => {
    const ve = getCountryConfig("VE");
    const text = formatPrimary(150000, ve); // 1.500,00 Bs
    expect(text).toContain("1.500");
  });

  it("aplica IVA del 16 % en Venezuela", () => {
    const ve = getCountryConfig("VE");
    const iva = ve.taxes[0];
    if (!iva) throw new Error("Venezuela debe tener IVA configurado");
    expect(taxFor(10000, iva)).toBe(1600);
  });

  it("aplica IVA del 19 % en Colombia", () => {
    const co = getCountryConfig("CO");
    expect(totalTaxes(10000, co)).toBe(1900);
  });

  it("recurre al país por defecto si el código no existe", () => {
    const fallback = getCountryConfig("ZZ" as never);
    expect(fallback.code).toBe("VE");
  });
});
