import { describe, expect, it } from "vitest";
import { getCountryConfig } from "@arkiteq/core";
import {
  calcularDiferencial,
  defaultsFiscalesProducto,
  precioDesdeMargenVenta,
} from "./producto-opciones";

const VE = getCountryConfig("VE");

describe("defaultsFiscalesProducto — un producto nuevo hereda la config fiscal del negocio", () => {
  it("negocio con IVA e IGTF activos: el producto nace gravado con IVA y con IGTF", () => {
    const d = defaultsFiscalesProducto(VE, { ivaActivo: true, igtfActivo: true });
    expect(d).toEqual({ impuestoId: "iva", aplicaIgtf: true });
  });

  it("negocio sin IVA (solo IGTF): el producto nace exento de IVA pero con IGTF", () => {
    const d = defaultsFiscalesProducto(VE, { ivaActivo: false, igtfActivo: true });
    expect(d).toEqual({ impuestoId: "exento", aplicaIgtf: true });
  });

  it("negocio sin ningún impuesto: el producto nace exento y sin IGTF", () => {
    const d = defaultsFiscalesProducto(VE, { ivaActivo: false, igtfActivo: false });
    expect(d).toEqual({ impuestoId: "exento", aplicaIgtf: false });
  });

  it("negocio solo con IVA (sin IGTF): el producto nace gravado con IVA y sin IGTF", () => {
    const d = defaultsFiscalesProducto(VE, { ivaActivo: true, igtfActivo: false });
    expect(d).toEqual({ impuestoId: "iva", aplicaIgtf: false });
  });
});

describe("diferencial de tasa del proveedor", () => {
  it("reproduce el ejemplo acordado: costo $10, margen 35%, proveedor 1000, BCV 820 -> $18.76", () => {
    const diferencial = calcularDiferencial(1000, 820);
    expect(diferencial).toBeCloseTo(1.2195, 4);
    if (diferencial === null) throw new Error("diferencial no debería ser null aquí");

    const sinDiferencial = precioDesdeMargenVenta(10, 35);
    expect(sinDiferencial).toBeCloseTo(15.3846, 4);
    if (sinDiferencial === null) throw new Error("sinDiferencial no debería ser null aquí");

    const precioFinal = sinDiferencial * diferencial;
    expect(Math.round(precioFinal * 100) / 100).toBe(18.76);
  });

  it("proveedor con la misma tasa que BCV: diferencial = 1 (no cambia el precio)", () => {
    expect(calcularDiferencial(820, 820)).toBe(1);
  });

  it("tasas no positivas: devuelve null en vez de dividir por cero", () => {
    expect(calcularDiferencial(0, 820)).toBeNull();
    expect(calcularDiferencial(1000, 0)).toBeNull();
  });

  it("margen sobre venta >= 100%: precioDesdeMargenVenta devuelve null (división por cero/negativa)", () => {
    expect(precioDesdeMargenVenta(10, 100)).toBeNull();
    expect(precioDesdeMargenVenta(10, 150)).toBeNull();
  });
});
