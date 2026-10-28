import { describe, expect, it } from "vitest";
import {
  costosARestaurar,
  faltantesStockParaAnular,
  parsearCostosAplicados,
  salidasParaAnular,
} from "./compras-anulacion";

describe("salidasParaAnular", () => {
  it("suma el mismo producto de dos líneas en la misma sucursal", () => {
    expect(
      salidasParaAnular([
        { producto_id: "a", sucursal_id: "s1", tipo: "entrada", cantidad: 3 },
        { producto_id: "a", sucursal_id: "s1", tipo: "entrada", cantidad: 2 },
      ]),
    ).toEqual([{ producto_id: "a", sucursal_id: "s1", cantidad: 5 }]);
  });

  it("separa por sucursal y descuenta salidas previas con la misma referencia", () => {
    expect(
      salidasParaAnular([
        { producto_id: "a", sucursal_id: "s1", tipo: "entrada", cantidad: 4 },
        { producto_id: "a", sucursal_id: "s2", tipo: "entrada", cantidad: 6 },
        { producto_id: "a", sucursal_id: "s2", tipo: "salida", cantidad: 6 },
      ]),
    ).toEqual([{ producto_id: "a", sucursal_id: "s1", cantidad: 4 }]);
  });
});

describe("faltantesStockParaAnular", () => {
  const salidas = [
    { producto_id: "a", sucursal_id: "s1", cantidad: 10 },
    { producto_id: "a", sucursal_id: "s2", cantidad: 2 },
  ];

  it("sin faltantes si el stock alcanza", () => {
    expect(
      faltantesStockParaAnular(salidas, [
        { producto_id: "a", sucursal_id: "s1", stock_actual: 10 },
        { producto_id: "a", sucursal_id: "s2", stock_actual: 7 },
      ]),
    ).toEqual([]);
  });

  it("reporta la sucursal donde no alcanza (multi-sucursal)", () => {
    expect(
      faltantesStockParaAnular(salidas, [
        { producto_id: "a", sucursal_id: "s1", stock_actual: 4 },
        { producto_id: "a", sucursal_id: "s2", stock_actual: 7 },
      ]),
    ).toEqual([{ producto_id: "a", sucursal_id: "s1", cantidad: 10, disponible: 4 }]);
  });

  it("sin fila de stock cuenta como 0", () => {
    expect(faltantesStockParaAnular(salidas.slice(1), [])).toEqual([
      { producto_id: "a", sucursal_id: "s2", cantidad: 2, disponible: 0 },
    ]);
  });
});

describe("costosARestaurar", () => {
  const aplicados = [
    { producto_id: "a", costo_anterior: 1, precio_anterior: 1.5, costo_nuevo: 2, precio_nuevo: 3 },
    { producto_id: "b", costo_anterior: 5, precio_anterior: 8, costo_nuevo: 6, precio_nuevo: 9.6 },
  ];

  it("restaura los intactos y deja a revisar los que cambiaron después", () => {
    const r = costosARestaurar(aplicados, [
      { id: "a", costo_usd: 2, precio_usd: 3 },
      { id: "b", costo_usd: 6, precio_usd: 10 },
    ]);
    expect(r.restaurables.map((c) => c.producto_id)).toEqual(["a"]);
    expect(r.aRevisar.map((c) => c.producto_id)).toEqual(["b"]);
  });

  it("ignora productos eliminados", () => {
    expect(costosARestaurar(aplicados, [])).toEqual({ restaurables: [], aRevisar: [] });
  });
});

describe("parsearCostosAplicados", () => {
  it("null en compras viejas sin el dato", () => {
    expect(parsearCostosAplicados(null)).toBeNull();
  });

  it("descarta filas mal formadas y convierte números", () => {
    expect(
      parsearCostosAplicados([
        {
          producto_id: "a",
          costo_anterior: "1",
          precio_anterior: 2,
          costo_nuevo: 3,
          precio_nuevo: 4,
        },
        { producto_id: 7 },
        {
          producto_id: "b",
          costo_anterior: "x",
          precio_anterior: 2,
          costo_nuevo: 3,
          precio_nuevo: 4,
        },
      ]),
    ).toEqual([
      { producto_id: "a", costo_anterior: 1, precio_anterior: 2, costo_nuevo: 3, precio_nuevo: 4 },
    ]);
  });
});
