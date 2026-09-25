import { describe, expect, it } from "vitest";
import { numeroWhatsappPedido } from "./whatsapp";

describe("numeroWhatsappPedido", () => {
  it("agrega 58 a un celular guardado sin el 0 inicial", () => {
    expect(numeroWhatsappPedido("4247559929")).toBe("584247559929");
  });
  it("mantiene el comportamiento de siempre para los demás formatos", () => {
    expect(numeroWhatsappPedido("0414-4072499")).toBe("584144072499");
    expect(numeroWhatsappPedido("+58 412 1234567")).toBe("584121234567");
  });
});
