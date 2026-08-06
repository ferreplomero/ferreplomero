import { describe, expect, it } from "vitest";
import { parseMetodosPago, METODOS_PAGO_IDS } from "./metodos-pago";

describe("parseMetodosPago", () => {
  it("devuelve todos los métodos con activo=true cuando el input está vacío", () => {
    const result = parseMetodosPago([]);
    expect(result).toHaveLength(METODOS_PAGO_IDS.length);
    result.forEach((m) => expect(m.activo).toBe(true));
  });

  it("devuelve los métodos en el orden canónico definido", () => {
    const result = parseMetodosPago([]);
    const ids = result.map((m) => m.metodo);
    expect(ids).toEqual([...METODOS_PAGO_IDS]);
  });

  it("devuelve defaults cuando el input no es un array", () => {
    expect(parseMetodosPago(null)).toHaveLength(METODOS_PAGO_IDS.length);
    expect(parseMetodosPago(undefined)).toHaveLength(METODOS_PAGO_IDS.length);
    expect(parseMetodosPago("texto")).toHaveLength(METODOS_PAGO_IDS.length);
    expect(parseMetodosPago(42)).toHaveLength(METODOS_PAGO_IDS.length);
  });

  it("preserva el campo activo=false de métodos existentes", () => {
    const raw = [{ metodo: "efectivo_bs", activo: false }];
    const result = parseMetodosPago(raw);
    const metodo = result.find((m) => m.metodo === "efectivo_bs");
    expect(metodo?.activo).toBe(false);
  });

  it("rellena métodos faltantes con activo=true", () => {
    const raw = [{ metodo: "efectivo_bs", activo: true }];
    const result = parseMetodosPago(raw);
    expect(result).toHaveLength(METODOS_PAGO_IDS.length);
    const zelle = result.find((m) => m.metodo === "zelle");
    expect(zelle).toBeDefined();
    expect(zelle?.activo).toBe(true);
  });

  it("preserva los campos de datos (banco, teléfono, etc.)", () => {
    const raw = [
      {
        metodo: "pago_movil",
        activo: true,
        banco: "Banco de Venezuela",
        telefono: "0412-1234567",
        titular: "Juan Pérez",
        rif: "V-12345678",
      },
    ];
    const result = parseMetodosPago(raw);
    const pagoMovil = result.find((m) => m.metodo === "pago_movil");
    expect(pagoMovil?.banco).toBe("Banco de Venezuela");
    expect(pagoMovil?.telefono).toBe("0412-1234567");
    expect(pagoMovil?.titular).toBe("Juan Pérez");
    expect(pagoMovil?.rif).toBe("V-12345678");
  });

  it("ignora entradas con metodo inválido o desconocido", () => {
    const raw = [
      { metodo: "bitcoin", activo: true },
      { metodo: "efectivo_bs", activo: false },
    ];
    const result = parseMetodosPago(raw);
    const ids = result.map((m) => m.metodo as string);
    expect(ids).not.toContain("bitcoin");
    expect(result.find((m) => m.metodo === "efectivo_bs")?.activo).toBe(false);
  });

  it("maneja el jsonb null de Supabase como default", () => {
    const result = parseMetodosPago(null);
    expect(result.map((m) => m.metodo)).toEqual([...METODOS_PAGO_IDS]);
  });
});
