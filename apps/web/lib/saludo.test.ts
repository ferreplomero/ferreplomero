import { describe, expect, it } from "vitest";
import { saludoPorHora } from "./saludo";

// Caracas es UTC-4 fijo (sin horario de verano): hora local T = instante UTC T+4h.
const TZ = "America/Caracas";

describe("saludoPorHora", () => {
  it("00:00 Caracas -> Buenas madrugadas (límite inferior)", () => {
    expect(saludoPorHora(TZ, new Date("2026-06-29T04:00:00.000Z"))).toBe("Buenas madrugadas");
  });

  it("05:59 Caracas -> Buenas madrugadas (límite superior)", () => {
    expect(saludoPorHora(TZ, new Date("2026-06-29T09:59:00.000Z"))).toBe("Buenas madrugadas");
  });

  it("06:00 Caracas -> Buenos días (límite inferior)", () => {
    expect(saludoPorHora(TZ, new Date("2026-06-29T10:00:00.000Z"))).toBe("Buenos días");
  });

  it("11:59 Caracas -> Buenos días (límite superior)", () => {
    expect(saludoPorHora(TZ, new Date("2026-06-29T15:59:00.000Z"))).toBe("Buenos días");
  });

  it("12:00 Caracas -> Buenas tardes (límite inferior)", () => {
    expect(saludoPorHora(TZ, new Date("2026-06-29T16:00:00.000Z"))).toBe("Buenas tardes");
  });

  it("18:59 Caracas -> Buenas tardes (límite superior)", () => {
    expect(saludoPorHora(TZ, new Date("2026-06-29T22:59:00.000Z"))).toBe("Buenas tardes");
  });

  it("19:00 Caracas -> Buenas noches (límite inferior)", () => {
    expect(saludoPorHora(TZ, new Date("2026-06-29T23:00:00.000Z"))).toBe("Buenas noches");
  });

  it("23:59 Caracas -> Buenas noches (límite superior, cruza medianoche UTC)", () => {
    expect(saludoPorHora(TZ, new Date("2026-06-30T03:59:00.000Z"))).toBe("Buenas noches");
  });
});
