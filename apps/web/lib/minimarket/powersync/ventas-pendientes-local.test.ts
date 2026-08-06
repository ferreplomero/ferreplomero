import { describe, expect, it, vi } from "vitest";
import type { AbstractPowerSyncDatabase } from "@powersync/web";
import {
  eliminarVentaPendienteLocal,
  guardarVentaPendienteLocal,
  obtenerVentaPendienteLocal,
  parseCarritoPendiente,
  parsePagosPendiente,
  type VentaPendienteInput,
  type VentaPendienteRow,
} from "./ventas-pendientes-local";

interface Ejecutada {
  sql: string;
  params: unknown[];
}

function mockDb(filas: Map<string, VentaPendienteRow> = new Map()) {
  const ejecutadas: Ejecutada[] = [];
  const db = {
    getOptional: vi.fn(async (sql: string, params: unknown[] = []) => {
      const id = String(params[0]);
      const fila = filas.get(id);
      if (!fila) return null;
      if (sql.toLowerCase().includes("select id from")) return { id: fila.id };
      return fila;
    }),
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      ejecutadas.push({ sql, params });
      return { rowsAffected: 1 };
    }),
  } as unknown as AbstractPowerSyncDatabase;
  return { db, ejecutadas, filas };
}

function input(overrides: Partial<VentaPendienteInput> = {}): VentaPendienteInput {
  return {
    id: "v1",
    tenantId: "t1",
    sucursalId: "s1",
    usuarioId: "u1",
    clienteId: null,
    nota: null,
    carrito: [{ productoId: "p1", cantidad: 2 }],
    pagos: [{ metodo: "efectivo_bs", monto: "500" }],
    descuentoPct: "",
    descuentoMonto: "",
    tasaTipo: "bcv",
    subtotalUsd: 1.6,
    estado: "en_espera",
    ...overrides,
  };
}

describe("guardarVentaPendienteLocal", () => {
  it("inserta una fila nueva cuando el id no existe", async () => {
    const { db, ejecutadas } = mockDb();
    await guardarVentaPendienteLocal(db, input());
    const inserts = ejecutadas.filter((e) => e.sql.toLowerCase().includes("insert into"));
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.params).toContain("v1");
  });

  it("actualiza la fila existente en vez de duplicarla", async () => {
    const filas = new Map<string, VentaPendienteRow>([
      [
        "v1",
        {
          id: "v1",
          tenant_id: "t1",
          sucursal_id: "s1",
          usuario_id: "u1",
          cliente_id: null,
          nota: null,
          carrito_json: "[]",
          pagos_json: "[]",
          descuento_pct: "",
          descuento_monto: "",
          tasa_tipo: "bcv",
          subtotal_usd: 0,
          articulos_count: 0,
          estado: "activo",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
    ]);
    const { db, ejecutadas } = mockDb(filas);
    await guardarVentaPendienteLocal(db, input({ nota: "Mesa 2" }));
    const inserts = ejecutadas.filter((e) => e.sql.toLowerCase().includes("insert into"));
    const updates = ejecutadas.filter((e) =>
      e.sql.toLowerCase().includes("update mm_ventas_pendientes"),
    );
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.params).toContain("Mesa 2");
  });

  it("serializa el carrito y los pagos como JSON", async () => {
    const { db, ejecutadas } = mockDb();
    await guardarVentaPendienteLocal(db, input());
    const [insert] = ejecutadas.filter((e) => e.sql.toLowerCase().includes("insert into"));
    const carritoJson = insert?.params.find(
      (p) => typeof p === "string" && p.includes("productoId"),
    );
    expect(carritoJson).toBe('[{"productoId":"p1","cantidad":2}]');
  });

  it("escribe 'en_espera' al insertar una fila nueva con ese estado", async () => {
    const { db, ejecutadas } = mockDb();
    await guardarVentaPendienteLocal(db, input({ estado: "en_espera" }));
    const [insert] = ejecutadas.filter((e) => e.sql.toLowerCase().includes("insert into"));
    expect(insert?.params).toContain("en_espera");
    expect(insert?.params).not.toContain("activo");
  });

  it("actualiza el estado de una fila existente de 'activo' a 'en_espera'", async () => {
    const filas = new Map<string, VentaPendienteRow>([
      [
        "v1",
        {
          id: "v1",
          tenant_id: "t1",
          sucursal_id: "s1",
          usuario_id: "u1",
          cliente_id: null,
          nota: null,
          carrito_json: "[]",
          pagos_json: "[]",
          descuento_pct: "",
          descuento_monto: "",
          tasa_tipo: "bcv",
          subtotal_usd: 0,
          articulos_count: 0,
          estado: "activo",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
    ]);
    const { db, ejecutadas } = mockDb(filas);
    await guardarVentaPendienteLocal(db, input({ estado: "en_espera" }));
    const [update] = ejecutadas.filter((e) =>
      e.sql.toLowerCase().includes("update mm_ventas_pendientes"),
    );
    expect(update?.sql.toLowerCase()).toContain("estado = ?");
    expect(update?.params).toContain("en_espera");
  });
});

/**
 * Base en memoria que SÍ aplica los INSERT/UPDATE/DELETE a una tabla real (a
 * diferencia de `mockDb`, que solo registra las llamadas) — para poder
 * simular el flujo completo: escribir, releer, y comprobar que un filtro por
 * `estado` (el que usa el panel "En espera" de verdad) ve lo que corresponde
 * en cada paso.
 */
function crearDbEnMemoria() {
  const tabla = new Map<string, VentaPendienteRow>();
  const db = {
    getOptional: vi.fn(async (sql: string, params: unknown[] = []) => {
      const id = String(params[0]);
      const fila = tabla.get(id);
      if (!fila) return null;
      if (sql.toLowerCase().includes("select id from")) return { id: fila.id };
      return fila;
    }),
    execute: vi.fn(async (sql: string, params: unknown[]) => {
      const lower = sql.toLowerCase();
      if (lower.includes("insert into")) {
        const [
          id,
          tenant_id,
          sucursal_id,
          usuario_id,
          cliente_id,
          nota,
          carrito_json,
          pagos_json,
          descuento_pct,
          descuento_monto,
          tasa_tipo,
          subtotal_usd,
          articulos_count,
          estado,
          created_at,
          updated_at,
        ] = params as [
          string,
          string,
          string,
          string | null,
          string | null,
          string | null,
          string,
          string,
          string,
          string,
          string,
          number,
          number,
          string,
          string,
          string,
        ];
        tabla.set(id, {
          id,
          tenant_id,
          sucursal_id,
          usuario_id,
          cliente_id,
          nota,
          carrito_json,
          pagos_json,
          descuento_pct,
          descuento_monto,
          tasa_tipo,
          subtotal_usd,
          articulos_count,
          estado,
          created_at,
          updated_at,
        });
      } else if (lower.includes("update mm_ventas_pendientes")) {
        const [
          cliente_id,
          nota,
          carrito_json,
          pagos_json,
          descuento_pct,
          descuento_monto,
          tasa_tipo,
          subtotal_usd,
          articulos_count,
          estado,
          updated_at,
          id,
        ] = params as [
          string | null,
          string | null,
          string,
          string,
          string,
          string,
          string,
          number,
          number,
          string,
          string,
          string,
        ];
        const existente = tabla.get(id);
        if (existente) {
          tabla.set(id, {
            ...existente,
            cliente_id,
            nota,
            carrito_json,
            pagos_json,
            descuento_pct,
            descuento_monto,
            tasa_tipo,
            subtotal_usd,
            articulos_count,
            estado,
            updated_at,
          });
        }
      } else if (lower.includes("delete from")) {
        tabla.delete(String(params[0]));
      }
      return { rowsAffected: 1 };
    }),
  } as unknown as AbstractPowerSyncDatabase;
  return { db, tabla };
}

/** Simula la consulta EXACTA del panel "En espera" (ventas-en-espera.tsx). */
function ventasEnElPanel(tabla: Map<string, VentaPendienteRow>, sucursalId: string) {
  return Array.from(tabla.values())
    .filter((f) => f.sucursal_id === sucursalId && f.estado === "en_espera")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

describe("flujo completo del POS: activo -> en_espera (cerrar con X) -> activo (retomar) -> cobrado", () => {
  it("la venta aparece en el panel justo al pasar a en_espera, y desaparece al retomarla o cobrarla", async () => {
    const { db, tabla } = crearDbEnMemoria();

    // 1) El cajero arma el carrito: autoguardado continuo como 'activo'.
    await guardarVentaPendienteLocal(db, input({ id: "v1", estado: "activo" }));
    expect(ventasEnElPanel(tabla, "s1")).toHaveLength(0); // el panel NUNCA muestra lo 'activo'

    // 2) Cierra el diálogo de cobro con la X sin pagar: pasa a 'en_espera'.
    await guardarVentaPendienteLocal(db, input({ id: "v1", estado: "en_espera" }));
    const listado = ventasEnElPanel(tabla, "s1");
    expect(listado).toHaveLength(1);
    expect(listado[0]?.id).toBe("v1");
    expect(listado[0]?.estado).toBe("en_espera");

    // 3) El cajero abre "En espera", ve la venta, y la retoma: vuelve a 'activo'.
    await guardarVentaPendienteLocal(db, input({ id: "v1", estado: "activo" }));
    expect(ventasEnElPanel(tabla, "s1")).toHaveLength(0); // ya no está "en espera": está en el carrito

    // 4) Confirma el cobro: la fila se borra (se volvió una venta real).
    await eliminarVentaPendienteLocal(db, "v1");
    expect(await obtenerVentaPendienteLocal(db, "v1")).toBeNull();
    expect(ventasEnElPanel(tabla, "s1")).toHaveLength(0);
  });

  it("varias ventas en espera a la vez, cada una visible con su propio estado", async () => {
    const { db, tabla } = crearDbEnMemoria();

    await guardarVentaPendienteLocal(db, input({ id: "v1", estado: "en_espera", nota: "Mesa 2" }));
    await guardarVentaPendienteLocal(
      db,
      input({ id: "v2", estado: "en_espera", nota: "Cliente ocasional" }),
    );
    // v3 es el carrito que el cajero sigue armando ahora mismo: no debe verse.
    await guardarVentaPendienteLocal(db, input({ id: "v3", estado: "activo" }));

    const listado = ventasEnElPanel(tabla, "s1");
    expect(listado.map((f) => f.id).sort()).toEqual(["v1", "v2"]);

    // Cancela una de las dos en espera: solo desaparece esa.
    await eliminarVentaPendienteLocal(db, "v1");
    expect(ventasEnElPanel(tabla, "s1").map((f) => f.id)).toEqual(["v2"]);
  });
});

describe("eliminarVentaPendienteLocal / obtenerVentaPendienteLocal", () => {
  it("borra por id", async () => {
    const { db, ejecutadas } = mockDb();
    await eliminarVentaPendienteLocal(db, "v1");
    expect(ejecutadas[0]?.sql.toLowerCase()).toContain("delete from mm_ventas_pendientes");
    expect(ejecutadas[0]?.params).toEqual(["v1"]);
  });

  it("devuelve null si no existe", async () => {
    const { db } = mockDb();
    const row = await obtenerVentaPendienteLocal(db, "no-existe");
    expect(row).toBeNull();
  });
});

describe("parseCarritoPendiente / parsePagosPendiente", () => {
  it("parsea filas válidas", () => {
    const carrito = parseCarritoPendiente({
      carrito_json: '[{"productoId":"p1","cantidad":2},{"productoId":"p2","cantidad":1.5}]',
    });
    expect(carrito).toEqual([
      { productoId: "p1", cantidad: 2 },
      { productoId: "p2", cantidad: 1.5 },
    ]);

    const pagos = parsePagosPendiente({
      pagos_json: '[{"metodo":"efectivo_bs","monto":"500","autoSaldo":true}]',
    });
    expect(pagos).toEqual([{ metodo: "efectivo_bs", monto: "500", autoSaldo: true }]);
  });

  it("descarta filas corruptas sin tumbar el parseo (JSON inválido -> vacío)", () => {
    expect(parseCarritoPendiente({ carrito_json: "no-es-json" })).toEqual([]);
    expect(parsePagosPendiente({ pagos_json: "no-es-json" })).toEqual([]);
  });

  it("descarta items individuales inválidos y conserva los válidos", () => {
    const carrito = parseCarritoPendiente({
      carrito_json: '[{"productoId":"p1","cantidad":2},{"productoId":"p2","cantidad":-1}]',
    });
    expect(carrito).toEqual([{ productoId: "p1", cantidad: 2 }]);

    const pagos = parsePagosPendiente({
      pagos_json:
        '[{"metodo":"efectivo_bs","monto":"500"},{"metodo":"metodo_invalido","monto":"100"}]',
    });
    expect(pagos).toEqual([{ metodo: "efectivo_bs", monto: "500" }]);
  });

  // Regresión: un pago con cuenta bancaria (pago móvil/transferencia/tarjeta)
  // perdía esa cuenta al dejar la venta en espera y retomarla — el ingreso
  // dejaba de registrarse en el banco al confirmar. `cuentaBancariaId` debe
  // sobrevivir el viaje de ida y vuelta por JSON igual que `autoSaldo`.
  it("conserva cuentaBancariaId de un pago al parsear", () => {
    const pagos = parsePagosPendiente({
      pagos_json:
        '[{"metodo":"pago_movil","monto":"9906.76","cuentaBancariaId":"11111111-1111-1111-1111-111111111111"}]',
    });
    expect(pagos).toEqual([
      {
        metodo: "pago_movil",
        monto: "9906.76",
        cuentaBancariaId: "11111111-1111-1111-1111-111111111111",
      },
    ]);
  });

  it("descarta cuentaBancariaId si no es un uuid válido, pero conserva el resto del pago", () => {
    const pagos = parsePagosPendiente({
      pagos_json: '[{"metodo":"pago_movil","monto":"100","cuentaBancariaId":"no-es-un-uuid"}]',
    });
    expect(pagos).toEqual([]);
  });
});
