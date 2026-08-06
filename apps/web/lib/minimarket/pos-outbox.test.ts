import { beforeEach, describe, expect, it } from "vitest";
import { guardarEnOutbox, leerOutbox, quitarDeOutbox, type OutboxEntrada } from "./pos-outbox";

function entrada(overrides: Partial<OutboxEntrada> = {}): OutboxEntrada {
  return {
    id: "v1",
    tenantId: "t1",
    sucursalId: "s1",
    usuarioId: "u1",
    clienteId: null,
    nota: null,
    carrito: [{ productoId: "p1", cantidad: 1 }],
    pagos: [{ metodo: "efectivo_bs", monto: "100" }],
    descuentoPct: "",
    descuentoMonto: "",
    tasaTipo: "bcv",
    subtotalUsd: 1.6,
    estado: "en_espera",
    guardadoEn: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("pos-outbox", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("empieza vacío para un tenant sin entradas", () => {
    expect(leerOutbox("t1")).toEqual([]);
  });

  it("guarda una entrada y la puede leer de vuelta", () => {
    guardarEnOutbox("t1", entrada());
    expect(leerOutbox("t1")).toEqual([entrada()]);
  });

  it("reemplaza la entrada existente con el mismo id en vez de duplicarla", () => {
    guardarEnOutbox("t1", entrada({ nota: "Mesa 2" }));
    guardarEnOutbox("t1", entrada({ nota: "Mesa 3" }));
    const guardadas = leerOutbox("t1");
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0]?.nota).toBe("Mesa 3");
  });

  it("mantiene entradas separadas por tenant", () => {
    guardarEnOutbox("t1", entrada({ id: "v1" }));
    guardarEnOutbox("t2", entrada({ id: "v2", tenantId: "t2" }));
    expect(leerOutbox("t1").map((e) => e.id)).toEqual(["v1"]);
    expect(leerOutbox("t2").map((e) => e.id)).toEqual(["v2"]);
  });

  it("quita solo la entrada indicada, conserva las demás", () => {
    guardarEnOutbox("t1", entrada({ id: "v1" }));
    guardarEnOutbox("t1", entrada({ id: "v2" }));
    quitarDeOutbox("t1", "v1");
    expect(leerOutbox("t1").map((e) => e.id)).toEqual(["v2"]);
  });

  it("no lanza si se quita una entrada que ya no existe", () => {
    expect(() => quitarDeOutbox("t1", "no-existe")).not.toThrow();
    expect(leerOutbox("t1")).toEqual([]);
  });

  it("tolera JSON corrupto en localStorage devolviendo vacío", () => {
    localStorage.setItem("arkiteq_mm_pos_outbox_t1", "no-es-json");
    expect(leerOutbox("t1")).toEqual([]);
  });
});
