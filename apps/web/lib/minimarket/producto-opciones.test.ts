import { describe, expect, it } from "vitest";
import { getCountryConfig } from "@arkiteq/core";
import { defaultsFiscalesProducto } from "./producto-opciones";

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
