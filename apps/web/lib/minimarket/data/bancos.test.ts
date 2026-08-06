import { describe, expect, it } from "vitest";
import { listCuentasConSaldo, saldoNativo, type CuentaConSaldo } from "./bancos";
import type { MmMetodoPago } from "@arkiteq/db";

function cuenta(overrides: Partial<CuentaConSaldo> = {}): CuentaConSaldo {
  return {
    id: "c1",
    tenant_id: "t1",
    metodo: "pago_movil" as MmMetodoPago,
    banco: "Banco de Venezuela",
    titular: "María Pérez",
    rif: null,
    telefono: null,
    cuenta: null,
    correo: null,
    predeterminada: true,
    activa: true,
    created_at: "",
    updated_at: "",
    deleted_at: null,
    saldo_usd: 0,
    saldo_bs: 0,
    ...overrides,
  };
}

describe("saldoNativo", () => {
  it("una cuenta de pago móvil muestra su saldo en Bs (saldo_bs), no el equivalente en USD", () => {
    // Bs 100.000 ingresados hoy a tasa 40 -> saldo_usd (referencia) = 2500,
    // pero el saldo que debe mostrarse es SIEMPRE saldo_bs, exacto.
    const c = cuenta({ metodo: "pago_movil", saldo_bs: 100_000, saldo_usd: 2500 });
    expect(saldoNativo(c)).toEqual({ monto: 100_000, moneda: "VES" });
  });

  it("no cambia si saldo_usd (la referencia) cambia por una tasa distinta", () => {
    // Mismo saldo_bs real, pero saldo_usd recalculado a otra tasa (ej. el
    // dólar subió) -- el saldo nativo en Bs debe seguir exactamente igual.
    const antes = cuenta({ metodo: "pago_movil", saldo_bs: 100_000, saldo_usd: 2500 });
    const despues = cuenta({ metodo: "pago_movil", saldo_bs: 100_000, saldo_usd: 1666.67 });
    expect(saldoNativo(antes).monto).toBe(saldoNativo(despues).monto);
    expect(saldoNativo(antes)).toEqual({ monto: 100_000, moneda: "VES" });
  });

  it("transferencia, tarjeta y cashea también son nativas en Bs", () => {
    for (const metodo of ["transferencia", "tarjeta", "cashea"] as const) {
      const c = cuenta({ metodo, saldo_bs: 5000, saldo_usd: 123 });
      expect(saldoNativo(c)).toEqual({ monto: 5000, moneda: "VES" });
    }
  });

  it("una cuenta Zelle muestra su saldo en USD (saldo_usd), no el equivalente en Bs", () => {
    const c = cuenta({ metodo: "zelle", saldo_usd: 500, saldo_bs: 20_000 });
    expect(saldoNativo(c)).toEqual({ monto: 500, moneda: "USD" });
  });
});

/** Query builder falso: cualquier método encadenado (`select`, `eq`, `is`,
 * `order`...) devuelve el mismo objeto, y al await-earlo resuelve `result` —
 * mismo patrón que ya usa `exchange-rate.test.ts` para mockear Supabase. */
function chainable<T>(result: { data: T | null; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    order: () => builder,
    then: (resolve: (r: typeof result) => void) => resolve(result),
  };
  return builder;
}

interface CuentaRow {
  id: string;
  tenant_id: string;
  metodo: MmMetodoPago;
  banco: string;
  titular: string;
  rif: null;
  telefono: null;
  cuenta: null;
  correo: null;
  predeterminada: boolean;
  activa: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: null;
}

function filaCuenta(id: string, metodo: MmMetodoPago, banco: string): CuentaRow {
  return {
    id,
    tenant_id: "t1",
    metodo,
    banco,
    titular: "Titular",
    rif: null,
    telefono: null,
    cuenta: null,
    correo: null,
    predeterminada: true,
    activa: true,
    created_at: "",
    updated_at: "",
    deleted_at: null,
  };
}

interface MovimientoRow {
  cuenta_id: string;
  tipo: "venta" | "ingreso" | "egreso" | "retiro";
  monto_usd: number;
  monto_bs: number;
}

function mockSupabase(cuentas: CuentaRow[], movimientos: MovimientoRow[]) {
  return {
    from: (tabla: string) => {
      if (tabla === "mm_cuentas_bancarias") return chainable({ data: cuentas, error: null });
      if (tabla === "mm_cuenta_movimientos") return chainable({ data: movimientos, error: null });
      throw new Error(`tabla inesperada en el mock: ${tabla}`);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("listCuentasConSaldo", () => {
  it("suma los movimientos de mm_cuenta_movimientos directo (caso real: banesco con 2 ventas)", async () => {
    // Caso reportado: cuenta Tarjeta/Punto "banesco" con dos ingresos por
    // venta que SÍ aparecen en el historial, pero el saldo daba Bs 0,00
    // porque dependía de una vista SQL cuya migración no se había aplicado.
    const supabase = mockSupabase(
      [filaCuenta("c1", "tarjeta", "banesco")],
      [
        { cuenta_id: "c1", tipo: "venta", monto_usd: 30, monto_bs: 22266.9 },
        { cuenta_id: "c1", tipo: "venta", monto_usd: 12, monto_bs: 8906.76 },
      ],
    );

    const [cuenta] = await listCuentasConSaldo(supabase, "t1");
    expect(cuenta?.saldo_bs).toBe(31173.66);
  });

  it("resta los egresos/retiros del saldo", async () => {
    const supabase = mockSupabase(
      [filaCuenta("c1", "pago_movil", "Banesco")],
      [
        { cuenta_id: "c1", tipo: "ingreso", monto_usd: 100, monto_bs: 4000 },
        { cuenta_id: "c1", tipo: "egreso", monto_usd: 25, monto_bs: 1000 },
      ],
    );

    const [cuenta] = await listCuentasConSaldo(supabase, "t1");
    expect(cuenta?.saldo_bs).toBe(3000);
  });

  it("una cuenta sin movimientos queda en 0, no en error", async () => {
    const supabase = mockSupabase([filaCuenta("c1", "zelle", "correo@ejemplo.com")], []);
    const [cuenta] = await listCuentasConSaldo(supabase, "t1");
    expect(cuenta?.saldo_usd).toBe(0);
    expect(cuenta?.saldo_bs).toBe(0);
  });

  it("separa correctamente los movimientos de varias cuentas distintas", async () => {
    const supabase = mockSupabase(
      [filaCuenta("c1", "tarjeta", "banesco"), filaCuenta("c2", "pago_movil", "Mercantil")],
      [
        { cuenta_id: "c1", tipo: "venta", monto_usd: 30, monto_bs: 22266.9 },
        { cuenta_id: "c2", tipo: "ingreso", monto_usd: 10, monto_bs: 7422.3 },
      ],
    );

    const [c1, c2] = await listCuentasConSaldo(supabase, "t1");
    expect(c1?.saldo_bs).toBe(22266.9);
    expect(c2?.saldo_bs).toBe(7422.3);
  });

  it("lanza un error explícito si la consulta de movimientos falla (nunca 'saldo 0' silencioso)", async () => {
    const supabase = {
      from: (tabla: string) => {
        if (tabla === "mm_cuentas_bancarias")
          return chainable({ data: [filaCuenta("c1", "tarjeta", "banesco")], error: null });
        if (tabla === "mm_cuenta_movimientos")
          return chainable({ data: null, error: { message: "column saldo_bs does not exist" } });
        throw new Error(`tabla inesperada: ${tabla}`);
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await expect(listCuentasConSaldo(supabase, "t1")).rejects.toThrow(/movimientos/i);
  });
});
