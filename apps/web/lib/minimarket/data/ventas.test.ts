import { describe, expect, it } from "vitest";
import { anularVentaConDevolucion, calcularPagosReales } from "./ventas";
import type { MmMetodoPago } from "@arkiteq/db";

describe("calcularPagosReales", () => {
  it("suma los pagos reales en USD, convirtiendo los de Bs con la tasa de la venta", () => {
    // $30 efectivo USD + Bs 743,10 pago móvil a tasa 40 (=$18.5775) = $48.58 (redondeado)
    const { montoRealPagadoUsd } = calcularPagosReales(
      [
        { metodo: "efectivo_usd", monto: 30, moneda: "USD", cuenta_bancaria_id: null },
        { metodo: "pago_movil", monto: 743.1, moneda: "VES", cuenta_bancaria_id: "cuenta1" },
      ],
      40,
    );
    expect(montoRealPagadoUsd).toBeCloseTo(48.58, 2);
  });

  it("excluye 'fiado' y 'credito_cliente' — no son dinero real que devolver", () => {
    const { pagosReales, montoRealPagadoUsd } = calcularPagosReales(
      [
        { metodo: "efectivo_bs", monto: 400, moneda: "VES", cuenta_bancaria_id: null },
        { metodo: "fiado", monto: 50, moneda: "USD", cuenta_bancaria_id: null },
        { metodo: "credito_cliente", monto: 10, moneda: "USD", cuenta_bancaria_id: null },
      ],
      40,
    );
    expect(pagosReales).toHaveLength(1);
    expect(pagosReales[0]?.metodo).toBe("efectivo_bs");
    expect(montoRealPagadoUsd).toBe(10); // 400 / 40
  });

  it("una venta 100% fiada no tiene ningún pago real (monto 0, no error)", () => {
    const { pagosReales, montoRealPagadoUsd } = calcularPagosReales(
      [{ metodo: "fiado", monto: 80, moneda: "USD", cuenta_bancaria_id: null }],
      40,
    );
    expect(pagosReales).toHaveLength(0);
    expect(montoRealPagadoUsd).toBe(0);
  });

  it("conserva la cuenta bancaria de cada pago real", () => {
    const { pagosReales } = calcularPagosReales(
      [{ metodo: "zelle", monto: 20, moneda: "USD", cuenta_bancaria_id: "cta-zelle" }],
      40,
    );
    expect(pagosReales[0]?.cuentaBancariaId).toBe("cta-zelle");
  });
});

/** Query builder falso — mismo patrón que `data/bancos.test.ts`. */
function chainable<T>(result: { data: T | null; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (r: typeof result) => void) => resolve(result),
  };
  return builder;
}

/** Cliente falso que solo sabe responder mm_caja_sesiones / mm_cuentas_bancarias
 * — si `anularVentaConDevolucion` llega a consultar cualquier otra tabla, es
 * porque no se detuvo en la validación (falla el test con un error claro). */
function mockClienteValidacion(opts: {
  sesionAbierta?: { id: string } | null;
  cuenta?: { id: string; metodo: string } | null;
}) {
  return {
    from: (tabla: string) => {
      if (tabla === "mm_caja_sesiones") {
        return chainable({ data: opts.sesionAbierta ?? null, error: null });
      }
      if (tabla === "mm_cuentas_bancarias") {
        return chainable({ data: opts.cuenta ?? null, error: null });
      }
      throw new Error(
        `No se esperaba consultar "${tabla}" — la validación debió detenerse antes de tocar la venta.`,
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("anularVentaConDevolucion — valida el destino ANTES de anular nada", () => {
  it("rechaza un monto <= 0 sin consultar la base (ni caja ni cuenta)", async () => {
    const client = mockClienteValidacion({});
    const result = await anularVentaConDevolucion(client, "t1", "v1", "u1", {
      metodo: "efectivo_bs" as MmMetodoPago,
      monto: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/mayor a cero/i);
  });

  it("bloquea una devolución en efectivo si no hay caja abierta", async () => {
    const client = mockClienteValidacion({ sesionAbierta: null });
    const result = await anularVentaConDevolucion(client, "t1", "v1", "u1", {
      metodo: "efectivo_usd" as MmMetodoPago,
      monto: 30,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/caja abierta/i);
  });

  it("exige elegir una cuenta cuando el método tiene cuenta bancaria", async () => {
    const client = mockClienteValidacion({});
    const result = await anularVentaConDevolucion(client, "t1", "v1", "u1", {
      metodo: "pago_movil" as MmMetodoPago,
      monto: 100,
      cuentaBancariaId: null,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/selecciona la cuenta/i);
  });

  it("rechaza una cuenta que no existe o no pertenece al tenant", async () => {
    const client = mockClienteValidacion({ cuenta: null });
    const result = await anularVentaConDevolucion(client, "t1", "v1", "u1", {
      metodo: "pago_movil" as MmMetodoPago,
      monto: 100,
      cuentaBancariaId: "c1",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no es válida/i);
  });

  it("rechaza una cuenta cuyo método no coincide con el elegido para la devolución", async () => {
    const client = mockClienteValidacion({ cuenta: { id: "c1", metodo: "zelle" } });
    const result = await anularVentaConDevolucion(client, "t1", "v1", "u1", {
      metodo: "pago_movil" as MmMetodoPago,
      monto: 100,
      cuentaBancariaId: "c1",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no es válida/i);
  });
});
