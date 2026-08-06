import { describe, expect, it, vi } from "vitest";
import { fetchConRespaldo, parseBcvRate, parseNumeroBcv } from "./rate-sources";

const FRAGMENTO_WIDGET_BCV = `
  <div class="row recuadrotsmc">
    <div class="col-sm-6 col-xs-6">
      <img src="/sites/default/files/euro-04_2.png" class="icono_bss_blanco1">
      <span> EUR </span> </div>
    <div class="col-sm-6 col-xs-6 centrado textp"><strong class="strong-tb"> 763,19191650</strong> </div>
  </div>
  <div class="row recuadrotsmc">
    <div class="col-sm-6 col-xs-6">
      <img src="/sites/default/files/dollar-04_2.png" class="icono_bss_blanco1">
      <span> USD</span> </div>
    <div class="col-sm-6 col-xs-6 centrado textp"> <strong class="strong-tb">667,05000000</strong>  </div>
  </div>
`;

describe("parseNumeroBcv", () => {
  it("convierte el formato venezolano (coma decimal) a número", () => {
    expect(parseNumeroBcv("667,05000000")).toBeCloseTo(667.05, 6);
    expect(parseNumeroBcv(" 763,19191650")).toBeCloseTo(763.1919165, 6);
  });

  it("quita separadores de miles (punto) antes de la coma decimal", () => {
    expect(parseNumeroBcv("1.234,50")).toBe(1234.5);
  });
});

describe("parseBcvRate", () => {
  it("extrae el valor USD del widget real de la portada del BCV", () => {
    expect(parseBcvRate(FRAGMENTO_WIDGET_BCV, "USD")).toBeCloseTo(667.05, 6);
  });

  it("extrae el valor EUR del widget real de la portada del BCV", () => {
    expect(parseBcvRate(FRAGMENTO_WIDGET_BCV, "EUR")).toBeCloseTo(763.1919165, 6);
  });

  it("lanza error claro si la tarjeta de la moneda no aparece en la página", () => {
    expect(() => parseBcvRate("<html>sin tarjetas</html>", "USD")).toThrow(/USD/);
  });

  it("lanza error si el valor extraído es cero o negativo", () => {
    const html = `<span> USD</span><strong>0,00</strong>`;
    expect(() => parseBcvRate(html, "USD")).toThrow(/fuera de rango/);
  });
});

describe("fetchConRespaldo", () => {
  it("usa la fuente primaria (BCV directo) cuando funciona, sin llamar al respaldo", async () => {
    const primaria = vi.fn().mockResolvedValue(667.05);
    const respaldo = vi.fn().mockResolvedValue(652.97);
    const valor = await fetchConRespaldo(primaria, respaldo);
    expect(valor).toBe(667.05);
    expect(respaldo).not.toHaveBeenCalled();
  });

  it("cae al respaldo (DolarAPI) si la fuente primaria falla", async () => {
    const primaria = vi.fn().mockRejectedValue(new Error("bcv.org.ve caído"));
    const respaldo = vi.fn().mockResolvedValue(652.97);
    const valor = await fetchConRespaldo(primaria, respaldo);
    expect(valor).toBe(652.97);
    expect(respaldo).toHaveBeenCalledTimes(1);
  });
});
