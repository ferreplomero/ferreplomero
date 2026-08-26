/**
 * Capa de datos de Transferencias de stock entre sucursales.
 *
 * El movimiento REAL de stock vive en `mm_movimientos_inventario` (salida en
 * origen + entrada en destino, ver `registrarTransferencia` en
 * `inventario/transferencias/actions.ts`) — estas dos tablas
 * (`mm_transferencias`/`mm_transferencias_items`) son solo el documento
 * legible para el historial.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MmTransferencia } from "@arkiteq/db";

type Client = SupabaseClient<Database>;

export interface TransferenciaConDetalle extends MmTransferencia {
  sucursal_origen_nombre: string | null;
  sucursal_destino_nombre: string | null;
  usuario_nombre: string | null;
  total_items: number;
  total_unidades: number;
}

export interface TransferenciaItemDetalle {
  id: string;
  producto_id: string | null;
  producto_nombre: string | null;
  producto_codigo: string | null;
  cantidad: number;
}

export interface TransferenciaConItems extends TransferenciaConDetalle {
  items: TransferenciaItemDetalle[];
}

/** Lista las transferencias del tenant, más recientes primero. */
export async function listTransferencias(
  client: Client,
  tenantId: string,
  limit = 100,
): Promise<TransferenciaConDetalle[]> {
  const { data: transferencias, error } = await client
    .from("mm_transferencias")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`No se pudieron cargar las transferencias: ${error.message}`);
  if (!transferencias?.length) return [];

  const ids = transferencias.map((t) => t.id);
  const sucIds = [
    ...new Set(transferencias.flatMap((t) => [t.sucursal_origen_id, t.sucursal_destino_id])),
  ];
  const usuarioIds = [
    ...new Set(transferencias.map((t) => t.usuario_id).filter(Boolean)),
  ] as string[];

  const [{ data: sucs }, { data: perfiles }, { data: items }] = await Promise.all([
    client.from("mm_sucursales").select("id, nombre").in("id", sucIds),
    usuarioIds.length
      ? client.from("profiles").select("id, full_name").in("id", usuarioIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    client
      .from("mm_transferencias_items")
      .select("transferencia_id, cantidad")
      .eq("tenant_id", tenantId)
      .in("transferencia_id", ids),
  ]);

  const sucMap = new Map((sucs ?? []).map((s) => [s.id, s.nombre]));
  const perfilMap = new Map((perfiles ?? []).map((p) => [p.id, p.full_name]));

  const resumenPorTransferencia = new Map<string, { items: number; unidades: number }>();
  for (const row of items ?? []) {
    const actual = resumenPorTransferencia.get(row.transferencia_id) ?? { items: 0, unidades: 0 };
    actual.items += 1;
    actual.unidades += Number(row.cantidad);
    resumenPorTransferencia.set(row.transferencia_id, actual);
  }

  return transferencias.map((t) => ({
    ...t,
    sucursal_origen_nombre: sucMap.get(t.sucursal_origen_id) ?? null,
    sucursal_destino_nombre: sucMap.get(t.sucursal_destino_id) ?? null,
    usuario_nombre: t.usuario_id ? (perfilMap.get(t.usuario_id) ?? null) : null,
    total_items: resumenPorTransferencia.get(t.id)?.items ?? 0,
    total_unidades: resumenPorTransferencia.get(t.id)?.unidades ?? 0,
  }));
}

/** Detalle de una transferencia con sus ítems. */
export async function getTransferenciaConItems(
  client: Client,
  tenantId: string,
  transferenciaId: string,
): Promise<TransferenciaConItems | null> {
  const { data: t, error } = await client
    .from("mm_transferencias")
    .select("*")
    .eq("id", transferenciaId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(`No se pudo cargar la transferencia: ${error.message}`);
  if (!t) return null;

  const [{ data: suc }, { data: perfil }, { data: items }] = await Promise.all([
    client
      .from("mm_sucursales")
      .select("id, nombre")
      .in("id", [t.sucursal_origen_id, t.sucursal_destino_id]),
    t.usuario_id
      ? client.from("profiles").select("full_name").eq("id", t.usuario_id).maybeSingle()
      : Promise.resolve({ data: null }),
    client
      .from("mm_transferencias_items")
      .select("id, producto_id, cantidad")
      .eq("tenant_id", tenantId)
      .eq("transferencia_id", transferenciaId),
  ]);

  const sucMap = new Map((suc ?? []).map((s) => [s.id, s.nombre]));

  const prodIds = (items ?? []).map((i) => i.producto_id).filter(Boolean) as string[];
  const { data: prods } = prodIds.length
    ? await client.from("mm_productos").select("id, nombre, codigo").in("id", prodIds)
    : { data: [] };
  const prodMap = new Map((prods ?? []).map((p) => [p.id, p]));

  const itemsDetalle: TransferenciaItemDetalle[] = (items ?? []).map((i) => {
    const prod = i.producto_id ? prodMap.get(i.producto_id) : undefined;
    return {
      id: i.id,
      producto_id: i.producto_id,
      producto_nombre: prod?.nombre ?? null,
      producto_codigo: prod?.codigo ?? null,
      cantidad: Number(i.cantidad),
    };
  });

  return {
    ...t,
    sucursal_origen_nombre: sucMap.get(t.sucursal_origen_id) ?? null,
    sucursal_destino_nombre: sucMap.get(t.sucursal_destino_id) ?? null,
    usuario_nombre: (perfil as { full_name: string | null } | null)?.full_name ?? null,
    total_items: itemsDetalle.length,
    total_unidades: itemsDetalle.reduce((s, i) => s + i.cantidad, 0),
    items: itemsDetalle,
  };
}
