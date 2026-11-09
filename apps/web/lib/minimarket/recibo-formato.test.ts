import { describe, expect, it } from "vitest";
import {
  bs,
  FORMATO_TICKET_DEFAULT,
  monedaDeMetodo,
  monedaPorMetodos,
  totalesDocumento,
  usd,
  metodoLabel,
  monedaDelRecibo,
  montoDocumento,
  parseFormatoTicket,
} from "./recibo-formato";

describe("parseFormatoTicket", () => {
  it("devuelve el formato por defecto con parámetros vacíos o corruptos", () => {
    expect(parseFormatoTicket({})).toEqual(FORMATO_TICKET_DEFAULT);
    expect(parseFormatoTicket(null)).toEqual(FORMATO_TICKET_DEFAULT);
    expect(parseFormatoTicket("x")).toEqual(FORMATO_TICKET_DEFAULT);
    expect(parseFormatoTicket({ formato_ticket: [1, 2] })).toEqual(FORMATO_TICKET_DEFAULT);
    expect(FORMATO_TICKET_DEFAULT.anchoMm).toBe(58);
  });

  it("cae al valor por defecto campo por campo si está fuera de rango o mal tipado", () => {
    expect(
      parseFormatoTicket({
        formato_ticket: { anchoMm: 200, fuentePct: 20, mostrarLogo: "si", mostrarDatosNegocio: 0 },
      }),
    ).toEqual(FORMATO_TICKET_DEFAULT);
    expect(parseFormatoTicket({ formato_ticket: { anchoMm: 39.9 } }).anchoMm).toBe(58);
    expect(parseFormatoTicket({ formato_ticket: { fuentePct: 151 } }).fuentePct).toBe(100);
  });

  it("respeta valores válidos (incluidos los extremos del rango)", () => {
    expect(
      parseFormatoTicket({
        otra_clave: true,
        formato_ticket: {
          anchoMm: 80,
          fuentePct: 115,
          mostrarLogo: false,
          mostrarDatosNegocio: false,
        },
      }),
    ).toEqual({ anchoMm: 80, fuentePct: 115, mostrarLogo: false, mostrarDatosNegocio: false });
    expect(parseFormatoTicket({ formato_ticket: { anchoMm: 40, fuentePct: 150 } })).toMatchObject({
      anchoMm: 40,
      fuentePct: 150,
    });
    expect(parseFormatoTicket({ formato_ticket: { anchoMm: "120" } }).anchoMm).toBe(120);
  });
});

describe("monedaDelRecibo", () => {
  it("solo Bs cuando todos los pagos reales fueron en Bs", () => {
    expect(
      monedaDelRecibo([
        { metodo: "pago_movil", moneda: "VES" },
        { metodo: "efectivo_bs", moneda: "VES" },
      ]),
    ).toBe("VES");
  });
  it("solo USD cuando todos fueron en USD", () => {
    expect(
      monedaDelRecibo([
        { metodo: "zelle", moneda: "USD" },
        { metodo: "efectivo_usd", moneda: "USD" },
      ]),
    ).toBe("USD");
  });
  it("mixto cuando se combinan monedas", () => {
    expect(
      monedaDelRecibo([
        { metodo: "zelle", moneda: "USD" },
        { metodo: "pago_movil", moneda: "VES" },
      ]),
    ).toBe("MIXTO");
  });
  it("fiado y saldo a favor no deciden la moneda", () => {
    expect(
      monedaDelRecibo([
        { metodo: "efectivo_bs", moneda: "VES" },
        { metodo: "fiado", moneda: "USD" },
      ]),
    ).toBe("VES");
    expect(monedaDelRecibo([{ metodo: "fiado", moneda: "USD" }])).toBe("MIXTO");
    expect(monedaDelRecibo([])).toBe("MIXTO");
  });
});

describe("montoDocumento / metodoLabel", () => {
  it("convierte a Bs con la tasa congelada solo en modo Bs", () => {
    expect(montoDocumento(120, 772.54, "VES")).toBe(92704.8);
    expect(montoDocumento(120, 772.54, "USD")).toBe(120);
    expect(montoDocumento(120, 772.54, "MIXTO")).toBe(120);
  });
  it("etiqueta el saldo a favor", () => {
    expect(metodoLabel("credito_cliente")).toBe("Saldo a favor");
  });
});

describe("moneda del documento por métodos (Bs nacional / USD divisas)", () => {
  it("monedaDeMetodo usa el catálogo; saldo a favor y fiado no son moneda", () => {
    expect(monedaDeMetodo("pago_movil")).toBe("VES");
    expect(monedaDeMetodo("cashea")).toBe("VES");
    expect(monedaDeMetodo("zelle")).toBe("USD");
    expect(monedaDeMetodo("fiado")).toBe("credito");
    expect(monedaDeMetodo("credito_cliente")).toBe("credito");
    expect(monedaDeMetodo("desconocido")).toBe("credito");
  });

  it("monedaPorMetodos: nacional → VES, divisas → USD, mezcla → MIXTO", () => {
    expect(monedaPorMetodos(["pago_movil", "transferencia"])).toBe("VES");
    expect(monedaPorMetodos(["efectivo_usd"])).toBe("USD");
    expect(monedaPorMetodos(["zelle", "efectivo_bs"])).toBe("MIXTO");
    expect(monedaPorMetodos(["pago_movil", "credito_cliente"])).toBe("VES");
    expect(monedaPorMetodos(["fiado"])).toBe("MIXTO");
  });

  it("totalesDocumento: en Bs no muestra USD; en USD/mixto el Bs es referencia", () => {
    const ves = totalesDocumento(10, 3650, "VES");
    expect(ves.principal).toBe(bs(3650));
    expect(ves.referencia).toBeNull();
    const u = totalesDocumento(10, 3650, "USD");
    expect(u.principal).toBe(usd(10));
    expect(u.referencia).toBe(bs(3650));
  });
});
