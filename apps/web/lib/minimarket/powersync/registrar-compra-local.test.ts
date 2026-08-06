import { describe, expect, it, vi } from "vitest";
import type { AbstractPowerSyncDatabase } from "@powersync/web";
import {
  actualizarProveedorLocal,
  crearProveedorLocal,
  registrarCompraLocal,
  type CompraLocalInput,
} from "./registrar-compra-local";

interface Ejecutada {
  sql: string;
  params: unknown[];
}

function mockDb(options: { costoPrevio?: { costo_usd: number; precio_usd: number } | null } = {}) {
  const ejecutadas: Ejecutada[] = [];
  const tx = {
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      ejecutadas.push({ sql, params });
      return { rowsAffected: 1 };
    }),
    getOptional: vi.fn(async (sql: string) => {
      if (sql.includes("mm_productos")) return options.costoPrevio ?? null;
      return null;
    }),
  };
  const db = {
    writeTransaction: vi.fn(async (cb: (context: typeof tx) => Promise<void>) => cb(tx)),
  } as unknown as AbstractPowerSyncDatabase;
  return { db, ejecutadas };
}

function tabla(ejecutadas: Ejecutada[], nombre: string): Ejecutada[] {
  const re = new RegExp(`insert into ${nombre}\\s`);
  return ejecutadas.filter((e) => re.test(e.sql.toLowerCase()));
}

function baseInput(overrides: Partial<CompraLocalInput> = {}): CompraLocalInput {
  return {
    tenantId: "t1",
    usuarioId: "u1",
    proveedorId: "p1",
    sucursalId: "s1",
    fecha: "2026-07-04",
    estado: "recibida",
    notas: null,
    items: [{ productoId: "prod1", cantidad: 10, costoUnitarioUsd: 0.8, actualizarCosto: true }],
    ...overrides,
  };
}

describe("registrarCompraLocal", () => {
  it("inserta la compra con el total calculado", async () => {
    const { db, ejecutadas } = mockDb();
    const { compraId } = await registrarCompraLocal(db, baseInput());
    const compras = tabla(ejecutadas, "mm_compras");
    expect(compras).toHaveLength(1);
    expect(compras[0]?.params[0]).toBe(compraId);
    expect(compras[0]?.params[5]).toBe(8); // 10 * 0.8
  });

  it("inserta un ítem por producto", async () => {
    const { db, ejecutadas } = mockDb();
    await registrarCompraLocal(
      db,
      baseInput({
        items: [
          { productoId: "p1", cantidad: 2, costoUnitarioUsd: 1, actualizarCosto: false },
          { productoId: "p2", cantidad: 3, costoUnitarioUsd: 2, actualizarCosto: false },
        ],
      }),
    );
    expect(tabla(ejecutadas, "mm_compras_items")).toHaveLength(2);
  });

  it("aplica stock, costo e historial de precio solo si está recibida y el usuario eligió actualizar", async () => {
    const { db, ejecutadas } = mockDb({ costoPrevio: { costo_usd: 0.5, precio_usd: 1 } });
    await registrarCompraLocal(db, baseInput({ estado: "recibida" }));
    expect(tabla(ejecutadas, "mm_movimientos_inventario")).toHaveLength(1);
    expect(
      ejecutadas.filter((e) => e.sql.toLowerCase().includes("update mm_productos")),
    ).toHaveLength(1);
    expect(tabla(ejecutadas, "mm_precios")).toHaveLength(1);
  });

  it("no toca inventario/costo si queda en borrador", async () => {
    const { db, ejecutadas } = mockDb({ costoPrevio: { costo_usd: 0.5, precio_usd: 1 } });
    await registrarCompraLocal(db, baseInput({ estado: "borrador" }));
    expect(tabla(ejecutadas, "mm_movimientos_inventario")).toHaveLength(0);
    expect(
      ejecutadas.filter((e) => e.sql.toLowerCase().includes("update mm_productos")),
    ).toHaveLength(0);
    expect(tabla(ejecutadas, "mm_precios")).toHaveLength(0);
  });

  it('mantiene costo/precio si el usuario eligió "Mantener" aunque el costo cambió', async () => {
    const { db, ejecutadas } = mockDb({ costoPrevio: { costo_usd: 10, precio_usd: 15 } });
    await registrarCompraLocal(
      db,
      baseInput({
        estado: "recibida",
        items: [{ productoId: "prod1", cantidad: 5, costoUnitarioUsd: 12, actualizarCosto: false }],
      }),
    );
    // El stock siempre sube, pase lo que pase con la decisión de costo.
    expect(tabla(ejecutadas, "mm_movimientos_inventario")).toHaveLength(1);
    expect(
      ejecutadas.filter((e) => e.sql.toLowerCase().includes("update mm_productos")),
    ).toHaveLength(0);
    expect(tabla(ejecutadas, "mm_precios")).toHaveLength(0);
  });

  it("no actualiza si el costo tecleado es igual al que el producto ya tenía", async () => {
    const { db, ejecutadas } = mockDb({ costoPrevio: { costo_usd: 12, precio_usd: 18 } });
    await registrarCompraLocal(
      db,
      baseInput({
        estado: "recibida",
        items: [{ productoId: "prod1", cantidad: 5, costoUnitarioUsd: 12, actualizarCosto: true }],
      }),
    );
    expect(
      ejecutadas.filter((e) => e.sql.toLowerCase().includes("update mm_productos")),
    ).toHaveLength(0);
    expect(tabla(ejecutadas, "mm_precios")).toHaveLength(0);
  });

  it("al actualizar, recalcula el precio de venta con el margen que el producto ya tenía", async () => {
    // Costo actual $10, precio actual $15 -> margen 50%. Nuevo costo $12 -> precio esperado $18.
    const { db, ejecutadas } = mockDb({ costoPrevio: { costo_usd: 10, precio_usd: 15 } });
    await registrarCompraLocal(
      db,
      baseInput({
        estado: "recibida",
        items: [{ productoId: "prod1", cantidad: 1, costoUnitarioUsd: 12, actualizarCosto: true }],
      }),
    );
    const updates = ejecutadas.filter((e) => e.sql.toLowerCase().includes("update mm_productos"));
    expect(updates).toHaveLength(1);
    // update mm_productos set costo_usd = ?, precio_usd = ?, updated_at = ? where id = ?
    expect(updates[0]?.params[0]).toBe(12);
    expect(updates[0]?.params[1]).toBe(18);
  });

  it("el movimiento de entrada usa cantidad positiva", async () => {
    const { db, ejecutadas } = mockDb();
    await registrarCompraLocal(db, baseInput());
    const movimientos = tabla(ejecutadas, "mm_movimientos_inventario");
    expect(movimientos[0]?.params[5]).toBe(10);
  });
});

describe("crearProveedorLocal / actualizarProveedorLocal", () => {
  it("inserta el proveedor", async () => {
    const { db, ejecutadas } = mockDb();
    await crearProveedorLocal(db, {
      tenantId: "t1",
      nombre: "Distribuidora Ejemplo",
      contacto: null,
      telefono: null,
      whatsapp: null,
      notas: null,
      activo: true,
    });
    expect(tabla(ejecutadas, "mm_proveedores")).toHaveLength(1);
  });

  it("actualiza el proveedor por id y tenant", async () => {
    const { db, ejecutadas } = mockDb();
    await actualizarProveedorLocal(db, "prov1", {
      tenantId: "t1",
      nombre: "Nuevo nombre",
      contacto: null,
      telefono: null,
      whatsapp: null,
      notas: null,
      activo: false,
    });
    const updates = ejecutadas.filter((e) => e.sql.toLowerCase().includes("update mm_proveedores"));
    expect(updates).toHaveLength(1);
    expect(updates[0]?.params).toContain("prov1");
  });
});
