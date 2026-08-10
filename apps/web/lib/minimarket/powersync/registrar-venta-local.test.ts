import { describe, expect, it, vi } from "vitest";
import type { AbstractPowerSyncDatabase } from "@powersync/web";
import { registrarVentaLocal, type VentaLocalInput } from "./registrar-venta-local";

interface Ejecutada {
  sql: string;
  params: unknown[];
}

/** Mock mínimo del motor local: registra cada INSERT ejecutado dentro de la transacción. */
function mockDb(sesionAbierta: { id: string } | null = { id: "sesion-1" }) {
  const ejecutadas: Ejecutada[] = [];
  const tx = {
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      ejecutadas.push({ sql, params });
      return { rowsAffected: 1 };
    }),
    getOptional: vi.fn(async () => sesionAbierta),
  };
  const db = {
    writeTransaction: vi.fn(async (cb: (context: typeof tx) => Promise<void>) => cb(tx)),
  } as unknown as AbstractPowerSyncDatabase;
  return { db, ejecutadas, tx };
}

function baseInput(overrides: Partial<VentaLocalInput> = {}): VentaLocalInput {
  return {
    tenantId: "t1",
    usuarioId: "u1",
    sucursalId: "s1",
    clienteId: null,
    items: [
      {
        productoId: "p1",
        descripcion: "Harina",
        cantidad: 2,
        precioUsd: 1.5,
        impuestoId: "exento",
        aplicaIgtf: true,
      },
    ],
    pagos: [{ metodo: "efectivo_bs", monto: 100, moneda: "VES" }],
    tasa: 50,
    subtotalUsd: 3,
    descuentoUsd: 0,
    igtfUsd: 0,
    totalUsd: 3,
    totalBs: 150,
    fiadoMonto: 0,
    ...overrides,
  };
}

function tabla(ejecutadas: Ejecutada[], nombre: string): Ejecutada[] {
  return ejecutadas.filter((e) => e.sql.toLowerCase().includes(`insert into ${nombre}\n`));
}

describe("registrarVentaLocal", () => {
  it("inserta la venta con folio offline y los totales dados", async () => {
    const { db, ejecutadas } = mockDb();
    const { ventaId, numeroDocumento } = await registrarVentaLocal(db, baseInput());

    expect(numeroDocumento).toMatch(/^R-OFF-/);
    const ventas = tabla(ejecutadas, "mm_ventas");
    expect(ventas).toHaveLength(1);
    expect(ventas[0]?.params).toEqual([
      ventaId,
      "t1",
      "s1",
      "u1",
      null,
      expect.any(String),
      50,
      3,
      0,
      0,
      3,
      150,
      "recibo",
      numeroDocumento,
      "completada",
      expect.any(String),
      expect.any(String),
    ]);
  });

  it("inserta un renglón y un movimiento de salida de inventario por cada producto", async () => {
    const { db, ejecutadas } = mockDb();
    await registrarVentaLocal(
      db,
      baseInput({
        items: [
          {
            productoId: "p1",
            descripcion: "Harina",
            cantidad: 2,
            precioUsd: 1.5,
            impuestoId: "exento",
            aplicaIgtf: true,
          },
          {
            productoId: "p2",
            descripcion: "Arroz",
            cantidad: 1,
            precioUsd: 2,
            impuestoId: "exento",
            aplicaIgtf: true,
          },
        ],
      }),
    );

    expect(tabla(ejecutadas, "mm_ventas_items")).toHaveLength(2);
    const movimientos = tabla(ejecutadas, "mm_movimientos_inventario");
    expect(movimientos).toHaveLength(2);
    // cantidad negativa (salida) para cada producto
    expect(movimientos[0]?.params[5]).toBe(-2);
    expect(movimientos[1]?.params[5]).toBe(-1);
  });

  it("registra el movimiento de caja solo para pagos en efectivo, si hay sesión abierta", async () => {
    const { db, ejecutadas } = mockDb({ id: "sesion-1" });
    await registrarVentaLocal(
      db,
      baseInput({
        pagos: [
          { metodo: "efectivo_bs", monto: 100, moneda: "VES" },
          { metodo: "pago_movil", monto: 50, moneda: "VES" },
        ],
      }),
    );

    expect(tabla(ejecutadas, "mm_pagos_venta")).toHaveLength(2);
    const caja = tabla(ejecutadas, "mm_caja_movimientos");
    expect(caja).toHaveLength(1);
    expect(caja[0]?.params[4]).toBe(100); // monto del pago en efectivo
  });

  it("no registra movimiento de caja si no hay sesión abierta", async () => {
    const { db, ejecutadas } = mockDb(null);
    await registrarVentaLocal(db, baseInput());
    expect(tabla(ejecutadas, "mm_caja_movimientos")).toHaveLength(0);
  });

  it("registra el vuelto como egreso, para que el efectivo neto sea el correcto", async () => {
    const { db, ejecutadas } = mockDb({ id: "sesion-1" });
    await registrarVentaLocal(
      db,
      baseInput({
        pagos: [{ metodo: "efectivo_usd", monto: 100, moneda: "USD" }],
        vuelto: { monto: 50, moneda: "USD" },
      }),
    );
    const caja = tabla(ejecutadas, "mm_caja_movimientos");
    expect(caja).toHaveLength(2);
    expect(caja[0]?.params[3]).toBe("venta");
    expect(caja[0]?.params[4]).toBe(100);
    expect(caja[1]?.params[3]).toBe("egreso");
    expect(caja[1]?.params[4]).toBe(50);
  });

  it("el vuelto puede ir en una moneda distinta a la del pago", async () => {
    const { db, ejecutadas } = mockDb({ id: "sesion-1" });
    await registrarVentaLocal(
      db,
      baseInput({
        pagos: [{ metodo: "efectivo_usd", monto: 20, moneda: "USD" }],
        vuelto: { monto: 250, moneda: "VES" },
      }),
    );
    const caja = tabla(ejecutadas, "mm_caja_movimientos");
    const egreso = caja.find((c) => c.params[3] === "egreso");
    expect(egreso?.params[4]).toBe(250);
    expect(egreso?.params[5]).toBe("VES");
  });

  it("no registra egreso de vuelto si es 0 o no viene", async () => {
    const { db, ejecutadas } = mockDb({ id: "sesion-1" });
    await registrarVentaLocal(
      db,
      baseInput({ pagos: [{ metodo: "efectivo_bs", monto: 100, moneda: "VES" }] }),
    );
    const caja = tabla(ejecutadas, "mm_caja_movimientos");
    expect(caja).toHaveLength(1);
    expect(caja[0]?.params[3]).toBe("venta");
  });

  it("crea la cuenta por cobrar solo cuando hay cliente y monto fiado real", async () => {
    const { db, ejecutadas } = mockDb();
    await registrarVentaLocal(
      db,
      baseInput({
        clienteId: "c1",
        fiadoMonto: 3,
        pagos: [{ metodo: "fiado", monto: 3, moneda: "USD" }],
      }),
    );
    const fiados = tabla(ejecutadas, "mm_fiados");
    expect(fiados).toHaveLength(1);
    expect(fiados[0]?.params[2]).toBe("c1");
    expect(fiados[0]?.params[4]).toBe(3);
  });

  it("no crea cuenta por cobrar cuando el fiado es 0", async () => {
    const { db, ejecutadas } = mockDb();
    await registrarVentaLocal(db, baseInput({ clienteId: "c1", fiadoMonto: 0 }));
    expect(tabla(ejecutadas, "mm_fiados")).toHaveLength(0);
  });

  it("sin precio ajustado, guarda precio_ajustado=0 y motivo=null (compatibilidad hacia atrás)", async () => {
    const { db, ejecutadas } = mockDb();
    await registrarVentaLocal(db, baseInput());
    const items = tabla(ejecutadas, "mm_ventas_items");
    expect(items[0]?.params[9]).toBe(0);
    expect(items[0]?.params[10]).toBe(null);
  });

  it("con precio ajustado, guarda precio_ajustado=1, el precio dado y el motivo", async () => {
    const { db, ejecutadas } = mockDb();
    await registrarVentaLocal(
      db,
      baseInput({
        items: [
          {
            productoId: "p1",
            descripcion: "Harina",
            cantidad: 2,
            precioUsd: 1.8,
            impuestoId: "exento",
            aplicaIgtf: true,
            precioAjustado: true,
            motivoAjustePrecio: "Producto dañado",
          },
        ],
      }),
    );
    const items = tabla(ejecutadas, "mm_ventas_items");
    expect(items[0]?.params[6]).toBe(1.8);
    expect(items[0]?.params[8]).toBe(3.6);
    expect(items[0]?.params[9]).toBe(1);
    expect(items[0]?.params[10]).toBe("Producto dañado");
  });
});
