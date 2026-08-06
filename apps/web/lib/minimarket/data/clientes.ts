/**
 * Capa de datos del módulo Clientes y Fiado.
 *
 * El saldo nunca es un contador editable: se deriva del ledger append-only
 * (SUM fiados activos - SUM abonos). Esta misma lógica corre en Postgres
 * (vista mm_v_saldo_cliente) y en SQLite local (PowerSync) para garantizar
 * coherencia offline-first.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MmCliente, MmFiado } from "@arkiteq/db";
import type { RangoFechas } from "./reportes";
import { rangoLocalAUtc } from "../date-format";
import { getSaldoFavorCliente, getSaldosFavorClientes } from "./creditos";

type Client = SupabaseClient<Database>;

/** Días sin pago para considerar un cliente moroso. */
const DIAS_MOROSO = 30;

export interface ClienteConSaldo extends MmCliente {
  saldo_usd: number;
  /** ISO string del fiado abierto más antiguo; null si no tiene deuda activa. */
  primer_fiado_abierto_at: string | null;
  moroso: boolean;
  /** Saldo a favor del cliente (excedente acreditado en una venta) — relación
   * inversa a `saldo_usd` (deuda), completamente separada. */
  saldo_favor_usd: number;
}

export interface FiadoConVenta extends MmFiado {
  numero_documento: string | null;
  /** Fecha de la venta asociada. */
  fecha_venta: string | null;
}

export interface EntradaEstadoCuenta {
  tipo: "fiado" | "abono";
  id: string;
  created_at: string;
  monto_usd: number;
  /** Solo para abonos. */
  metodo?: string;
  igtf_usd?: number;
  /** Solo para fiados. */
  numero_documento?: string | null;
  /** Venta que originó el fiado, si tiene una asociada — para el acceso directo al recibo. */
  venta_id?: string | null;
  estado?: string;
  /** Solo para fiados sin venta asociada (ej. deuda importada) — descripción libre. */
  nota?: string | null;
  /** Saldo acumulado después de esta entrada (saldo corriente). */
  saldo_corriente: number;
}

export interface ResumenCartera {
  totalClientes: number;
  clientesConDeuda: number;
  clientesMorosos: number;
  totalCarteraUsd: number;
}

function esMoroso(primer_fiado_abierto_at: string | null): boolean {
  if (!primer_fiado_abierto_at) return false;
  const msDiff = Date.now() - new Date(primer_fiado_abierto_at).getTime();
  return msDiff > DIAS_MOROSO * 24 * 60 * 60 * 1000;
}

/** Lista todos los clientes activos del tenant con su saldo actual. */
export async function listClientes(client: Client, tenantId: string): Promise<ClienteConSaldo[]> {
  const { data: clientes, error: cErr } = await client
    .from("mm_clientes")
    .select("*")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("nombre", { ascending: true });

  if (cErr) throw new Error(`No se pudieron cargar los clientes: ${cErr.message}`);
  if (!clientes?.length) return [];

  const ids = clientes.map((c) => c.id);

  const [{ data: saldos, error: sErr }, saldoFavorMap] = await Promise.all([
    client
      .from("mm_v_saldo_cliente")
      .select("cliente_id, saldo_usd, primer_fiado_abierto_at")
      .in("cliente_id", ids),
    getSaldosFavorClientes(client, tenantId, ids),
  ]);

  if (sErr) throw new Error(`No se pudieron cargar los saldos: ${sErr.message}`);

  const saldoMap = new Map((saldos ?? []).map((s) => [s.cliente_id, s]));

  return clientes.map((c) => {
    const s = saldoMap.get(c.id);
    const saldo_usd = Number(s?.saldo_usd ?? 0);
    const primer = s?.primer_fiado_abierto_at ?? null;
    return {
      ...c,
      saldo_usd,
      primer_fiado_abierto_at: primer,
      moroso: esMoroso(primer),
      saldo_favor_usd: saldoFavorMap.get(c.id) ?? 0,
    };
  });
}

/** Devuelve un cliente con su saldo, o null si no existe. */
export async function getClienteConSaldo(
  client: Client,
  tenantId: string,
  clienteId: string,
): Promise<ClienteConSaldo | null> {
  const { data: c, error } = await client
    .from("mm_clientes")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", clienteId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(`No se pudo cargar el cliente: ${error.message}`);
  if (!c) return null;

  const [{ data: s }, saldo_favor_usd] = await Promise.all([
    client
      .from("mm_v_saldo_cliente")
      .select("saldo_usd, primer_fiado_abierto_at")
      .eq("cliente_id", clienteId)
      .maybeSingle(),
    getSaldoFavorCliente(client, tenantId, clienteId),
  ]);

  const saldo_usd = Number(s?.saldo_usd ?? 0);
  const primer = s?.primer_fiado_abierto_at ?? null;

  return {
    ...c,
    saldo_usd,
    primer_fiado_abierto_at: primer,
    moroso: esMoroso(primer),
    saldo_favor_usd,
  };
}

/** Construye el timeline de fiados y abonos para el estado de cuenta de un cliente. */
export async function getEstadoCuenta(
  client: Client,
  tenantId: string,
  clienteId: string,
): Promise<EntradaEstadoCuenta[]> {
  const [{ data: fiados }, { data: abonos }] = await Promise.all([
    client
      .from("mm_fiados")
      .select("id, created_at, monto_usd, estado, venta_id, nota")
      .eq("tenant_id", tenantId)
      .eq("cliente_id", clienteId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    client
      .from("mm_abonos_fiado")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: true }),
  ]);

  // Cargar los números de documento de las ventas asociadas a los fiados.
  const ventaIds = (fiados ?? []).map((f) => f.venta_id).filter((v): v is string => v !== null);

  const ventaNumeros = new Map<string, string | null>();
  if (ventaIds.length > 0) {
    const { data: ventas } = await client
      .from("mm_ventas")
      .select("id, numero_documento")
      .in("id", ventaIds);
    for (const v of ventas ?? []) {
      ventaNumeros.set(v.id, v.numero_documento);
    }
  }

  const entradas: Omit<EntradaEstadoCuenta, "saldo_corriente">[] = [];

  for (const f of fiados ?? []) {
    entradas.push({
      tipo: "fiado",
      id: f.id,
      created_at: f.created_at,
      monto_usd: Number(f.monto_usd),
      numero_documento: f.venta_id ? (ventaNumeros.get(f.venta_id) ?? null) : null,
      venta_id: f.venta_id,
      estado: f.estado,
      nota: f.nota,
    });
  }

  for (const a of abonos ?? []) {
    entradas.push({
      tipo: "abono",
      id: a.id,
      created_at: a.created_at,
      monto_usd: Number(a.monto_usd),
      metodo: a.metodo,
      igtf_usd: Number(a.igtf_usd ?? 0),
    });
  }

  entradas.sort((a, b) => a.created_at.localeCompare(b.created_at));

  let saldo = 0;
  return entradas.map((e) => {
    if (e.tipo === "fiado") saldo += e.monto_usd;
    else saldo -= e.monto_usd;
    return { ...e, saldo_corriente: Math.max(0, saldo) };
  });
}

/** Resumen de la cartera de cuentas por cobrar del negocio. */
export async function getResumenCartera(client: Client, tenantId: string): Promise<ResumenCartera> {
  const { data: saldos } = await client
    .from("mm_v_saldo_cliente")
    .select("cliente_id, saldo_usd, primer_fiado_abierto_at")
    .eq("tenant_id", tenantId);

  const rows = saldos ?? [];
  const conDeuda = rows.filter((r) => Number(r.saldo_usd ?? 0) > 0);
  const morosos = conDeuda.filter((r) => esMoroso(r.primer_fiado_abierto_at));

  return {
    totalClientes: rows.length,
    clientesConDeuda: conDeuda.length,
    clientesMorosos: morosos.length,
    totalCarteraUsd: conDeuda.reduce((s, r) => s + Number(r.saldo_usd ?? 0), 0),
  };
}

/** Lista los fiados abiertos de un cliente, del más antiguo al más reciente (FIFO). */
export async function getFiadosAbiertos(
  client: Client,
  tenantId: string,
  clienteId: string,
): Promise<MmFiado[]> {
  const { data, error } = await client
    .from("mm_fiados")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("cliente_id", clienteId)
    .eq("estado", "abierto")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`No se pudieron cargar los fiados: ${error.message}`);
  return data ?? [];
}

export interface ClienteRecurrente {
  cliente_id: string;
  nombre: string;
  num_compras: number;
  total_usd: number;
}

/** Top clientes por número de compras dentro del período (clientes más recurrentes, para el Tablero). */
export async function getClientesMasRecurrentes(
  client: Client,
  tenantId: string,
  rango: RangoFechas,
  tz: string,
  limit = 5,
): Promise<ClienteRecurrente[]> {
  const { desdeIso, hastaIso } = rangoLocalAUtc(rango, tz);
  const { data: ventas } = await client
    .from("mm_ventas")
    .select("cliente_id, total_usd")
    .eq("tenant_id", tenantId)
    .eq("estado", "completada")
    .not("cliente_id", "is", null)
    .gte("fecha", desdeIso)
    .lt("fecha", hastaIso)
    .is("deleted_at", null);

  if (!ventas?.length) return [];

  const mapa = new Map<string, { num_compras: number; total_usd: number }>();
  for (const v of ventas) {
    if (!v.cliente_id) continue;
    const entry = mapa.get(v.cliente_id) ?? { num_compras: 0, total_usd: 0 };
    entry.num_compras += 1;
    entry.total_usd += Number(v.total_usd);
    mapa.set(v.cliente_id, entry);
  }

  const ids = [...mapa.keys()];
  const { data: clientes } = await client
    .from("mm_clientes")
    .select("id, nombre")
    .in("id", ids)
    .eq("tenant_id", tenantId);
  const nombreMap = new Map((clientes ?? []).map((c) => [c.id, c.nombre]));

  return ids
    .map((id) => {
      const v = mapa.get(id);
      if (!v) return null;
      return {
        cliente_id: id,
        nombre: nombreMap.get(id) ?? "Cliente eliminado",
        num_compras: v.num_compras,
        total_usd: v.total_usd,
      };
    })
    .filter((x): x is ClienteRecurrente => x !== null)
    .sort((a, b) => b.num_compras - a.num_compras)
    .slice(0, limit);
}
