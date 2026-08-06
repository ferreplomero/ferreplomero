/**
 * Capa de datos del módulo Presupuestos (cotizaciones).
 *
 * Un presupuesto es una OFERTA de precios al cliente, NO una venta: mientras
 * está `pendiente` no descuenta inventario, no registra dinero y no genera
 * fiado. Solo se convierte en una venta real a través del flujo normal del
 * POS (ver `prepararConversionPresupuesto` en `presupuestos/actions.ts` y la
 * hidratación del carrito en `pos-cliente.tsx`).
 *
 * "vencido" NO es un estado guardado: se calcula aquí comparando
 * `validez_hasta` con la fecha de hoy, igual que "vencida" en
 * `lib/minimarket/data/deudas.ts` y "moroso" en clientes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MmPresupuestoEstado, MmTipoTasa } from "@arkiteq/db";
import { hoyEnTz } from "../date-format";

type Client = SupabaseClient<Database>;

export interface PresupuestoItem {
  id: string;
  productoId: string;
  descripcion: string;
  cantidad: number;
  precioListaUsd: number;
  precioUnitarioUsd: number;
  precioAjustado: boolean;
  subtotalUsd: number;
}

export interface PresupuestoResumen {
  id: string;
  numero: string;
  clienteId: string | null;
  clienteNombre: string | null;
  fechaEmision: string;
  validezHasta: string;
  estado: MmPresupuestoEstado;
  /** Calculado: `estado === 'pendiente'` y `validezHasta` ya pasó. */
  vencido: boolean;
  totalUsd: number;
  totalBs: number;
  ventaId: string | null;
}

export interface PresupuestoDetalle extends PresupuestoResumen {
  sucursalId: string;
  clienteNombreManual: string | null;
  clienteCedulaManual: string | null;
  clienteTelefonoManual: string | null;
  clienteCedula: string | null;
  clienteTelefono: string | null;
  clienteWhatsapp: string | null;
  tasaTipo: MmTipoTasa;
  tasaUsada: number;
  subtotalUsd: number;
  ivaUsd: number;
  notas: string | null;
  usuarioId: string | null;
  items: PresupuestoItem[];
}

export interface FiltrosPresupuesto {
  estado?: "pendiente" | "vencido" | "convertido" | "rechazado";
  clienteId?: string;
  desde?: string;
  hasta?: string;
}

/** ¿Este presupuesto debe mostrarse como "vencido"? Nunca se guarda, se calcula. */
export function esPresupuestoVencido(
  estado: MmPresupuestoEstado,
  validezHasta: string,
  hoy: string,
): boolean {
  return estado === "pendiente" && validezHasta < hoy;
}

/** Prefijo fijo de todo número de presupuesto — no editable por el usuario,
 * solo la parte numérica lo es (ver `presupuesto-form.tsx`). */
export const PREFIJO_NUMERO_PRESUPUESTO = "P-";

const REGEX_NUMERO_PRESUPUESTO = /^P-(\d{6,})$/;

/** Extrae la parte numérica de un número de presupuesto ("P-000045" -> 45), o `null` si no tiene el formato esperado. */
export function numeroPresupuestoAEntero(numero: string): number | null {
  const m = REGEX_NUMERO_PRESUPUESTO.exec(numero);
  return m?.[1] ? parseInt(m[1], 10) : null;
}

/**
 * Siguiente número de presupuesto SUGERIDO: siempre el mayor número ya
 * asignado (automático o escrito a mano por el usuario) + 1. Así, si el
 * negocio viene de otro sistema y continúa su numeración escribiendo, por
 * ejemplo, "P-000045" al crear un presupuesto, el siguiente sugerido pasa a
 * ser "P-000046" de inmediato — la secuencia SIEMPRE avanza desde el último
 * número usado, sin importar cuántos presupuestos existan en total (ya no es
 * un conteo de filas). Incluye presupuestos eliminados en el cálculo del
 * máximo: un número ya usado, aunque su presupuesto se haya borrado después,
 * nunca debe volver a sugerirse (evita confusión aunque sí pueda reutilizarse
 * a mano, ver `numeroPresupuestoDisponible`).
 */
export async function siguienteNumeroPresupuesto(
  client: Client,
  tenantId: string,
): Promise<string> {
  const { data } = await client.from("mm_presupuestos").select("numero").eq("tenant_id", tenantId);
  let max = 0;
  for (const row of data ?? []) {
    const n = numeroPresupuestoAEntero(row.numero);
    if (n !== null && n > max) max = n;
  }
  return `${PREFIJO_NUMERO_PRESUPUESTO}${String(max + 1).padStart(6, "0")}`;
}

/**
 * ¿Está disponible este número exacto para un presupuesto nuevo? Mismo
 * alcance que el índice único `mm_presupuestos_tenant_numero_key` (0102): un
 * número de un presupuesto YA ELIMINADO sí puede reutilizarse — solo bloquea
 * uno que ya está en uso por un presupuesto vigente.
 */
export async function numeroPresupuestoDisponible(
  client: Client,
  tenantId: string,
  numero: string,
): Promise<boolean> {
  const { data } = await client
    .from("mm_presupuestos")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("numero", numero)
    .is("deleted_at", null)
    .maybeSingle();
  return !data;
}

/** Lista los presupuestos del tenant (más recientes primero) con filtros opcionales. */
export async function listPresupuestos(
  client: Client,
  tenantId: string,
  tz: string,
  filtros: FiltrosPresupuesto = {},
): Promise<PresupuestoResumen[]> {
  let query = client
    .from("mm_presupuestos")
    .select(
      "id, numero, cliente_id, cliente_nombre_manual, fecha_emision, validez_hasta, estado, total_usd, total_bs, venta_id, created_at",
    )
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (filtros.clienteId) query = query.eq("cliente_id", filtros.clienteId);
  if (filtros.desde) query = query.gte("fecha_emision", filtros.desde);
  if (filtros.hasta) query = query.lte("fecha_emision", filtros.hasta);
  if (filtros.estado && filtros.estado !== "vencido") {
    query = query.eq("estado", filtros.estado);
  }

  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron cargar los presupuestos: ${error.message}`);

  const clienteIds = [
    ...new Set((data ?? []).map((p) => p.cliente_id).filter((id): id is string => !!id)),
  ];
  const { data: clientes } =
    clienteIds.length > 0
      ? await client.from("mm_clientes").select("id, nombre").in("id", clienteIds)
      : { data: [] as { id: string; nombre: string }[] };
  const nombrePorCliente = new Map((clientes ?? []).map((c) => [c.id, c.nombre]));

  const hoy = hoyEnTz(tz);

  const resultado: PresupuestoResumen[] = (data ?? []).map((p) => ({
    id: p.id,
    numero: p.numero,
    clienteId: p.cliente_id,
    clienteNombre: p.cliente_id
      ? (nombrePorCliente.get(p.cliente_id) ?? null)
      : (p.cliente_nombre_manual ?? null),
    fechaEmision: p.fecha_emision,
    validezHasta: p.validez_hasta,
    estado: p.estado,
    vencido: esPresupuestoVencido(p.estado, p.validez_hasta, hoy),
    totalUsd: Number(p.total_usd),
    totalBs: Number(p.total_bs),
    ventaId: p.venta_id,
  }));

  if (filtros.estado === "vencido") return resultado.filter((p) => p.vencido);
  return resultado;
}

/** Carga el detalle completo de un presupuesto (cabecera + ítems), o null si no existe. */
export async function getPresupuestoDetalle(
  client: Client,
  tenantId: string,
  presupuestoId: string,
  tz: string,
): Promise<PresupuestoDetalle | null> {
  const { data: p, error } = await client
    .from("mm_presupuestos")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", presupuestoId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(`No se pudo cargar el presupuesto: ${error.message}`);
  if (!p) return null;

  const [{ data: items, error: itemsError }, clienteRes] = await Promise.all([
    client
      .from("mm_presupuestos_items")
      .select("*")
      .eq("presupuesto_id", presupuestoId)
      .order("created_at", { ascending: true }),
    p.cliente_id
      ? client
          .from("mm_clientes")
          .select("nombre, cedula, telefono, whatsapp")
          .eq("id", p.cliente_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (itemsError) throw new Error(`No se pudieron cargar los ítems: ${itemsError.message}`);

  const hoy = hoyEnTz(tz);
  const cliente = clienteRes.data;

  return {
    id: p.id,
    numero: p.numero,
    sucursalId: p.sucursal_id,
    clienteId: p.cliente_id,
    clienteNombre: p.cliente_id ? (cliente?.nombre ?? null) : (p.cliente_nombre_manual ?? null),
    clienteNombreManual: p.cliente_nombre_manual,
    clienteCedulaManual: p.cliente_cedula_manual,
    clienteTelefonoManual: p.cliente_telefono_manual,
    clienteCedula: cliente?.cedula ?? p.cliente_cedula_manual ?? null,
    clienteTelefono: cliente?.telefono ?? p.cliente_telefono_manual ?? null,
    clienteWhatsapp: cliente?.whatsapp ?? null,
    fechaEmision: p.fecha_emision,
    validezHasta: p.validez_hasta,
    tasaTipo: p.tasa_tipo as MmTipoTasa,
    tasaUsada: Number(p.tasa_usada),
    subtotalUsd: Number(p.subtotal_usd),
    ivaUsd: Number(p.iva_usd),
    totalUsd: Number(p.total_usd),
    totalBs: Number(p.total_bs),
    estado: p.estado,
    vencido: esPresupuestoVencido(p.estado, p.validez_hasta, hoy),
    ventaId: p.venta_id,
    notas: p.notas,
    usuarioId: p.usuario_id,
    items: (items ?? []).map((i) => ({
      id: i.id,
      productoId: i.producto_id,
      descripcion: i.descripcion,
      cantidad: Number(i.cantidad),
      precioListaUsd: Number(i.precio_lista_usd),
      precioUnitarioUsd: Number(i.precio_unitario_usd),
      precioAjustado: i.precio_ajustado,
      subtotalUsd: Number(i.subtotal_usd),
    })),
  };
}
