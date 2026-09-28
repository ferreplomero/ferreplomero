import { describe, expect, it } from "vitest";
import { ivaDeValor, preciosConIva } from "./inventario-iva";

describe("preciosConIva", () => {
  it("producto gravado 16%: IVA encima del precio sin IVA, en USD y Bs", () => {
    const p = preciosConIva(10, "iva", 16, 857.01);
    expect(p).toEqual({
      gravado: true,
      sinIvaUsd: 10,
      ivaUsd: 1.6,
      conIvaUsd: 11.6,
      sinIvaBs: 8570.1,
      ivaBs: 1371.22,
      conIvaBs: 9941.32,
    });
  });

  it("producto exento: IVA 0 y precio con IVA = sin IVA", () => {
    const p = preciosConIva(3.5, "exento", 16, 800);
    expect(p.gravado).toBe(false);
    expect(p.ivaUsd).toBe(0);
    expect(p.conIvaUsd).toBe(3.5);
    expect(p.ivaBs).toBe(0);
    expect(p.conIvaBs).toBe(2800);
  });

  it("redondea el IVA a 2 decimales como la venta", () => {
    expect(preciosConIva(1.29, "iva", 16, null).ivaUsd).toBe(0.21);
    expect(preciosConIva(1.29, "iva", 16, null).conIvaUsd).toBe(1.5);
  });

  it("sin tasa: columnas en Bs quedan null", () => {
    const p = preciosConIva(5, "iva", 16, null);
    expect(p.sinIvaBs).toBeNull();
    expect(p.conIvaBs).toBeNull();
  });
});

describe("ivaDeValor", () => {
  it("IVA sobre el valor total del stock, redondeado una sola vez", () => {
    // 3 × 1.29 = 3.87 → 16% = 0.6192 → 0.62 (no 3 × 0.21 = 0.63)
    expect(ivaDeValor(3.87, "iva", 16)).toBe(0.62);
  });

  it("exento → 0", () => {
    expect(ivaDeValor(100, "exento", 16)).toBe(0);
  });
});
