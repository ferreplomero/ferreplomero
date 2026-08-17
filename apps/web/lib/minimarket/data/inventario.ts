/**
 * Capa de datos del módulo Inventario (lecturas).
 *
 * Aísla el acceso a datos: hoy lee de Supabase con el cliente autenticado del
 * servidor (RLS por tenant). Cuando se active PowerSync, esta capa podrá
 * resolverse desde la base local sin tocar la UI.
 *
 * El stock NO se almacena: se deriva de la vista `mm_v_stock` (suma del ledger
 * append-only `mm_movimientos_inventario`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  MmCategoria,
  MmMovTipo,
  MmProducto,
  MmProveedor,
  MmSucursal,
} from "@arkiteq/db";

type Client = SupabaseClient<Database>;

export interface StockPorSucursal {
  sucursal_id: string;
  stock_actual: number;
  stock_minimo: number;
  /** false = el producto nunca tuvo presencia en esta sucursal (sin fila en
   * mm_inventario ni movimientos) — se muestra "No disponible aquí". */
  disponible: boolean;
}

export interface ProductoConStock extends MmProducto {
  categoria_nombre: string | null;
  proveedor_nombre: string | null;
  /** Todos los códigos de barras del producto. */
  codigos: string[];
  /** Stock total del producto sumando todas las sucursales del tenant. */
  stock_actual: number;
  /** Stock mínimo configurado (suma por sucursal); null si no hay configuración. */
  stock_minimo: number | null;
  /** Si el stock actual está en o por debajo del mínimo configurado (> 0). */
  bajo_minimo: boolean;
  /** Desglose por sucursal — permite filtrar/mostrar sin recalcular en el servidor. */
  stockPorSucursal: StockPorSucursal[];
}

export interface InventarioResumen {
  totalProductos: number;
  activos: number;
  bajoMinimo: number;
  /** Valor del inventario a precio de venta (USD). */
  valorInventarioUsd: number;
  /** Valor del inventario a precio de compra/costo (USD). */
  valorCostoUsd: number;
}

/** Lista las categorías activas del tenant, ordenadas. */
export async function listCategorias(client: Client, tenantId: string): Promise<MmCategoria[]> {
  const { data, error } = await client
    .from("mm_categorias")
    .select("*")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  if (error) throw new Error(`No se pudieron cargar las categorías: ${error.message}`);
  return data ?? [];
}

/**
 * Lista los productos activos con su categoría, proveedor, códigos y stock.
 *
 * `sucursales` es la lista de sucursales PERMITIDAS del usuario que pide el
 * listado (ver `lib/minimarket/sucursal-acceso.ts`) — se usa solo para saber
 * sobre qué sucursales construir el desglose `stockPorSucursal` de cada
 * producto (así no aparecen sucursales ajenas como "no disponible" en vez de
 * simplemente no aparecer). El aislamiento real de los NÚMEROS de stock ya
 * lo impone RLS (migración 0111): aunque `mm_v_stock`/`mm_inventario` se
 * consulten sin filtro explícito de sucursal, Postgres nunca devuelve filas
 * de sucursales fuera del alcance del usuario.
 *
 * `sucursales` es opcional (default `[]`) para los llamadores que todavía no
 * están aislados por sucursal (Ventas, Presupuestos, exportar — fuera del
 * alcance de esta fase): sin la lista, el desglose `stockPorSucursal` de
 * cada producto queda vacío, pero los totales agregados (`stock_actual`,
 * `stock_minimo`, `bajo_minimo`) siguen siendo correctos porque ya vienen
 * filtrados por RLS, no por este parámetro.
 */
export async function listProductos(
  client: Client,
  tenantId: string,
  sucursales: { id: string }[] = [],
): Promise<ProductoConStock[]> {
  const [prodRes, catRes, provRes, codRes, stockRes, invRes] = await Promise.all([
    client
      .from("mm_productos")
      .select("*")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("nombre", { ascending: true }),
    client.from("mm_categorias").select("id, nombre").eq("tenant_id", tenantId),
    client.from("mm_proveedores").select("id, nombre").eq("tenant_id", tenantId),
    client.from("mm_producto_codigos").select("producto_id, codigo").eq("tenant_id", tenantId),
    client
      .from("mm_v_stock")
      .select("producto_id, sucursal_id, stock_actual")
      .eq("tenant_id", tenantId),
    client
      .from("mm_inventario")
      .select("producto_id, sucursal_id, stock_minimo")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null),
  ]);

  for (const res of [prodRes, catRes, provRes, codRes, stockRes, invRes]) {
    if (res.error) throw new Error(`No se pudo cargar el inventario: ${res.error.message}`);
  }

  const categorias = new Map((catRes.data ?? []).map((c) => [c.id, c.nombre]));
  const proveedores = new Map((provRes.data ?? []).map((p) => [p.id, p.nombre]));
  const sucursalIds = sucursales.map((s) => s.id);

  const codigosPorProducto = new Map<string, string[]>();
  for (const row of codRes.data ?? []) {
    const arr = codigosPorProducto.get(row.producto_id) ?? [];
    arr.push(row.codigo);
    codigosPorProducto.set(row.producto_id, arr);
  }

  // Claves compuestas `producto_id:sucursal_id` — permiten sumar el total por
  // producto (comportamiento agregado, sin cambios) y a la vez desglosar por
  // sucursal (nuevo) a partir de las MISMAS filas ya traídas, sin queries extra.
  const stockPorProducto = new Map<string, number>();
  const stockPorProductoSucursal = new Map<string, number>();
  for (const row of stockRes.data ?? []) {
    if (!row.producto_id || !row.sucursal_id) continue;
    const monto = Number(row.stock_actual ?? 0);
    stockPorProducto.set(row.producto_id, (stockPorProducto.get(row.producto_id) ?? 0) + monto);
    const key = `${row.producto_id}:${row.sucursal_id}`;
    stockPorProductoSucursal.set(key, (stockPorProductoSucursal.get(key) ?? 0) + monto);
  }

  const minimoPorProducto = new Map<string, number>();
  const minimoPorProductoSucursal = new Map<string, number>();
  const inventarioPresente = new Set<string>();
  for (const row of invRes.data ?? []) {
    const monto = Number(row.stock_minimo ?? 0);
    minimoPorProducto.set(row.producto_id, (minimoPorProducto.get(row.producto_id) ?? 0) + monto);
    const key = `${row.producto_id}:${row.sucursal_id}`;
    minimoPorProductoSucursal.set(key, monto);
    inventarioPresente.add(key);
  }

  const stockPresente = new Set(stockPorProductoSucursal.keys());

  return (prodRes.data ?? []).map((producto) => {
    const stock = stockPorProducto.get(producto.id) ?? 0;
    const minimo = minimoPorProducto.has(producto.id)
      ? (minimoPorProducto.get(producto.id) ?? 0)
      : null;
    const stockPorSucursal: StockPorSucursal[] = sucursalIds.map((sucursal_id) => {
      const key = `${producto.id}:${sucursal_id}`;
      return {
        sucursal_id,
        stock_actual: stockPorProductoSucursal.get(key) ?? 0,
        stock_minimo: minimoPorProductoSucursal.get(key) ?? 0,
        disponible: inventarioPresente.has(key) || stockPresente.has(key),
      };
    });
    return {
      ...producto,
      categoria_nombre: producto.categoria_id
        ? (categorias.get(producto.categoria_id) ?? null)
        : null,
      proveedor_nombre: producto.proveedor_id
        ? (proveedores.get(producto.proveedor_id) ?? null)
        : null,
      codigos: codigosPorProducto.get(producto.id) ?? [],
      stock_actual: stock,
      stock_minimo: minimo,
      bajo_minimo: minimo !== null && minimo > 0 && stock <= minimo,
      stockPorSucursal,
    };
  });
}

/** Lista los proveedores activos del tenant (para el selector del producto). */
export async function listProveedores(client: Client, tenantId: string): Promise<MmProveedor[]> {
  const { data, error } = await client
    .from("mm_proveedores")
    .select("*")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("nombre", { ascending: true });

  if (error) throw new Error(`No se pudieron cargar los proveedores: ${error.message}`);
  return data ?? [];
}

/** Siguiente correlativo de SKU del tenant (para autogenerar). */
export async function siguienteCorrelativoSku(client: Client, tenantId: string): Promise<number> {
  const { count } = await client
    .from("mm_productos")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  return (count ?? 0) + 1;
}

export interface StockSucursal {
  sucursal_id: string;
  sucursal_nombre: string;
  stock_actual: number;
  stock_minimo: number;
  /** false = el producto nunca tuvo presencia en esta sucursal. */
  disponible: boolean;
}

export interface PrecioHistorico {
  precio_usd: number;
  vigente_desde: string;
}

export interface ProductoDetalle {
  producto: ProductoConStock;
  stockPorSucursal: StockSucursal[];
  precios: PrecioHistorico[];
  movimientos: MovimientoConDetalle[];
}

/**
 * Carga el detalle completo de un producto: stock por sucursal + históricos.
 * `sucursales` es la lista de sucursales PERMITIDAS del usuario (mismo
 * criterio que `listProductos` — ver su comentario).
 */
export async function getProductoDetalle(
  client: Client,
  tenantId: string,
  productoId: string,
  sucursales: { id: string; nombre: string }[],
): Promise<ProductoDetalle | null> {
  const { data: prod, error: prodErr } = await client
    .from("mm_productos")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", productoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (prodErr) throw new Error(`No se pudo cargar el producto: ${prodErr.message}`);
  if (!prod) return null;

  const [catRes, provRes, codRes, stockRes, invRes, precioRes, movRes] = await Promise.all([
    prod.categoria_id
      ? client.from("mm_categorias").select("nombre").eq("id", prod.categoria_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    prod.proveedor_id
      ? client.from("mm_proveedores").select("nombre").eq("id", prod.proveedor_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    client
      .from("mm_producto_codigos")
      .select("codigo")
      .eq("tenant_id", tenantId)
      .eq("producto_id", productoId),
    client
      .from("mm_v_stock")
      .select("sucursal_id, stock_actual")
      .eq("tenant_id", tenantId)
      .eq("producto_id", productoId),
    client
      .from("mm_inventario")
      .select("sucursal_id, stock_minimo")
      .eq("tenant_id", tenantId)
      .eq("producto_id", productoId)
      .is("deleted_at", null),
    client
      .from("mm_precios")
      .select("precio_usd, vigente_desde")
      .eq("tenant_id", tenantId)
      .eq("producto_id", productoId)
      .order("vigente_desde", { ascending: false }),
    client
      .from("mm_movimientos_inventario")
      .select("id, tipo, cantidad, motivo, created_at, sucursal:mm_sucursales(nombre)")
      .eq("tenant_id", tenantId)
      .eq("producto_id", productoId)
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<
        {
          id: string;
          tipo: MmMovTipo;
          cantidad: number;
          motivo: string | null;
          created_at: string;
          sucursal: { nombre: string } | null;
        }[]
      >(),
  ]);

  const stockPorSuc = new Map<string, number>();
  const stockPresenteSuc = new Set<string>();
  for (const row of stockRes.data ?? []) {
    if (!row.sucursal_id) continue;
    stockPorSuc.set(row.sucursal_id, Number(row.stock_actual ?? 0));
    stockPresenteSuc.add(row.sucursal_id);
  }
  const minimoPorSuc = new Map<string, number>();
  const inventarioPresenteSuc = new Set<string>();
  for (const row of invRes.data ?? []) {
    minimoPorSuc.set(row.sucursal_id, Number(row.stock_minimo ?? 0));
    inventarioPresenteSuc.add(row.sucursal_id);
  }

  const stockPorSucursal: StockSucursal[] = sucursales.map((s) => ({
    sucursal_id: s.id,
    sucursal_nombre: s.nombre,
    stock_actual: stockPorSuc.get(s.id) ?? 0,
    stock_minimo: minimoPorSuc.get(s.id) ?? 0,
    disponible: inventarioPresenteSuc.has(s.id) || stockPresenteSuc.has(s.id),
  }));

  const stockTotal = stockPorSucursal.reduce((acc, s) => acc + s.stock_actual, 0);
  const minimoTotal = stockPorSucursal.reduce((acc, s) => acc + s.stock_minimo, 0);
  const codigos = (codRes.data ?? []).map((c) => c.codigo);

  const producto: ProductoConStock = {
    ...prod,
    categoria_nombre: (catRes.data as { nombre: string } | null)?.nombre ?? null,
    proveedor_nombre: (provRes.data as { nombre: string } | null)?.nombre ?? null,
    codigos,
    stock_actual: stockTotal,
    stock_minimo: minimoTotal > 0 ? minimoTotal : null,
    bajo_minimo: minimoTotal > 0 && stockTotal <= minimoTotal,
    stockPorSucursal: stockPorSucursal.map(
      ({ sucursal_id, stock_actual, stock_minimo, disponible }) => ({
        sucursal_id,
        stock_actual,
        stock_minimo,
        disponible,
      }),
    ),
  };

  return {
    producto,
    stockPorSucursal,
    precios: (precioRes.data ?? []).map((p) => ({
      precio_usd: Number(p.precio_usd),
      vigente_desde: p.vigente_desde,
    })),
    movimientos: (movRes.data ?? []).map((m) => ({
      id: m.id,
      tipo: m.tipo,
      cantidad: Number(m.cantidad),
      motivo: m.motivo,
      created_at: m.created_at,
      producto_nombre: prod.nombre,
      sucursal_nombre: m.sucursal?.nombre ?? "—",
    })),
  };
}

/** Lista las sucursales activas del tenant. */
export async function listSucursales(client: Client, tenantId: string): Promise<MmSucursal[]> {
  const { data, error } = await client
    .from("mm_sucursales")
    .select("*")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`No se pudieron cargar las sucursales: ${error.message}`);
  return data ?? [];
}

export interface MovimientoConDetalle {
  id: string;
  tipo: MmMovTipo;
  cantidad: number;
  motivo: string | null;
  created_at: string;
  producto_nombre: string;
  sucursal_nombre: string;
}

/** Lista el historial de movimientos de inventario (ledger), más recientes primero. */
export async function listMovimientos(
  client: Client,
  tenantId: string,
  opciones: { tipos?: MmMovTipo[]; limit?: number } = {},
): Promise<MovimientoConDetalle[]> {
  const limit = opciones.limit ?? 100;
  let query = client
    .from("mm_movimientos_inventario")
    .select(
      "id, tipo, cantidad, motivo, created_at, producto:mm_productos(nombre), sucursal:mm_sucursales(nombre)",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (opciones.tipos && opciones.tipos.length > 0) {
    query = query.in("tipo", opciones.tipos);
  }

  const { data, error } = await query.limit(limit).returns<
    {
      id: string;
      tipo: MmMovTipo;
      cantidad: number;
      motivo: string | null;
      created_at: string;
      producto: { nombre: string } | null;
      sucursal: { nombre: string } | null;
    }[]
  >();

  if (error) throw new Error(`No se pudieron cargar los movimientos: ${error.message}`);

  return (data ?? []).map((m) => ({
    id: m.id,
    tipo: m.tipo,
    cantidad: Number(m.cantidad),
    motivo: m.motivo,
    created_at: m.created_at,
    producto_nombre: m.producto?.nombre ?? "Producto eliminado",
    sucursal_nombre: m.sucursal?.nombre ?? "—",
  }));
}

/** Calcula indicadores resumidos del inventario a partir de la lista. */
export function resumirInventario(productos: ProductoConStock[]): InventarioResumen {
  return productos.reduce<InventarioResumen>(
    (acc, p) => {
      acc.totalProductos += 1;
      if (p.activo) acc.activos += 1;
      if (p.bajo_minimo) acc.bajoMinimo += 1;
      acc.valorInventarioUsd += Number(p.precio_usd) * p.stock_actual;
      acc.valorCostoUsd += Number(p.costo_usd) * p.stock_actual;
      return acc;
    },
    { totalProductos: 0, activos: 0, bajoMinimo: 0, valorInventarioUsd: 0, valorCostoUsd: 0 },
  );
}
