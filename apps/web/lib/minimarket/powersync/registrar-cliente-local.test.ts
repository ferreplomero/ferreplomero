import { describe, expect, it, vi } from "vitest";
import type { AbstractPowerSyncDatabase } from "@powersync/web";
import {
  actualizarClienteLocal,
  crearClienteLocal,
  registrarAbonoLocal,
  type AbonoLocalInput,
  type ClienteLocalInput,
} from "./registrar-cliente-local";

interface Ejecutada {
  sql: string;
  params: unknown[];
}

function mockDb(
  fiadosAbiertos: { id: string; monto_usd: number }[] = [],
  sesionCajaAbierta: { id: string } | null = null,
) {
  const ejecutadas: Ejecutada[] = [];
  const abonosPorFiado = new Map<string, { monto_usd: number }[]>();
  const tx = {
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      ejecutadas.push({ sql, params });
      return { rowsAffected: 1 };
    }),
    getAll: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("mm_fiados")) return fiadosAbiertos;
      if (sql.includes("mm_abonos_fiado")) return abonosPorFiado.get(String(params[0])) ?? [];
      return [];
    }),
    getOptional: vi.fn(async (sql: string) => {
      if (sql.includes("mm_caja_sesiones")) return sesionCajaAbierta;
      return null;
    }),
  };
  const db = {
    writeTransaction: vi.fn(async (cb: (context: typeof tx) => Promise<void>) => cb(tx)),
  } as unknown as AbstractPowerSyncDatabase;
  return { db, ejecutadas, abonosPorFiado };
}

function tabla(ejecutadas: Ejecutada[], nombre: string): Ejecutada[] {
  const re = new RegExp(`insert into ${nombre}\\s`);
  return ejecutadas.filter((e) => re.test(e.sql.toLowerCase()));
}

function clienteInput(overrides: Partial<ClienteLocalInput> = {}): ClienteLocalInput {
  return {
    tenantId: "t1",
    nombre: "María Pérez",
    cedula: "V12345678",
    telefono: null,
    whatsapp: null,
    direccion: null,
    limiteFiadoUsd: 50,
    notas: null,
    activo: true,
    ...overrides,
  };
}

describe("crearClienteLocal / actualizarClienteLocal", () => {
  it("inserta el cliente", async () => {
    const { db, ejecutadas } = mockDb();
    await crearClienteLocal(db, clienteInput());
    expect(tabla(ejecutadas, "mm_clientes")).toHaveLength(1);
  });

  it("actualiza por id y tenant", async () => {
    const { db, ejecutadas } = mockDb();
    await actualizarClienteLocal(db, "c1", clienteInput({ limiteFiadoUsd: 100 }));
    const updates = ejecutadas.filter((e) => e.sql.toLowerCase().includes("update mm_clientes"));
    expect(updates).toHaveLength(1);
    expect(updates[0]?.params).toContain(100);
  });
});

function abonoInput(overrides: Partial<AbonoLocalInput> = {}): AbonoLocalInput {
  return {
    tenantId: "t1",
    usuarioId: "u1",
    clienteId: "c1",
    clienteNombre: "María Pérez",
    montoUsd: 20,
    metodo: "efectivo_bs",
    igtfUsd: 0,
    tasa: 50,
    ...overrides,
  };
}

describe("registrarAbonoLocal", () => {
  it("distribuye el abono en un solo fiado si alcanza", async () => {
    const { db, ejecutadas } = mockDb([{ id: "f1", monto_usd: 30 }]);
    const { abonoIds } = await registrarAbonoLocal(db, abonoInput({ montoUsd: 20 }));
    expect(abonoIds).toHaveLength(1);
    const abonos = tabla(ejecutadas, "mm_abonos_fiado");
    expect(abonos).toHaveLength(1);
    expect(abonos[0]?.params[4]).toBe(20); // monto_usd de la porción
    // no se marca pagado (20 < 30)
    expect(ejecutadas.some((e) => e.sql.toLowerCase().includes("estado = 'pagado'"))).toBe(false);
  });

  it("marca el fiado como pagado cuando el abono lo cubre exactamente", async () => {
    const { db, ejecutadas } = mockDb([{ id: "f1", monto_usd: 20 }]);
    await registrarAbonoLocal(db, abonoInput({ montoUsd: 20 }));
    expect(ejecutadas.some((e) => e.sql.toLowerCase().includes("estado = 'pagado'"))).toBe(true);
  });

  it("distribuye FIFO entre dos fiados abiertos", async () => {
    const { db, ejecutadas } = mockDb([
      { id: "f1", monto_usd: 10 },
      { id: "f2", monto_usd: 30 },
    ]);
    const { abonoIds } = await registrarAbonoLocal(db, abonoInput({ montoUsd: 25 }));
    expect(abonoIds).toHaveLength(2);
    const abonos = tabla(ejecutadas, "mm_abonos_fiado");
    expect(abonos[0]?.params[2]).toBe("f1");
    expect(abonos[0]?.params[4]).toBe(10); // cubre f1 completo
    expect(abonos[1]?.params[2]).toBe("f2");
    expect(abonos[1]?.params[4]).toBe(15); // resto va a f2
  });

  it("prorratea el IGTF proporcionalmente entre fiados", async () => {
    const { db, ejecutadas } = mockDb([
      { id: "f1", monto_usd: 10 },
      { id: "f2", monto_usd: 30 },
    ]);
    await registrarAbonoLocal(db, abonoInput({ montoUsd: 20, igtfUsd: 0.6 }));
    const abonos = tabla(ejecutadas, "mm_abonos_fiado");
    // f1: 10/20 * 0.6 = 0.3, f2: 10/20 * 0.6 = 0.3
    expect(abonos[0]?.params[6]).toBeCloseTo(0.3, 2);
    expect(abonos[1]?.params[6]).toBeCloseTo(0.3, 2);
  });

  it("registra un ingreso de caja (una sola vez) si el abono es en efectivo y hay caja abierta", async () => {
    const { db, ejecutadas } = mockDb(
      [
        { id: "f1", monto_usd: 10 },
        { id: "f2", monto_usd: 30 },
      ],
      {
        id: "sesion1",
      },
    );
    await registrarAbonoLocal(db, abonoInput({ montoUsd: 25, metodo: "efectivo_bs", tasa: 50 }));
    const movimientos = tabla(ejecutadas, "mm_caja_movimientos");
    expect(movimientos).toHaveLength(1);
    // efectivo_bs: se registra en Bs (25 * tasa 50 = 1250).
    expect(movimientos[0]?.params).toEqual(
      expect.arrayContaining(["ingreso", 1250, "VES", "Abono — María Pérez", "sesion1"]),
    );
  });

  it("suma el IGTF al ingreso de caja en efectivo_usd (lo que realmente entrega el cliente)", async () => {
    const { db, ejecutadas } = mockDb([{ id: "f1", monto_usd: 30 }], { id: "sesion1" });
    await registrarAbonoLocal(
      db,
      abonoInput({ montoUsd: 20, metodo: "efectivo_usd", igtfUsd: 0.6 }),
    );
    const movimientos = tabla(ejecutadas, "mm_caja_movimientos");
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]?.params).toContain(20.6);
    expect(movimientos[0]?.params).toContain("USD");
  });

  it("no registra ingreso de caja si no hay sesión abierta", async () => {
    const { db, ejecutadas } = mockDb([{ id: "f1", monto_usd: 30 }], null);
    await registrarAbonoLocal(db, abonoInput({ montoUsd: 20 }));
    expect(tabla(ejecutadas, "mm_caja_movimientos")).toHaveLength(0);
  });

  it("no registra ingreso de caja para métodos con cuenta bancaria (pago móvil/zelle/tarjeta)", async () => {
    const { db, ejecutadas } = mockDb([{ id: "f1", monto_usd: 30 }], { id: "sesion1" });
    await registrarAbonoLocal(db, abonoInput({ montoUsd: 20, metodo: "pago_movil" }));
    expect(tabla(ejecutadas, "mm_caja_movimientos")).toHaveLength(0);
  });
});
