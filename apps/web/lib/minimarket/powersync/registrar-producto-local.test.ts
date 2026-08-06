import { describe, expect, it, vi } from "vitest";
import type { AbstractPowerSyncDatabase } from "@powersync/web";
import {
  actualizarProductoLocal,
  crearCategoriaLocal,
  crearProductoLocal,
  registrarMovimientoInventarioLocal,
  type ProductoLocalInput,
} from "./registrar-producto-local";

interface Ejecutada {
  sql: string;
  params: unknown[];
}

function mockDb(
  options: {
    productoCodigos?: { id: string; codigo: string }[];
    precioPrevio?: { precio_usd: number } | null;
    conteoCategorias?: { n: number } | null;
    inventarioExistente?: { id: string } | null;
  } = {},
) {
  const ejecutadas: Ejecutada[] = [];
  const tx = {
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      ejecutadas.push({ sql, params });
      return { rowsAffected: 1 };
    }),
    getAll: vi.fn(async () => options.productoCodigos ?? []),
    getOptional: vi.fn(async (sql: string) => {
      if (sql.includes("mm_productos")) return options.precioPrevio ?? null;
      if (sql.includes("count(*)")) return options.conteoCategorias ?? { n: 0 };
      if (sql.includes("mm_inventario")) return options.inventarioExistente ?? null;
      return null;
    }),
  };
  const db = {
    writeTransaction: vi.fn(async (cb: (context: typeof tx) => Promise<void>) => cb(tx)),
  } as unknown as AbstractPowerSyncDatabase;
  return { db, ejecutadas, tx };
}

function baseInput(overrides: Partial<ProductoLocalInput> = {}): ProductoLocalInput {
  return {
    tenantId: "t1",
    usuarioId: "u1",
    sucursalId: "s1",
    nombre: "Harina",
    codigo: "HAR-01",
    categoriaId: null,
    tipoVenta: "unidad",
    unidad: "unidad",
    costoUsd: 1,
    precioUsd: 1.5,
    impuestoId: "exento",
    aplicaIgtf: false,
    proveedorId: null,
    etiquetas: ["desayuno"],
    codigos: [],
    activo: true,
    usaMargenGlobal: false,
    ...overrides,
  };
}

function tabla(ejecutadas: Ejecutada[], nombre: string): Ejecutada[] {
  return ejecutadas.filter((e) => e.sql.toLowerCase().includes(`insert into ${nombre}`));
}

describe("crearProductoLocal", () => {
  it("inserta el producto con etiquetas serializadas como JSON", async () => {
    const { db, ejecutadas } = mockDb();
    const { productoId } = await crearProductoLocal(db, baseInput());

    const productos = tabla(ejecutadas, "mm_productos");
    expect(productos).toHaveLength(1);
    expect(productos[0]?.params[0]).toBe(productoId);
    expect(productos[0]?.params).toContain(JSON.stringify(["desayuno"]));
  });

  it("agrega el precio inicial al histórico", async () => {
    const { db, ejecutadas } = mockDb();
    await crearProductoLocal(db, baseInput());
    expect(tabla(ejecutadas, "mm_precios")).toHaveLength(1);
  });

  it("sincroniza códigos de barra si se proveen", async () => {
    const { db, ejecutadas } = mockDb();
    await crearProductoLocal(db, baseInput({ codigos: ["7591234567890"] }));
    expect(tabla(ejecutadas, "mm_producto_codigos")).toHaveLength(1);
  });

  it("registra stock inicial como movimiento de entrada", async () => {
    const { db, ejecutadas } = mockDb();
    await crearProductoLocal(db, baseInput({ stockInicial: 10 }));
    const movimientos = tabla(ejecutadas, "mm_movimientos_inventario");
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]?.params).toContain(10);
  });

  it("no registra movimiento si no hay stock inicial", async () => {
    const { db, ejecutadas } = mockDb();
    await crearProductoLocal(db, baseInput());
    expect(tabla(ejecutadas, "mm_movimientos_inventario")).toHaveLength(0);
  });
});

describe("actualizarProductoLocal", () => {
  it("agrega histórico de precio solo si el precio cambió", async () => {
    const { db, ejecutadas } = mockDb({ precioPrevio: { precio_usd: 1.5 } });
    await actualizarProductoLocal(db, "p1", baseInput({ precioUsd: 1.5 }));
    expect(tabla(ejecutadas, "mm_precios")).toHaveLength(0);
  });

  it("agrega histórico de precio si el precio cambió", async () => {
    const { db, ejecutadas } = mockDb({ precioPrevio: { precio_usd: 1.5 } });
    await actualizarProductoLocal(db, "p1", baseInput({ precioUsd: 2 }));
    expect(tabla(ejecutadas, "mm_precios")).toHaveLength(1);
  });

  it("borra códigos que ya no están en la lista deseada", async () => {
    const { db, ejecutadas } = mockDb({
      productoCodigos: [{ id: "c1", codigo: "VIEJO" }],
    });
    await actualizarProductoLocal(db, "p1", baseInput({ codigos: ["NUEVO"] }));
    const borrados = ejecutadas.filter((e) =>
      e.sql.toLowerCase().includes("delete from mm_producto_codigos"),
    );
    expect(borrados).toHaveLength(1);
    const insertados = tabla(ejecutadas, "mm_producto_codigos");
    expect(insertados).toHaveLength(1);
  });
});

describe("registrarMovimientoInventarioLocal", () => {
  it("aplica el signo correcto según el tipo", async () => {
    const { db, ejecutadas } = mockDb();
    await registrarMovimientoInventarioLocal(db, {
      tenantId: "t1",
      usuarioId: "u1",
      sucursalId: "s1",
      productoId: "p1",
      tipo: "merma",
      cantidad: 3,
    });
    const movimientos = tabla(ejecutadas, "mm_movimientos_inventario");
    expect(movimientos[0]?.params[5]).toBe(-3);
  });
});

describe("crearCategoriaLocal", () => {
  it("calcula el orden a partir del conteo de categorías activas", async () => {
    const { db, ejecutadas } = mockDb({ conteoCategorias: { n: 4 } });
    await crearCategoriaLocal(db, { tenantId: "t1", nombre: "Lácteos" });
    const categorias = tabla(ejecutadas, "mm_categorias");
    expect(categorias[0]?.params).toContain(4);
  });
});
