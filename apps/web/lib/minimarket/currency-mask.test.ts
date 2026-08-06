import { describe, expect, it } from "vitest";
import { formatMaskedAmount, parseMaskedInput } from "./currency-mask";

describe("parseMaskedInput", () => {
  it("convierte una secuencia de dígitos en monto limpio con 2 decimales", () => {
    expect(parseMaskedInput("191917")).toBe("1919.17");
  });

  it("acumula los dígitos que se van agregando, uno a uno", () => {
    expect(parseMaskedInput("1")).toBe("0.01");
    expect(parseMaskedInput("19")).toBe("0.19");
    expect(parseMaskedInput("191")).toBe("1.91");
    expect(parseMaskedInput("1919")).toBe("19.19");
  });

  it("ignora separadores y letras, solo conserva dígitos", () => {
    expect(parseMaskedInput("1.919,17")).toBe("1919.17");
    expect(parseMaskedInput("abc123")).toBe("1.23");
  });

  it("devuelve vacío cuando no hay dígitos", () => {
    expect(parseMaskedInput("")).toBe("");
    expect(parseMaskedInput(",.")).toBe("");
  });

  it("respeta ceros a la izquierda sin romper el cálculo", () => {
    expect(parseMaskedInput("005")).toBe("0.05");
  });

  it("limita a un máximo de dígitos razonable", () => {
    expect(parseMaskedInput("1234567890123456")).toBe(parseMaskedInput("123456789012"));
  });
});

describe("formatMaskedAmount", () => {
  it("formatea con punto de miles y coma decimal", () => {
    expect(formatMaskedAmount("1919.17")).toBe("1.919,17");
  });

  it("formatea montos sin miles", () => {
    expect(formatMaskedAmount("19.19")).toBe("19,19");
    expect(formatMaskedAmount("0.05")).toBe("0,05");
  });

  it("formatea montos grandes con varios puntos de miles", () => {
    expect(formatMaskedAmount("1234567.89")).toBe("1.234.567,89");
  });

  it("devuelve vacío para monto vacío", () => {
    expect(formatMaskedAmount("")).toBe("");
  });

  it("es el inverso de parseMaskedInput para una secuencia típica", () => {
    const monto = parseMaskedInput("191917");
    expect(formatMaskedAmount(monto)).toBe("1.919,17");
  });
});
