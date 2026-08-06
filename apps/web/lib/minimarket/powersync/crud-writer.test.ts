import { describe, expect, it, vi } from "vitest";
import { UpdateType } from "@powersync/common";
import {
  applyCrudEntry,
  createSupabaseWriter,
  ErrorSubidaPermanente,
  normalizarArraysJson,
  type CrudWriter,
} from "./crud-writer";

/** Cliente Supabase mínimo que simula `.from(table).upsert/update/delete()` devolviendo `error`. */
function mockSupabaseClient(error: { message: string; code?: string } | null) {
  const resultado = Promise.resolve({ error });
  return {
    from: () => ({
      upsert: () => resultado,
      update: () => ({ eq: () => resultado }),
      delete: () => ({ eq: () => resultado }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function mockWriter(): CrudWriter & {
  put: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
} {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    patch: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

describe("applyCrudEntry", () => {
  it("PUT hace upsert incluyendo el id en el registro", async () => {
    const writer = mockWriter();
    await applyCrudEntry(writer, {
      op: UpdateType.PUT,
      table: "mm_productos",
      id: "p1",
      opData: { tenant_id: "t1", nombre: "Harina", precio_usd: 1.2 },
    });
    expect(writer.put).toHaveBeenCalledWith("mm_productos", {
      tenant_id: "t1",
      nombre: "Harina",
      precio_usd: 1.2,
      id: "p1",
    });
    expect(writer.patch).not.toHaveBeenCalled();
    expect(writer.remove).not.toHaveBeenCalled();
  });

  it("PATCH actualiza solo las columnas cambiadas por id", async () => {
    const writer = mockWriter();
    await applyCrudEntry(writer, {
      op: UpdateType.PATCH,
      table: "mm_clientes",
      id: "c9",
      opData: { deleted_at: "2026-06-23T00:00:00Z" },
    });
    expect(writer.patch).toHaveBeenCalledWith("mm_clientes", "c9", {
      deleted_at: "2026-06-23T00:00:00Z",
    });
  });

  it("DELETE elimina por id", async () => {
    const writer = mockWriter();
    await applyCrudEntry(writer, { op: UpdateType.DELETE, table: "mm_ventas", id: "v3" });
    expect(writer.remove).toHaveBeenCalledWith("mm_ventas", "v3");
  });

  it("propaga el error del destino para reintentar el lote", async () => {
    const writer = mockWriter();
    writer.put.mockRejectedValueOnce(new Error("offline"));
    await expect(
      applyCrudEntry(writer, { op: UpdateType.PUT, table: "mm_ventas", id: "v4", opData: {} }),
    ).rejects.toThrow("offline");
  });
});

describe("normalizarArraysJson", () => {
  it("revierte `etiquetas` de mm_productos de texto JSON a arreglo", () => {
    const out = normalizarArraysJson("mm_productos", {
      nombre: "Harina",
      etiquetas: '["desayuno","importado"]',
    });
    expect(out).toEqual({ nombre: "Harina", etiquetas: ["desayuno", "importado"] });
  });

  it("deja tablas sin columnas array intactas", () => {
    const data = { tenant_id: "t1", monto_usd: 3 };
    expect(normalizarArraysJson("mm_ventas", data)).toEqual(data);
  });

  it("deja el valor intacto si no es JSON válido", () => {
    const out = normalizarArraysJson("mm_productos", { etiquetas: "no-es-json" });
    expect(out).toEqual({ etiquetas: "no-es-json" });
  });

  it("revierte carrito_json/pagos_json de mm_ventas_pendientes de texto JSON a objeto", () => {
    const out = normalizarArraysJson("mm_ventas_pendientes", {
      nota: "Mesa 2",
      carrito_json: '[{"productoId":"p1","cantidad":2}]',
      pagos_json: '[{"metodo":"efectivo_bs","monto":"500"}]',
    });
    expect(out).toEqual({
      nota: "Mesa 2",
      carrito_json: [{ productoId: "p1", cantidad: 2 }],
      pagos_json: [{ metodo: "efectivo_bs", monto: "500" }],
    });
  });
});

describe("createSupabaseWriter", () => {
  it("lanza ErrorSubidaPermanente cuando Postgres rechaza el dato (ej. NOT NULL violado)", async () => {
    const client = mockSupabaseClient({
      message: 'null value in column "sucursal_id" violates not-null constraint',
      code: "23502",
    });
    const writer = createSupabaseWriter(client);
    await expect(writer.put("mm_ventas_pendientes", { id: "vp1" })).rejects.toBeInstanceOf(
      ErrorSubidaPermanente,
    );
  });

  it("lanza Error normal (reintentable) cuando el error no es de datos inválidos", async () => {
    const client = mockSupabaseClient({ message: "fetch failed" });
    const writer = createSupabaseWriter(client);
    const promesa = writer.put("mm_ventas_pendientes", { id: "vp1" });
    await expect(promesa).rejects.toThrow("fetch failed");
    await expect(promesa).rejects.not.toBeInstanceOf(ErrorSubidaPermanente);
  });

  it("no lanza nada cuando la escritura tiene éxito", async () => {
    const client = mockSupabaseClient(null);
    const writer = createSupabaseWriter(client);
    await expect(writer.put("mm_productos", { id: "p1" })).resolves.toBeUndefined();
    await expect(writer.patch("mm_productos", "p1", { nombre: "x" })).resolves.toBeUndefined();
    await expect(writer.remove("mm_productos", "p1")).resolves.toBeUndefined();
  });

  it("clasifica como permanente tambien PATCH y DELETE con codigo de restriccion", async () => {
    const client = mockSupabaseClient({ message: "duplicate key", code: "23505" });
    const writer = createSupabaseWriter(client);
    await expect(writer.patch("mm_ventas_pendientes", "vp1", {})).rejects.toBeInstanceOf(
      ErrorSubidaPermanente,
    );
    await expect(writer.remove("mm_ventas_pendientes", "vp1")).rejects.toBeInstanceOf(
      ErrorSubidaPermanente,
    );
  });
});
