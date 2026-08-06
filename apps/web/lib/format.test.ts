import { describe, expect, it } from "vitest";
import { getInitials, safeInternalPath } from "./format";

describe("getInitials", () => {
  it("toma las iniciales de nombre y apellido", () => {
    expect(getInitials("Jeramine Rojas", "j@arkiteq.com")).toBe("JR");
  });

  it("usa una sola inicial cuando hay un único nombre", () => {
    expect(getInitials("Jeramine", "j@arkiteq.com")).toBe("J");
  });

  it("recurre al correo cuando no hay nombre", () => {
    expect(getInitials("", "arkiteq@gmail.com")).toBe("A");
  });
});

describe("safeInternalPath", () => {
  it("acepta rutas internas", () => {
    expect(safeInternalPath("/catalogo", "/inicio")).toBe("/catalogo");
  });

  it("rechaza URLs absolutas (open redirect)", () => {
    expect(safeInternalPath("https://malicioso.com", "/inicio")).toBe("/inicio");
    expect(safeInternalPath("//malicioso.com", "/inicio")).toBe("/inicio");
  });

  it("recurre al valor por defecto si es nulo", () => {
    expect(safeInternalPath(null, "/inicio")).toBe("/inicio");
  });
});
