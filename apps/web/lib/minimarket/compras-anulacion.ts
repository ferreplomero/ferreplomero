/**
 * Lógica pura para anular una compra YA RECIBIDA (ver `anularCompra` en
 * `compras/actions.ts`): qué stock hay que sacar, si alcanza, y qué
 * costos/precios se pueden restaurar sin pisar un cambio posterior.
 */

export interface MovimientoCompra {
  producto_id: string;
  sucursal_id: string;
  tipo: string;
  cantidad: number;
}

export interface StockSucursal {
  producto_id: string;
  sucursal_id: string;
  stock_actual: number;
}

export interface SalidaAnulacion {
  producto_id: string;
  sucursal_id: string;
  cantidad: number;
}

export interface FaltanteStock extends SalidaAnulacion {
  /** Stock que queda hoy en esa sucursal (menor que lo que hay que sacar). */
  disponible: number;
}

const EPS = 0.001;

/**
 * Neto que esta compra dejó en inventario por (producto, sucursal): sus
 * entradas menos cualquier salida ya hecha con la misma referencia. Es lo que
 * la anulación debe sacar.
 */
export function salidasParaAnular(movimientos: MovimientoCompra[]): SalidaAnulacion[] {
  const neto = new Map<string, SalidaAnulacion>();
  for (const m of movimientos) {
    const signo = m.tipo === "entrada" ? 1 : m.tipo === "salida" ? -1 : 0;
    if (signo === 0) continue;
    const clave = `${m.producto_id}|${m.sucursal_id}`;
    const actual = neto.get(clave) ?? {
      producto_id: m.producto_id,
      sucursal_id: m.sucursal_id,
      cantidad: 0,
    };
    actual.cantidad += signo * Number(m.cantidad);
    neto.set(clave, actual);
  }
  return [...neto.values()]
    .map((s) => ({ ...s, cantidad: Math.round(s.cantidad * 1000) / 1000 }))
    .filter((s) => s.cantidad > EPS);
}

/** Salidas que dejarían el stock de su sucursal en negativo (ya se vendió parte). */
export function faltantesStockParaAnular(
  salidas: SalidaAnulacion[],
  stock: StockSucursal[],
): FaltanteStock[] {
  const disponible = new Map<string, number>();
  for (const s of stock) {
    const clave = `${s.producto_id}|${s.sucursal_id}`;
    disponible.set(clave, (disponible.get(clave) ?? 0) + Number(s.stock_actual));
  }
  return salidas
    .map((s) => ({ ...s, disponible: disponible.get(`${s.producto_id}|${s.sucursal_id}`) ?? 0 }))
    .filter((s) => s.cantidad - s.disponible > EPS);
}

export interface CostoAplicado {
  producto_id: string;
  costo_anterior: number;
  precio_anterior: number;
  costo_nuevo: number;
  precio_nuevo: number;
}

export interface ProductoActual {
  id: string;
  costo_usd: number;
  precio_usd: number;
}

function aNumero(v: unknown): number | null {
  if (typeof v !== "number" && (typeof v !== "string" || v.trim() === "")) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normaliza `mm_compras.costos_aplicados` (jsonb). `null` = compra vieja sin el dato. */
export function parsearCostosAplicados(raw: unknown): CostoAplicado[] | null {
  if (!Array.isArray(raw)) return null;
  const out: CostoAplicado[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.producto_id !== "string") continue;
    const [costoAnterior, precioAnterior, costoNuevo, precioNuevo] = [
      o.costo_anterior,
      o.precio_anterior,
      o.costo_nuevo,
      o.precio_nuevo,
    ].map(aNumero);
    if (
      costoAnterior == null ||
      precioAnterior == null ||
      costoNuevo == null ||
      precioNuevo == null
    ) {
      continue;
    }
    out.push({
      producto_id: o.producto_id,
      costo_anterior: costoAnterior,
      precio_anterior: precioAnterior,
      costo_nuevo: costoNuevo,
      precio_nuevo: precioNuevo,
    });
  }
  return out;
}

/**
 * Separa los costos que esta compra cambió en: `restaurables` (el producto
 * sigue con el costo y precio que dejó esta compra — nadie lo tocó después) y
 * `aRevisar` (cambió después: restaurarlo pisaría ese cambio). Un producto
 * eliminado no aparece en ninguno.
 */
export function costosARestaurar(
  costosAplicados: CostoAplicado[],
  productos: ProductoActual[],
): { restaurables: CostoAplicado[]; aRevisar: CostoAplicado[] } {
  const porId = new Map(productos.map((p) => [p.id, p]));
  const restaurables: CostoAplicado[] = [];
  const aRevisar: CostoAplicado[] = [];
  for (const c of costosAplicados) {
    const p = porId.get(c.producto_id);
    if (!p) continue;
    const intacto =
      Math.abs(Number(p.costo_usd) - c.costo_nuevo) <= EPS &&
      Math.abs(Number(p.precio_usd) - c.precio_nuevo) <= EPS;
    (intacto ? restaurables : aRevisar).push(c);
  }
  return { restaurables, aRevisar };
}
