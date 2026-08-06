import { describe, expect, it, vi } from "vitest";
import type { AbstractPowerSyncDatabase } from "@powersync/web";
import {
  abrirCajaLocal,
  cerrarCajaLocal,
  definirTasaManualLocal,
  marcarFuentePreferidaLocal,
  registrarMovimientoCajaLocal,
} from "./registrar-caja-local";

interface Ejecutada {
  sql: string;
  params: unknown[];
}

function mockDb(
  options: {
    sesionAbierta?: { id: string } | null;
    sucursal?: { id: string } | null;
    sesionParaCierre?: { monto_inicial_usd: number; monto_inicial_bs: number } | null;
    movimientos?: { tipo: string; monto: number; moneda: string }[];
    configExistente?: { id: string } | null;
  } = {},
) {
  const ejecutadas: Ejecutada[] = [];
  const tx = {
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      ejecutadas.push({ sql, params });
      return { rowsAffected: 1 };
    }),
    getOptional: vi.fn(async (sql: string) => {
      if (
        sql.includes("mm_caja_sesiones") &&
        sql.includes("estado = 'abierta'") &&
        sql.includes("select id")
      ) {
        return options.sesionAbierta ?? null;
      }
      if (sql.includes("mm_sucursales")) {
        return "sucursal" in options ? options.sucursal : { id: "s1" };
      }
      if (sql.includes("monto_inicial_usd")) return options.sesionParaCierre ?? null;
      if (sql.includes("mm_config_negocio")) {
        return "configExistente" in options ? options.configExistente : { id: "cfg-1" };
      }
      return null;
    }),
    getAll: vi.fn(async () => options.movimientos ?? []),
  };
  const db = {
    writeTransaction: vi.fn(async (cb: (context: typeof tx) => Promise<void>) => cb(tx)),
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      ejecutadas.push({ sql, params });
      return { rowsAffected: 1 };
    }),
  } as unknown as AbstractPowerSyncDatabase;
  return { db, ejecutadas };
}

describe("abrirCajaLocal", () => {
  it("crea la sesión cuando no hay una caja abierta", async () => {
    const { db, ejecutadas } = mockDb({ sesionAbierta: null, sucursal: { id: "s1" } });
    const { sesionId } = await abrirCajaLocal(db, {
      tenantId: "t1",
      usuarioId: "u1",
      montoInicialUsd: 20,
      montoInicialBs: 1000,
    });
    const inserts = ejecutadas.filter((e) =>
      e.sql.toLowerCase().includes("insert into mm_caja_sesiones"),
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.params[0]).toBe(sesionId);
  });

  it("rechaza si ya hay una caja abierta", async () => {
    const { db } = mockDb({ sesionAbierta: { id: "existing" } });
    await expect(
      abrirCajaLocal(db, {
        tenantId: "t1",
        usuarioId: "u1",
        montoInicialUsd: 0,
        montoInicialBs: 0,
      }),
    ).rejects.toThrow(/ya hay una caja abierta/i);
  });

  it("rechaza si no hay sucursal configurada", async () => {
    const { db } = mockDb({ sesionAbierta: null, sucursal: null });
    await expect(
      abrirCajaLocal(db, {
        tenantId: "t1",
        usuarioId: "u1",
        montoInicialUsd: 0,
        montoInicialBs: 0,
      }),
    ).rejects.toThrow(/sucursal/i);
  });
});

describe("registrarMovimientoCajaLocal", () => {
  it("inserta el movimiento", async () => {
    const { db, ejecutadas } = mockDb();
    await registrarMovimientoCajaLocal(db, {
      tenantId: "t1",
      usuarioId: "u1",
      sesionId: "s1",
      tipo: "egreso",
      monto: 5,
      moneda: "USD",
    });
    expect(ejecutadas).toHaveLength(1);
    expect(ejecutadas[0]?.params).toContain("egreso");
  });
});

describe("cerrarCajaLocal", () => {
  it("calcula la diferencia a partir del inicial + movimientos", async () => {
    const { db, ejecutadas } = mockDb({
      sesionParaCierre: { monto_inicial_usd: 20, monto_inicial_bs: 1000 },
      movimientos: [
        { tipo: "venta", monto: 10, moneda: "USD" },
        { tipo: "egreso", monto: 5, moneda: "USD" },
      ],
    });
    // esperado USD = 20 + 10 - 5 = 25
    const { diferenciaUsd } = await cerrarCajaLocal(db, {
      tenantId: "t1",
      sesionId: "s1",
      montoFinalUsd: 25,
      montoFinalBs: 1000,
    });
    expect(diferenciaUsd).toBe(0);
    const updates = ejecutadas.filter((e) =>
      e.sql.toLowerCase().includes("update mm_caja_sesiones"),
    );
    expect(updates).toHaveLength(1);
  });

  it("reporta una diferencia cuando el contado no cuadra", async () => {
    const { db } = mockDb({
      sesionParaCierre: { monto_inicial_usd: 20, monto_inicial_bs: 1000 },
      movimientos: [],
    });
    const { diferenciaUsd } = await cerrarCajaLocal(db, {
      tenantId: "t1",
      sesionId: "s1",
      montoFinalUsd: 18,
      montoFinalBs: 1000,
    });
    expect(diferenciaUsd).toBe(-2);
  });

  it("rechaza si la sesión ya no está abierta", async () => {
    const { db } = mockDb({ sesionParaCierre: null });
    await expect(
      cerrarCajaLocal(db, { tenantId: "t1", sesionId: "s1", montoFinalUsd: 0, montoFinalBs: 0 }),
    ).rejects.toThrow(/ya no está abierta/i);
  });
});

describe("definirTasaManualLocal", () => {
  it("inserta la tasa con fuente 'manual' y el tipo dado", async () => {
    const { db, ejecutadas } = mockDb();
    await definirTasaManualLocal(db, {
      tenantId: "t1",
      usuarioId: "u1",
      tipo: "manual",
      valor: 55.5,
    });
    const tasa = ejecutadas.find((e) => e.sql.includes("insert into mm_tasas_cambio"));
    expect(tasa?.params).toContain("manual");
    expect(tasa?.params).toContain(55.5);
  });

  it("permite sobreescribir a mano el valor de BCV (fuente manual, tipo bcv)", async () => {
    const { db, ejecutadas } = mockDb();
    await definirTasaManualLocal(db, { tenantId: "t1", usuarioId: "u1", tipo: "bcv", valor: 60.1 });
    const tasa = ejecutadas.find((e) => e.sql.includes("insert into mm_tasas_cambio"));
    expect(tasa?.params).toEqual(
      expect.arrayContaining([expect.any(String), "t1", expect.any(String), 60.1, "manual", "bcv"]),
    );
  });

  it("NO toca mm_config_negocio — guardar un valor no lo hace preferido", async () => {
    const { db, ejecutadas } = mockDb({ configExistente: { id: "cfg-1" } });
    await definirTasaManualLocal(db, { tenantId: "t1", usuarioId: "u1", tipo: "euro", valor: 65 });
    expect(ejecutadas.some((e) => e.sql.toLowerCase().includes("mm_config_negocio"))).toBe(false);
  });
});

describe("marcarFuentePreferidaLocal", () => {
  it("marca el tipo dado como la tasa preferida (update) si ya existe la config", async () => {
    const { db, ejecutadas } = mockDb({ configExistente: { id: "cfg-1" } });
    await marcarFuentePreferidaLocal(db, "t1", "euro");
    const update = ejecutadas.find((e) => e.sql.includes("update mm_config_negocio"));
    expect(update?.params).toContain("euro");
    expect(update?.params).toContain("cfg-1");
  });

  it("crea la config con el tipo dado como fuente_tasa si el tenant no tenía ninguna", async () => {
    const { db, ejecutadas } = mockDb({ configExistente: null });
    await marcarFuentePreferidaLocal(db, "t1", "manual");
    const insert = ejecutadas.find((e) => e.sql.includes("insert into mm_config_negocio"));
    expect(insert?.params).toContain("t1");
    expect(insert?.params).toContain("manual");
  });
});
