import { describe, expect, it } from "vitest";
import { IGTF_RATE } from "@/lib/minimarket/constants";
import { computeCobro } from "@/lib/minimarket/pos-calc";
import { calcularPedidoPublico, type ProductoParaPedido } from "./calculo";

function prod(p: Partial<ProductoParaPedido> & { id: string }): ProductoParaPedido {
  return {
    nombre: p.id,
    precio_usd: 1,
    impuesto_id: "iva",
    aplica_igtf: true,
    activo: true,
    deleted_at: null,
    presenteEnSucursal: true,
    stock: 10,
    ...p,
  };
}

const productos = new Map(
  [
    prod({ id: "harina", nombre: "Harina", precio_usd: 1.25 }),
    prod({ id: "arroz", nombre: "Arroz", precio_usd: 2.1, impuesto_id: "exento" }),
    prod({ id: "agotado", nombre: "Aceite", stock: 0 }),
    prod({ id: "otra-suc", nombre: "Queso", presenteEnSucursal: false }),
    prod({ id: "inactivo", nombre: "Pan", activo: false }),
  ].map((p) => [p.id, p]),
);

const TASA = 772.54;
const sinImpuestos = { igtfActivo: true, ivaActivo: false, ivaPct: 16 };

/** Réplica literal del IGTF de `registrarVenta` (ventas/actions.ts) para un solo pago. */
function igtfRegistrarVenta(montoUsd: number, proporcion = 1): number {
  return Math.round(montoUsd * IGTF_RATE * proporcion * 100) / 100;
}

describe("calcularPedidoPublico", () => {
  it("sin IGTF con pago móvil: total = subtotal y Bs = USD × tasa", () => {
    const r = calcularPedidoPublico({
      items: [{ producto_id: "harina", cantidad: 3 }],
      productos,
      metodo: "pago_movil",
      tasa: TASA,
      config: sinImpuestos,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subtotalUsd).toBe(3.75);
    expect(r.igtfUsd).toBe(0);
    expect(r.totalUsd).toBe(3.75);
    // Mismo redondeo que registrarVenta: round2(3.75 × 772.54) = 2897.02 (2897.0249… en coma flotante).
    expect(r.totalBs).toBe(Math.round(3.75 * TASA * 100) / 100);
    expect(r.totalBs).toBe(2897.02);
  });

  it("con Zelle: el IGTF coincide al céntimo con el que registrarVenta calcula para ese pago", () => {
    const r = calcularPedidoPublico({
      items: [
        { producto_id: "harina", cantidad: 2 },
        { producto_id: "arroz", cantidad: 1 },
      ],
      productos,
      metodo: "zelle",
      tasa: TASA,
      config: sinImpuestos,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subtotalUsd).toBe(4.6);
    // El cliente paga el total de una vez: total = monto pagado.
    expect(r.montoMetodo).toBe(r.totalUsd);
    expect(r.igtfUsd).toBe(igtfRegistrarVenta(r.totalUsd));
    expect(r.totalUsd).toBe(Math.round((r.subtotalUsd + r.igtfUsd) * 100) / 100);
    // Mismo resultado que el diálogo de cobro del POS con ese pago.
    const pos = computeCobro({
      pagos: [{ metodo: "zelle", monto: String(r.montoMetodo) }],
      subtotalNeto: 4.6,
      tasa: TASA,
      cantidadLineas: 2,
      clienteId: null,
      igtfActivo: true,
    });
    expect(pos.igtf).toBe(r.igtfUsd);
    expect(pos.totalUsd).toBe(r.totalUsd);
    expect(pos.faltante).toBe(0);
    expect(pos.vuelto).toBe(0);
  });

  it("IVA solo sobre lo gravado y IGTF con efectivo USD en el local", () => {
    const r = calcularPedidoPublico({
      items: [
        { producto_id: "harina", cantidad: 4 },
        { producto_id: "arroz", cantidad: 1 },
      ],
      productos,
      metodo: "efectivo_usd",
      tasa: TASA,
      config: { igtfActivo: true, ivaActivo: true, ivaPct: 16 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ivaUsd).toBe(0.8); // 16 % de 5,00 gravado; el arroz es exento
    expect(r.igtfUsd).toBeGreaterThan(0);
    expect(r.totalUsd).toBe(Math.round((7.1 + 0.8 + r.igtfUsd) * 100) / 100);
  });

  it("IGTF desactivado en el negocio: Zelle no suma IGTF", () => {
    const r = calcularPedidoPublico({
      items: [{ producto_id: "harina", cantidad: 1 }],
      productos,
      metodo: "zelle",
      tasa: TASA,
      config: { igtfActivo: false, ivaActivo: false, ivaPct: 16 },
    });
    expect(r.ok && r.igtfUsd).toBe(0);
  });

  it("bloquea producto agotado, fuera de la sucursal, inactivo o cantidad mayor al stock", () => {
    const casos: [string, number, string][] = [
      ["agotado", 1, '"Aceite" está agotado.'],
      ["otra-suc", 1, '"Queso" ya no está disponible en esta sucursal.'],
      ["inactivo", 1, "Uno de los productos ya no está disponible."],
      ["harina", 11, 'No hay suficiente "Harina" para la cantidad pedida.'],
      ["no-existe", 1, "Uno de los productos ya no está disponible."],
    ];
    for (const [id, cantidad, msg] of casos) {
      const r = calcularPedidoPublico({
        items: [{ producto_id: id, cantidad }],
        productos,
        metodo: null,
        tasa: TASA,
        config: sinImpuestos,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe(msg);
    }
  });

  it("agrupa el mismo producto repetido antes de validar el stock", () => {
    const r = calcularPedidoPublico({
      items: [
        { producto_id: "harina", cantidad: 6 },
        { producto_id: "harina", cantidad: 5 },
      ],
      productos,
      metodo: null,
      tasa: TASA,
      config: sinImpuestos,
    });
    expect(r.ok).toBe(false);
  });
});
