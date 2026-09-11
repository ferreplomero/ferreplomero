import { describe, expect, it } from "vitest";
import { getCountryConfig } from "@arkiteq/core";
import {
  calcularDiferencial,
  defaultsFiscalesProducto,
  diferencialManual,
  margenMostrado,
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
  it("reproduce el ejemplo acordado: costo $10, margen 35%, proveedor 1000, BCV 820 -> $18.77 (2 decimales)", () => {
    // El diferencial se maneja con 2 decimales (no 4): 1000/820 = 1.2195...
    // redondea a 1.22, un centavo por encima del $18.76 que daba sin redondear.
    const diferencial = calcularDiferencial(1000, 820);
    expect(diferencial).toBe(1.22);
    if (diferencial === null) throw new Error("diferencial no debería ser null aquí");

    const sinDiferencial = precioDesdeMargenVenta(10, 35);
    expect(sinDiferencial).toBeCloseTo(15.3846, 4);
    if (sinDiferencial === null) throw new Error("sinDiferencial no debería ser null aquí");

    const precioFinal = sinDiferencial * diferencial;
    expect(Math.round(precioFinal * 100) / 100).toBe(18.77);
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

describe("diferencialManual — diferencial escrito directo (modo 'personalizada'), sin dividir contra BCV", () => {
  it("usa el valor tal cual, redondeado a 2 decimales", () => {
    expect(diferencialManual(1.22)).toBe(1.22);
    expect(diferencialManual(1.2345)).toBe(1.23);
  });

  it("valores inválidos (cero, negativo, NaN) devuelven null", () => {
    expect(diferencialManual(0)).toBeNull();
    expect(diferencialManual(-1)).toBeNull();
    expect(diferencialManual(Number.NaN)).toBeNull();
  });
});

describe("margenMostrado — la tabla/tarjetas/detalle deben mostrar el margen INGRESADO, no el recalculado", () => {
  it("con diferencial activo: muestra margen_venta_pct (el ingresado), no el margen sobre costo recalculado", () => {
    // costo $10, precio $18.77 (con diferencial) -> margen sobre costo sería ~87.7%,
    // muy distinto del 35% que el usuario realmente ingresó como margen sobre venta.
    const producto = {
      costo_usd: 10,
      precio_usd: 18.77,
      diferencial_activo: true,
      margen_venta_pct: 35,
    };
    expect(margenMostrado(producto)).toBe(35);
  });

  it("sin diferencial: muestra el margen sobre costo de siempre", () => {
    const producto = {
      costo_usd: 10,
      precio_usd: 15,
      diferencial_activo: false,
      margen_venta_pct: null,
    };
    expect(margenMostrado(producto)).toBe(50);
  });

  it("diferencial activo pero sin margen_venta_pct guardado (capa opcional): cae al margen sobre costo", () => {
    const producto = {
      costo_usd: 10,
      precio_usd: 15,
      diferencial_activo: true,
      margen_venta_pct: null,
    };
    expect(margenMostrado(producto)).toBe(50);
  });
});
