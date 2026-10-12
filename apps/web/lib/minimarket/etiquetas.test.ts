import { describe, expect, it } from "vitest";
import {
  escalaNombreEtiqueta,
  fmtBsEtiqueta,
  fmtUsdEtiqueta,
  leyendaIvaEtiqueta,
  precioEtiqueta,
  TAMANOS_ETIQUETA,
} from "./etiquetas";

describe("precioEtiqueta", () => {
  it("producto gravado con IVA suma el % del negocio", () => {
    expect(
      precioEtiqueta({ precioUsd: 15, impuestoId: "iva", ivaPct: 16, conIva: true, tasa: 876.8 }),
    ).toEqual({ usd: 17.4, bs: 15256.32, exento: false });
  });

  it("sin IVA deja el precio guardado", () => {
    expect(
      precioEtiqueta({ precioUsd: 15, impuestoId: "iva", ivaPct: 16, conIva: false, tasa: 876.8 }),
    ).toEqual({ usd: 15, bs: 13152, exento: false });
  });

  it("un producto exento no suma IVA aunque se pida con IVA", () => {
    expect(
      precioEtiqueta({
        precioUsd: 25,
        impuestoId: "exento",
        ivaPct: 16,
        conIva: true,
        tasa: 876.8,
      }),
    ).toEqual({ usd: 25, bs: 21920, exento: true });
  });

  it("sin tasa no hay precio en Bs", () => {
    expect(
      precioEtiqueta({ precioUsd: 10, impuestoId: "iva", ivaPct: 16, conIva: true, tasa: null }).bs,
    ).toBeNull();
  });

  it("redondea a 2 decimales", () => {
    expect(
      precioEtiqueta({ precioUsd: 0.99, impuestoId: "iva", ivaPct: 16, conIva: true, tasa: 1 }).usd,
    ).toBe(1.15);
  });
});

describe("formato y leyendas", () => {
  it("usa coma decimal y punto de miles", () => {
    expect(fmtUsdEtiqueta(17.4)).toBe("USD 17,40");
    expect(fmtBsEtiqueta(15256.32)).toBe("Bs 15.256,32");
  });

  it("leyenda de IVA", () => {
    expect(leyendaIvaEtiqueta(true, false)).toBe("IVA incluido");
    expect(leyendaIvaEtiqueta(false, false)).toBe("Precio sin IVA");
    expect(leyendaIvaEtiqueta(true, true)).toBe("Exento de IVA");
  });

  it("los tamaños son los acordados en mm", () => {
    expect([TAMANOS_ETIQUETA.pequena.anchoMm, TAMANOS_ETIQUETA.pequena.altoMm]).toEqual([50, 25]);
    expect([TAMANOS_ETIQUETA.mediana.anchoMm, TAMANOS_ETIQUETA.mediana.altoMm]).toEqual([70, 40]);
    expect([TAMANOS_ETIQUETA.grande.anchoMm, TAMANOS_ETIQUETA.grande.altoMm]).toEqual([100, 60]);
  });

  it("achica la letra de nombres largos en vez de cortarlos", () => {
    expect(escalaNombreEtiqueta("Tubo PVC 1/2", "pequena")).toBe(1);
    const largo = "Llave de paso esférica de bronce con palanca roja 3/4 pulgada";
    expect(escalaNombreEtiqueta(largo, "pequena")).toBeLessThan(1);
    expect(escalaNombreEtiqueta(largo, "pequena")).toBeGreaterThanOrEqual(0.6);
  });
});
