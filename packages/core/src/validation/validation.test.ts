import { describe, expect, it } from "vitest";
import { loginSchema, signUpSchema, slugify } from "./index";

const REGISTRO_VALIDO = {
  nombre: "Jeramine",
  apellido: "Rojas",
  email: "arkiteq@gmail.com",
  whatsapp: "+58 412-1234567",
  password: "supersegura",
  confirmPassword: "supersegura",
};

describe("esquemas de autenticación", () => {
  it("rechaza correos inválidos", () => {
    const result = loginSchema.safeParse({ email: "no-es-correo", password: "x" });
    expect(result.success).toBe(false);
  });

  it("exige contraseña de al menos 8 caracteres al registrarse", () => {
    const result = signUpSchema.safeParse({ ...REGISTRO_VALIDO, password: "corta" });
    expect(result.success).toBe(false);
  });

  it("acepta un registro válido", () => {
    const result = signUpSchema.safeParse(REGISTRO_VALIDO);
    expect(result.success).toBe(true);
  });

  it("rechaza si las contraseñas no coinciden", () => {
    const result = signUpSchema.safeParse({ ...REGISTRO_VALIDO, confirmPassword: "otraclave123" });
    expect(result.success).toBe(false);
  });

  it("rechaza un WhatsApp con muy pocos dígitos", () => {
    const result = signUpSchema.safeParse({ ...REGISTRO_VALIDO, whatsapp: "12345" });
    expect(result.success).toBe(false);
  });

  it("rechaza nombre o apellido vacíos", () => {
    const result = signUpSchema.safeParse({ ...REGISTRO_VALIDO, apellido: "" });
    expect(result.success).toBe(false);
  });
});

describe("slugify", () => {
  it("normaliza acentos y espacios", () => {
    expect(slugify("Bodega Doña María")).toBe("bodega-dona-maria");
  });
});
