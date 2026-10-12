import { describe, expect, it } from "vitest";
import {
  calcularDescuentoPresupuesto,
  calcularTotalesPresupuesto,
  etiquetaDescuentoPresupuesto,
} from "./totales";

describe("etiquetaDescuentoPresupuesto", () => {
  it("muestra el porcentaje con coma decimal venezolana", () => {
    expect(etiquetaDescuentoPresupuesto("porcentaje", 7.5)).toBe("Descuento (7,5 %)");
    expect(etiquetaDescuentoPresupuesto("porcentaje", 10)).toBe("Descuento (10 %)");
  });

  it("el monto fijo no lleva porcentaje", () => {
    expect(etiquetaDescuentoPresupuesto("monto", 7)).toBe("Descuento");
  });
});

const items = [
  { cantidad: 2, precioUnitarioUsd: 10.5 }, // 21.00
  { cantidad: 3, precioUnitarioUsd: 4.333 }, // 13.00 (12.999 redondeado)
];

describe("calcularTotalesPresupuesto", () => {
  it("sin descuento ni IVA", () => {
    expect(
      calcularTotalesPresupuesto({
        items,
        descuentoTipo: "ninguno",
        descuentoValor: 0,
        ivaActivo: false,
        ivaPct: 16,
      }),
    ).toEqual({ subtotalUsd: 34, descuentoUsd: 0, baseUsd: 34, ivaUsd: 0, totalUsd: 34 });
  });

  it("descuento porcentual con IVA sobre la base neta", () => {
    expect(
      calcularTotalesPresupuesto({
        items,
        descuentoTipo: "porcentaje",
        descuentoValor: 10,
        ivaActivo: true,
        ivaPct: 16,
      }),
    ).toEqual({ subtotalUsd: 34, descuentoUsd: 3.4, baseUsd: 30.6, ivaUsd: 4.9, totalUsd: 35.5 });
  });

  it("descuento en monto fijo", () => {
    expect(
      calcularTotalesPresupuesto({
        items,
        descuentoTipo: "monto",
        descuentoValor: 5,
        ivaActivo: false,
        ivaPct: 16,
      }),
    ).toEqual({ subtotalUsd: 34, descuentoUsd: 5, baseUsd: 29, ivaUsd: 0, totalUsd: 29 });
  });

  it("el monto fijo nunca supera el subtotal", () => {
    const t = calcularTotalesPresupuesto({
      items,
      descuentoTipo: "monto",
      descuentoValor: 100,
      ivaActivo: true,
      ivaPct: 16,
    });
    expect(t.descuentoUsd).toBe(34);
    expect(t.totalUsd).toBe(0);
  });

  it("el porcentaje se topa en 100 y el valor del tipo 'ninguno' se ignora", () => {
    expect(calcularDescuentoPresupuesto(34, "porcentaje", 150)).toBe(34);
    expect(calcularDescuentoPresupuesto(34, "ninguno", 10)).toBe(0);
    expect(calcularDescuentoPresupuesto(34, "monto", -3)).toBe(0);
  });
});
