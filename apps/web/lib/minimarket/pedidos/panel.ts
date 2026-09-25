/**
 * Lecturas del panel "Pedidos" (usuario con sesión: RLS limita al tenant y a
 * sus sucursales — ver 0119).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MmPedidoFormaPago, MmPedidoPublicoEstado } from "@arkiteq/db";

type Client = SupabaseClient<Database>;

export const BUCKET_COMPROBANTES = "comprobantes-pedidos-publicos";

export interface PedidoFila {
  id: string;
  numero: number;
  fecha: string;
  sucursalNombre: string;
  clienteNombre: string;
  clienteTelefono: string;
  formaPago: MmPedidoFormaPago;
  metodo: string;
  totalUsd: number;
  totalBs: number;
  estado: MmPedidoPublicoEstado;
  ventaId: string | null;
  comprobanteUrl: string | null;
  /** Nombres de productos, para buscar por producto. */
  productos: string[];
}

/** URLs firmadas (1 h) de comprobantes del bucket privado. */
export async function urlsComprobantes(
  client: Client,
  paths: string[],
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data } = await client.storage.from(BUCKET_COMPROBANTES).createSignedUrls(paths, 3600);
  return new Map(
    (data ?? [])
      .filter((d): d is typeof d & { path: string; signedUrl: string } =>
        Boolean(d.path && d.signedUrl),
      )
      .map((d) => [d.path, d.signedUrl]),
  );
}

export async function listPedidos(client: Client, tenantId: string): Promise<PedidoFila[]> {
  const { data: pedidos } = await client
    .from("mm_pedidos_publicos")
    .select(
      "id, numero, created_at, sucursal_id, cliente_nombre, cliente_telefono, forma_pago, metodo_pago_elegido, total_usd, total_bs, estado, venta_id, comprobante_path",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(500);
  const lista = pedidos ?? [];
  if (lista.length === 0) return [];

  const ids = lista.map((p) => p.id);
  const [itemsRes, sucRes, urls] = await Promise.all([
    client
      .from("mm_pedidos_publicos_items")
      .select("pedido_id, producto_nombre")
      .eq("tenant_id", tenantId)
      .in("pedido_id", ids),
    client.from("mm_sucursales").select("id, nombre").eq("tenant_id", tenantId),
    urlsComprobantes(
      client,
      lista.map((p) => p.comprobante_path).filter((x): x is string => Boolean(x)),
    ),
  ]);
  const productosPorPedido = new Map<string, string[]>();
  for (const i of itemsRes.data ?? []) {
    const arr = productosPorPedido.get(i.pedido_id) ?? [];
    arr.push(i.producto_nombre);
    productosPorPedido.set(i.pedido_id, arr);
  }
  const sucursales = new Map((sucRes.data ?? []).map((s) => [s.id, s.nombre]));

  return lista.map((p) => ({
    id: p.id,
    numero: p.numero,
    fecha: p.created_at,
    sucursalNombre: sucursales.get(p.sucursal_id) ?? "",
    clienteNombre: p.cliente_nombre,
    clienteTelefono: p.cliente_telefono,
    formaPago: p.forma_pago,
    metodo: p.metodo_pago_elegido,
    totalUsd: Number(p.total_usd),
    totalBs: Number(p.total_bs),
    estado: p.estado,
    ventaId: p.venta_id,
    comprobanteUrl: p.comprobante_path ? (urls.get(p.comprobante_path) ?? null) : null,
    productos: productosPorPedido.get(p.id) ?? [],
  }));
}
