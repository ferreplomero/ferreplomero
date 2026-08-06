import { describe, expect, it } from "vitest";
import { construirMensajeSoporte } from "./soporte-mensaje";

describe("construirMensajeSoporte", () => {
  it("incluye nombre, negocio, correo y módulo cuando todos están disponibles", () => {
    const mensaje = construirMensajeSoporte(
      {
        nombre: "Jeramine",
        correo: "jera@example.com",
        negocio: "Bodega El Buen Precio",
        modulo: "Minimarket — Plan activo",
      },
      "No me deja registrar una venta",
    );

    expect(mensaje).toBe(
      "Hola, soporte de Arkiteq Data. Soy Jeramine del negocio Bodega El Buen Precio. " +
        "(correo jera@example.com · Minimarket — Plan activo). " +
        "Mi solicitud: No me deja registrar una venta",
    );
  });

  it("omite el negocio con gracia si no hay tenant activo", () => {
    const mensaje = construirMensajeSoporte(
      { nombre: "Jeramine", correo: "jera@example.com", negocio: null, modulo: null },
      "¿Cómo activo un módulo?",
    );

    expect(mensaje).toBe(
      "Hola, soporte de Arkiteq Data. Soy Jeramine. (correo jera@example.com). " +
        "Mi solicitud: ¿Cómo activo un módulo?",
    );
  });

  it("recorta espacios sobrantes de la solicitud", () => {
    const mensaje = construirMensajeSoporte(
      { nombre: "", correo: "", negocio: null, modulo: null },
      "  hola  ",
    );

    expect(mensaje).toBe("Hola, soporte de Arkiteq Data. Mi solicitud: hola");
  });
});
