import { describe, expect, it } from "vitest";
import { evaluarFuerzaPassword } from "./password-strength";

describe("evaluarFuerzaPassword", () => {
  it("devuelve nivel vacío para contraseña vacía", () => {
    expect(evaluarFuerzaPassword("").nivel).toBe("vacia");
  });

  it("marca como débil una contraseña corta y simple", () => {
    expect(evaluarFuerzaPassword("abc123").nivel).toBe("debil");
  });

  it("marca como media una contraseña de 8+ caracteres con mayúsculas y números", () => {
    expect(evaluarFuerzaPassword("Abcdefg1").nivel).toBe("media");
  });

  it("marca como fuerte una contraseña larga con mayúsculas, números y símbolos", () => {
    expect(evaluarFuerzaPassword("Abcdefghijk1!").nivel).toBe("fuerte");
  });

  it("sugiere agregar números y símbolos cuando faltan", () => {
    const resultado = evaluarFuerzaPassword("solominusculas");
    expect(resultado.sugerencias.join(" ")).toMatch(/números/);
  });
});
