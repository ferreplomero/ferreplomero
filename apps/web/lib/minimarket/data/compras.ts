/**
 * Capa de datos del módulo Compras y Proveedores.
 *
 * Al confirmar una compra (borrador → recibida) el stock se suma a través de
 * mm_movimientos_inventario (ledger append-only). El costo del producto se
 * actualiza en mm_productos y se archiva el histórico en mm_precios.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MmCompra, MmCompraEstado, MmCompraItem, MmProveedor } from "@arkiteq/db";
import { fetchAllRows } from "./pagination";

type Client = SupabaseClient<Database>;

export interface ProveedorConStats extends MmProveedor {
  num_compras: number;
  total_comprado_usd: number;
  ultima_compra: string | null;
  num_productos: number;
}

export interface CompraConProveedor extends MmCompra {
  proveedor_nombre: string | null;
  sucursal_nombre: string | null;
}

export interface CompraConItems extends CompraConProveedor {
  items: ItemDetalle[];
}

export interface ItemDetalle extends MmCompraItem {
  producto_nombre: string | null;
  producto_codigo: string | null;
}

export interface ResumenCompras {
  totalCompras: number;
  comprasPendientes: number;
  totalCompradoUsd: number;
}

// ---------------------------------------------------------------------------

/** Lista proveedores activos con sus estadísticas de compra. */
export async function listProveedores(
  client: Client,
  tenantId: string,
): Promise<ProveedorConStats[]> {
  const [{ data: provs, error }, { data: stats }, prods] = await Promise.all([
    client
      .from("mm_proveedores")
      .select("*")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("nombre", { ascending: true }),
    client
      .from("mm_v_resumen_proveedor")
      .select("proveedor_id, num_compras, total_comprado_usd, ultima_compra")
      .eq("tenant_id", tenantId),
    // Catálogo completo del tenant — puede superar las 1000 filas por
    // defecto de PostgREST, así que se pagina en vez de un `.select()` plano.
    fetchAllRows<{ id: string; proveedor_id: string | null }>((from, to) =>
      client
        .from("mm_productos")
        .select("id, proveedor_id")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);

  if (error) throw new Error(`No se pudieron cargar los proveedores: ${error.message}`);

  const statsMap = new Map((stats ?? []).map((s) => [s.proveedor_id, s]));
  const prodCount = new Map<string, number>();
  for (const p of prods) {
    if (p.proveedor_id) prodCount.set(p.proveedor_id, (prodCount.get(p.proveedor_id) ?? 0) + 1);
  }

  return (provs ?? []).map((p) => {
    const s = statsMap.get(p.id);
    return {
      ...p,
      num_compras: Number(s?.num_compras ?? 0),
      total_comprado_usd: Number(s?.total_comprado_usd ?? 0),
      ultima_compra: s?.ultima_compra ?? null,
      num_productos: prodCount.get(p.id) ?? 0,
    };
  });
}

/** Un proveedor con sus stats, o null si no existe. */
export async function getProveedorConStats(
  client: Client,
  tenantId: string,
  proveedorId: string,
): Promise<ProveedorConStats | null> {
  const [{ data: p, error }, { data: s }, { data: prods }] = await Promise.all([
    client
      .from("mm_proveedores")
      .select("*")
      .eq("id", proveedorId)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .maybeSingle(),
    client
      .from("mm_v_resumen_proveedor")
      .select("num_compras, total_comprado_usd, ultima_compra")
      .eq("proveedor_id", proveedorId)
      .maybeSingle(),
    client
      .from("mm_productos")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("proveedor_id", proveedorId)
      .is("deleted_at", null),
  ]);

  if (error) throw new Error(`No se pudo cargar el proveedor: ${error.message}`);
  if (!p) return null;

  return {
    ...p,
    num_compras: Number(s?.num_compras ?? 0),
    total_comprado_usd: Number(s?.total_comprado_usd ?? 0),
    ultima_compra: s?.ultima_compra ?? null,
    num_productos: prods?.length ?? 0,
  };
}

/** Lista de compras con nombre de proveedor y sucursal. */
export async function listCompras(
  client: Client,
  tenantId: string,
  filtros?: { estado?: MmCompraEstado; proveedorId?: string; pagada?: boolean },
): Promise<CompraConProveedor[]> {
  let q = client
    .from("mm_compras")
    .select("*")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (filtros?.estado) q = q.eq("estado", filtros.estado);
  if (filtros?.proveedorId) q = q.eq("proveedor_id", filtros.proveedorId);
  if (filtros?.pagada !== undefined) q = q.eq("pagada", filtros.pagada);

  const { data: compras, error } = await q;
  if (error) throw new Error(`No se pudieron cargar las compras: ${error.message}`);
  if (!compras?.length) return [];

  const provIds = [...new Set(compras.map((c) => c.proveedor_id).filter(Boolean))] as string[];
  const sucIds = [...new Set(compras.map((c) => c.sucursal_id))];

  const [{ data: provs }, { data: sucs }] = await Promise.all([
    provIds.length
      ? client.from("mm_proveedores").select("id, nombre").in("id", provIds)
      : { data: [] },
    client.from("mm_sucursales").select("id, nombre").in("id", sucIds),
  ]);

  const provMap = new Map((provs ?? []).map((p) => [p.id, p.nombre]));
  const sucMap = new Map((sucs ?? []).map((s) => [s.id, s.nombre]));

  return compras.map((c) => ({
    ...c,
    proveedor_nombre: c.proveedor_id ? (provMap.get(c.proveedor_id) ?? null) : null,
    sucursal_nombre: sucMap.get(c.sucursal_id) ?? null,
  }));
}

/** Detalle de una compra con sus ítems. */
export async function getCompraConItems(
  client: Client,
  tenantId: string,
  compraId: string,
): Promise<CompraConItems | null> {
  const { data: c, error } = await client
    .from("mm_compras")
    .select("*")
    .eq("id", compraId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(`No se pudo cargar la compra: ${error.message}`);
  if (!c) return null;

  const [{ data: items }, { data: prov }, { data: suc }] = await Promise.all([
    client
      .from("mm_compras_items")
      .select("*")
      .eq("compra_id", compraId)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null),
    c.proveedor_id
      ? client.from("mm_proveedores").select("nombre").eq("id", c.proveedor_id).maybeSingle()
      : { data: null },
    client.from("mm_sucursales").select("nombre").eq("id", c.sucursal_id).maybeSingle(),
  ]);

  const prodIds = (items ?? []).map((i) => i.producto_id).filter(Boolean) as string[];
  const { data: prods } = prodIds.length
    ? await client.from("mm_productos").select("id, nombre, codigo").in("id", prodIds)
    : { data: [] };

  const prodMap = new Map((prods ?? []).map((p) => [p.id, p]));

  const itemsDetalle: ItemDetalle[] = (items ?? []).map((i) => {
    const prod = i.producto_id ? prodMap.get(i.producto_id) : undefined;
    return {
      ...i,
      producto_nombre: prod?.nombre ?? null,
      producto_codigo: prod?.codigo ?? null,
    };
  });

  return {
    ...c,
    proveedor_nombre: (prov as { nombre: string } | null)?.nombre ?? null,
    sucursal_nombre: (suc as { nombre: string } | null)?.nombre ?? null,
    items: itemsDetalle,
  };
}

/** Resumen para las tarjetas de cabecera. */
export async function getResumenCompras(client: Client, tenantId: string): Promise<ResumenCompras> {
  const { data } = await client
    .from("mm_compras")
    .select("id, estado, total_usd")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null);

  const rows = data ?? [];
  const recibidas = rows.filter((r) => r.estado === "recibida");

  return {
    totalCompras: rows.length,
    comprasPendientes: rows.filter((r) => r.estado === "borrador").length,
    totalCompradoUsd: recibidas.reduce((s, r) => s + Number(r.total_usd), 0),
  };
}

/** Productos que surte un proveedor (derivado de mm_productos.proveedor_id). */
export async function getProductosDelProveedor(
  client: Client,
  tenantId: string,
  proveedorId: string,
): Promise<{ id: string; nombre: string; codigo: string | null; costo_usd: number }[]> {
  const { data, error } = await client
    .from("mm_productos")
    .select("id, nombre, codigo, costo_usd")
    .eq("tenant_id", tenantId)
    .eq("proveedor_id", proveedorId)
    .is("deleted_at", null)
    .order("nombre", { ascending: true });

  if (error) throw new Error(`No se pudieron cargar los productos: ${error.message}`);
  return (data ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    codigo: p.codigo,
    costo_usd: Number(p.costo_usd ?? 0),
  }));
}

/** Compras de un proveedor específico. */
export async function listComprasDeProveedor(
  client: Client,
  tenantId: string,
  proveedorId: string,
): Promise<CompraConProveedor[]> {
  return listCompras(client, tenantId, { proveedorId });
}
