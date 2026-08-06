import { describe, expect, it } from "vitest";
import {
  esMetodoConCuenta,
  esMetodoVueltoDigital,
  METODO_CUENTA_LABEL,
  METODOS_CON_CUENTA,
  METODOS_VUELTO_DIGITAL,
  monedaNativaCuenta,
} from "./bancos";

describe("esMetodoConCuenta", () => {
  it("incluye pago_movil, transferencia, tarjeta, zelle y cashea", () => {
    expect(esMetodoConCuenta("pago_movil")).toBe(true);
    expect(esMetodoConCuenta("transferencia")).toBe(true);
    expect(esMetodoConCuenta("tarjeta")).toBe(true);
    expect(esMetodoConCuenta("zelle")).toBe(true);
    expect(esMetodoConCuenta("cashea")).toBe(true);
  });

  it("excluye efectivo y fiado", () => {
    expect(esMetodoConCuenta("efectivo_bs")).toBe(false);
    expect(esMetodoConCuenta("efectivo_usd")).toBe(false);
    expect(esMetodoConCuenta("fiado")).toBe(false);
  });
});

describe("monedaNativaCuenta", () => {
  it("zelle es USD — el resto (incluido cashea) es VES, siempre fijo", () => {
    expect(monedaNativaCuenta("zelle")).toBe("USD");
    expect(monedaNativaCuenta("pago_movil")).toBe("VES");
    expect(monedaNativaCuenta("transferencia")).toBe("VES");
    expect(monedaNativaCuenta("tarjeta")).toBe("VES");
    expect(monedaNativaCuenta("cashea")).toBe("VES");
  });
});

describe("esMetodoVueltoDigital", () => {
  it("incluye pago_movil, transferencia y zelle", () => {
    expect(esMetodoVueltoDigital("pago_movil")).toBe(true);
    expect(esMetodoVueltoDigital("transferencia")).toBe(true);
    expect(esMetodoVueltoDigital("zelle")).toBe(true);
  });

  it("excluye tarjeta (requeriría reversa en el datáfono) y cashea (no tiene sentido de negocio)", () => {
    expect(esMetodoVueltoDigital("tarjeta")).toBe(false);
    expect(esMetodoVueltoDigital("cashea")).toBe(false);
  });
});

describe("METODO_CUENTA_LABEL", () => {
  it("tiene una etiqueta para cada método con cuenta, incluido zelle", () => {
    for (const metodo of METODOS_CON_CUENTA) {
      expect(METODO_CUENTA_LABEL[metodo]).toBeTruthy();
    }
    expect(METODO_CUENTA_LABEL.zelle).toBe("Zelle");
  });
});

describe("METODOS_VUELTO_DIGITAL", () => {
  it("es un subconjunto de METODOS_CON_CUENTA", () => {
    for (const metodo of METODOS_VUELTO_DIGITAL) {
      expect((METODOS_CON_CUENTA as readonly string[]).includes(metodo)).toBe(true);
    }
  });
});
