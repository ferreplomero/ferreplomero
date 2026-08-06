import { describe, expect, it } from "vitest";
import { fechaEnTz, hoyEnTz, rangoLocalAUtc } from "./date-format";

describe("fechaEnTz", () => {
  it("usa la fecha de calendario del negocio, no la de UTC", () => {
    // 2026-06-30T02:00:00Z son las 22:00 del 29 en Caracas (UTC-4): sigue siendo "ayer" en UTC-terms.
    expect(fechaEnTz("2026-06-30T02:00:00.000Z", "America/Caracas")).toBe("2026-06-29");
  });

  it("una venta de las 9pm en Caracas cae en el día correcto, aunque en UTC ya sea el día siguiente", () => {
    // 21:00 del 29 en Caracas (UTC-4) = 01:00 del 30 en UTC.
    expect(fechaEnTz("2026-06-30T01:00:00.000Z", "America/Caracas")).toBe("2026-06-29");
  });

  it("coincide con la fecha UTC cuando la zona es UTC", () => {
    expect(fechaEnTz("2026-06-29T15:00:00.000Z", "UTC")).toBe("2026-06-29");
  });
});

describe("hoyEnTz", () => {
  it("devuelve una fecha con formato YYYY-MM-DD", () => {
    expect(hoyEnTz("America/Caracas")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("rangoLocalAUtc", () => {
  it("calcula los límites UTC de un solo día de calendario en Caracas (UTC-4, sin horario de verano)", () => {
    const { desdeIso, hastaIso } = rangoLocalAUtc(
      { desde: "2026-06-29", hasta: "2026-06-29" },
      "America/Caracas",
    );
    expect(desdeIso).toBe("2026-06-29T04:00:00.000Z");
    expect(hastaIso).toBe("2026-06-30T04:00:00.000Z");
  });

  it("incluye una venta hecha a las 9pm hora de Caracas dentro del rango de 'hoy'", () => {
    const { desdeIso, hastaIso } = rangoLocalAUtc(
      { desde: "2026-06-29", hasta: "2026-06-29" },
      "America/Caracas",
    );
    const ventaUtc = "2026-06-30T01:00:00.000Z"; // 21:00 del 29 en Caracas
    expect(ventaUtc >= desdeIso && ventaUtc < hastaIso).toBe(true);
  });

  it("excluye una venta del día siguiente hecha ya de madrugada en Caracas", () => {
    const { hastaIso } = rangoLocalAUtc(
      { desde: "2026-06-29", hasta: "2026-06-29" },
      "America/Caracas",
    );
    const ventaDiaSiguiente = "2026-06-30T05:00:00.000Z"; // 01:00 del 30 en Caracas
    expect(ventaDiaSiguiente >= hastaIso).toBe(true);
  });

  it("abarca un rango de varios días completos (semana)", () => {
    const { desdeIso, hastaIso } = rangoLocalAUtc(
      { desde: "2026-06-23", hasta: "2026-06-29" },
      "America/Caracas",
    );
    expect(desdeIso).toBe("2026-06-23T04:00:00.000Z");
    expect(hastaIso).toBe("2026-06-30T04:00:00.000Z");
  });

  it("respeta el cambio de horario de verano en zonas que lo tienen (America/New_York)", () => {
    const invierno = rangoLocalAUtc(
      { desde: "2026-01-15", hasta: "2026-01-15" },
      "America/New_York",
    );
    const verano = rangoLocalAUtc({ desde: "2026-07-15", hasta: "2026-07-15" }, "America/New_York");
    // EST = UTC-5 en enero, EDT = UTC-4 en julio: el offset debe ser distinto.
    expect(invierno.desdeIso).toBe("2026-01-15T05:00:00.000Z");
    expect(verano.desdeIso).toBe("2026-07-15T04:00:00.000Z");
  });

  it("en UTC no aplica ningún corrimiento", () => {
    const { desdeIso, hastaIso } = rangoLocalAUtc(
      { desde: "2026-06-29", hasta: "2026-06-29" },
      "UTC",
    );
    expect(desdeIso).toBe("2026-06-29T00:00:00.000Z");
    expect(hastaIso).toBe("2026-06-30T00:00:00.000Z");
  });
});
