/**
 * Cálculo de un pedido del catálogo público. Puro (sin BD): recibe los
 * productos reales ya leídos en el servidor y NUNCA confía en precios ni
 * totales enviados por el navegador.
 *
 * No hay fórmulas propias: reutiliza exactamente las del POS —
 *  - precio = `mm_productos.precio_usd` (mismo criterio que `registrarVenta`),
 *  - base de IVA con `subtotalNetoGravado`, base de IGTF con `subtotalNetoSujetoIgtf`,
 *  - monto que cubre el total con un único pago del método elegido con
 *    `calcularMontoSaldo` (despeje del IGTF al céntimo, el mismo botón
 *    "← saldo" del cobro del POS), y totales finales con `computeCobro`.
 * Así el total del pedido es idéntico al que el POS cobraría por la misma
 * canasta con el mismo método, y `registrarVenta` lo reproduce al validarlo.
 */
import type { MmMetodoPago } from "@arkiteq/db";
import {
  calcularMontoSaldo,
  computeCobro,
  subtotalNetoGravado,
  subtotalNetoSujetoIgtf,
} from "@/lib/minimarket/pos-calc";

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ProductoParaPedido {
  id: string;
  nombre: string;
  precio_usd: number;
  impuesto_id: string;
  aplica_igtf: boolean;
  activo: boolean;
  deleted_at: string | null;
  /** ¿El producto está habilitado en la sucursal del catálogo? (mm_inventario / mm_v_stock) */
  presenteEnSucursal: boolean;
  /** Stock real en la sucursal (mm_v_stock). */
  stock: number;
}

export interface ItemPedidoInput {
  producto_id: string;
  cantidad: number;
}

export interface ConfigImpuestos {
  igtfActivo: boolean;
  ivaActivo: boolean;
  ivaPct: number;
}

export interface LineaPedido {
  producto_id: string;
  nombre: string;
  cantidad: number;
  precioUsd: number;
  totalUsd: number;
  exenta: boolean;
}

export interface TotalesPedido {
  lineas: LineaPedido[];
  subtotalUsd: number;
  ivaUsd: number;
  igtfUsd: number;
  totalUsd: number;
  totalBs: number;
  tasa: number;
  /** Monto a pagar en la moneda nativa del método (USD para Zelle/efectivo USD, Bs para el resto). */
  montoMetodo: number | null;
  /** Bases de IVA e IGTF (para reproducir el cobro con `computeCobro` con otro monto recibido). */
  subtotalGravado: number;
  subtotalSujetoIgtf: number;
}

export type ResultadoPedido =
  ({ ok: true } & TotalesPedido) | { ok: false; error: string; faltantes: string[] };

export function calcularPedidoPublico(params: {
  items: ItemPedidoInput[];
  productos: ReadonlyMap<string, ProductoParaPedido>;
  /** Método real con el que se pagará; null = aún no elegido (sin IGTF). */
  metodo: MmMetodoPago | null;
  tasa: number;
  config: ConfigImpuestos;
}): ResultadoPedido {
  const { items, productos, metodo, tasa, config } = params;
  if (items.length === 0) return { ok: false, error: "Tu carrito está vacío.", faltantes: [] };
  if (!(tasa > 0)) {
    return { ok: false, error: "El negocio aún no tiene tasa del día.", faltantes: [] };
  }

  // Agrupa por producto (el mismo producto repetido suma cantidades).
  const cantidades = new Map<string, number>();
  for (const i of items) {
    cantidades.set(i.producto_id, (cantidades.get(i.producto_id) ?? 0) + i.cantidad);
  }

  const lineas: LineaPedido[] = [];
  const faltantes: string[] = [];
  let primerError: string | null = null;
  for (const [productoId, cantidad] of cantidades) {
    const p = productos.get(productoId);
    if (!p || !p.activo || p.deleted_at !== null) {
      primerError ??= "Uno de los productos ya no está disponible.";
      faltantes.push(p?.nombre ?? "Producto no disponible");
      continue;
    }
    if (!p.presenteEnSucursal) {
      primerError ??= `"${p.nombre}" ya no está disponible en esta sucursal.`;
      faltantes.push(p.nombre);
      continue;
    }
    if (p.stock <= 0) {
      primerError ??= `"${p.nombre}" está agotado.`;
      faltantes.push(p.nombre);
      continue;
    }
    if (cantidad > p.stock) {
      primerError ??= `No hay suficiente "${p.nombre}" para la cantidad pedida.`;
      faltantes.push(p.nombre);
      continue;
    }
    const precio = Number(p.precio_usd);
    lineas.push({
      producto_id: p.id,
      nombre: p.nombre,
      cantidad,
      precioUsd: precio,
      totalUsd: round2(precio * cantidad),
      exenta: p.impuesto_id === "exento",
    });
  }
  if (primerError) return { ok: false, error: primerError, faltantes };

  const subtotalNeto = round2(lineas.reduce((s, l) => s + l.totalUsd, 0));
  const subtotalGravado = subtotalNetoGravado(
    lineas.map((l) => ({ totalUsd: l.totalUsd, impuestoId: l.exenta ? "exento" : "iva" })),
    0,
  );
  const subtotalSujetoIgtf = subtotalNetoSujetoIgtf(
    lineas.map((l) => ({
      totalUsd: l.totalUsd,
      aplicaIgtf: productos.get(l.producto_id)?.aplica_igtf ?? true,
    })),
    0,
  );

  const montoTexto = metodo
    ? calcularMontoSaldo(
        [{ key: "pedido", metodo, monto: "" }],
        "pedido",
        subtotalNeto,
        tasa,
        config.igtfActivo,
        config.ivaActivo,
        config.ivaPct,
        0,
        subtotalGravado,
        subtotalSujetoIgtf,
      )
    : null;

  const cobro = computeCobro({
    pagos: metodo && montoTexto ? [{ metodo, monto: montoTexto }] : [],
    subtotalNeto,
    tasa,
    cantidadLineas: lineas.length,
    clienteId: null,
    igtfActivo: config.igtfActivo,
    ivaActivo: config.ivaActivo,
    ivaPct: config.ivaPct,
    subtotalGravado,
    subtotalSujetoIgtf,
  });

  return {
    ok: true,
    lineas,
    subtotalUsd: subtotalNeto,
    ivaUsd: cobro.ivaUsd,
    igtfUsd: cobro.igtf,
    totalUsd: cobro.totalUsd,
    totalBs: cobro.totalBs,
    tasa,
    montoMetodo: montoTexto !== null ? Number(montoTexto) : null,
    subtotalGravado,
    subtotalSujetoIgtf,
  };
}
