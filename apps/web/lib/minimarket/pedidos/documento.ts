/**
 * Modelo del recibo de un pedido del catálogo público (`PedidoReciboDocumento`).
 * Solo refleja lo guardado en el pedido (snapshot informativo) — la venta real,
 * si existe, tiene su propio recibo de venta.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MmPedidoFormaPago, MmPedidoPublicoEstado } from "@arkiteq/db";

type Client = SupabaseClient<Database>;

export const ESTADO_PEDIDO_LABEL: Record<MmPedidoPublicoEstado, string> = {
  pendiente: "Pendiente de aprobación",
  pago_reportado: "Pago por verificar",
  para_pagar_local: "Confirmado — listo para retirar y pagar en el local",
  aceptado_validado: "Confirmado — listo para retirar",
  rechazado: "Rechazado",
  completado: "Entregado",
};

/** Colores del distintivo de estado en el panel. */
export const ESTADO_PEDIDO_BADGE: Record<MmPedidoPublicoEstado, string> = {
  pendiente: "bg-amber-100 text-amber-800",
  pago_reportado: "bg-sky-100 text-sky-800",
  para_pagar_local: "bg-violet-100 text-violet-800",
  aceptado_validado: "bg-emerald-100 text-emerald-800",
  rechazado: "bg-red-100 text-red-700",
  completado: "bg-surface-2 text-heading",
};

/** Etiqueta corta para listas y filtros del panel. */
export const ESTADO_PEDIDO_CORTO: Record<MmPedidoPublicoEstado, string> = {
  pendiente: "Pendiente",
  pago_reportado: "Pago reportado",
  para_pagar_local: "Por cobrar en local",
  aceptado_validado: "Pagado",
  rechazado: "Rechazado",
  completado: "Entregado",
};

export interface PedidoLineaDoc {
  nombre: string;
  cantidad: number;
  precioUsd: number;
  totalUsd: number;
  imagenUrl: string | null;
}

export interface PedidoDocumento {
  id: string;
  tenantId: string;
  sucursalId: string;
  numero: number;
  fecha: string;
  negocio: { nombre: string; logoUrl: string | null; rif: string | null };
  sucursal: { nombre: string; direccion: string | null; telefono: string | null };
  cliente: { nombre: string; telefono: string };
  formaPago: MmPedidoFormaPago;
  metodo: string;
  cuentaBancariaId: string | null;
  comprobantePath: string | null;
  montoEntregado: number | null;
  lineas: PedidoLineaDoc[];
  subtotalUsd: number;
  ivaUsd: number;
  igtfUsd: number;
  totalUsd: number;
  totalBs: number;
  tasa: number;
  estado: MmPedidoPublicoEstado;
  motivoRechazo: string | null;
  ventaId: string | null;
}

export function numeroPedido(n: number): string {
  return `P-${String(n).padStart(5, "0")}`;
}

/** Vuelto estimado cuando el cliente indicó con cuánto pagará en efectivo. */
export function vueltoEstimado(
  doc: Pick<PedidoDocumento, "metodo" | "montoEntregado" | "totalUsd" | "totalBs">,
): { moneda: "USD" | "VES"; monto: number } | null {
  if (doc.montoEntregado === null) return null;
  if (doc.metodo === "efectivo_usd") {
    return {
      moneda: "USD",
      monto: Math.max(0, Math.round((doc.montoEntregado - doc.totalUsd) * 100) / 100),
    };
  }
  if (doc.metodo === "efectivo_bs") {
    return {
      moneda: "VES",
      monto: Math.max(0, Math.round((doc.montoEntregado - doc.totalBs) * 100) / 100),
    };
  }
  return null;
}

function telefonoNegocio(parametros: unknown): string | null {
  const p =
    parametros && typeof parametros === "object" && !Array.isArray(parametros)
      ? (parametros as Record<string, unknown>)
      : {};
  return typeof p.telefono === "string" && p.telefono.trim() ? p.telefono.trim() : null;
}

/** Lee el pedido completo. Con cliente de sesión, RLS limita al tenant/sucursal;
 * con service_role, el llamador DEBE haber validado antes el token firmado. */
export async function getPedidoDocumento(
  client: Client,
  tenantId: string,
  pedidoId: string,
): Promise<PedidoDocumento | null> {
  const { data: p } = await client
    .from("mm_pedidos_publicos")
    .select(
      "id, tenant_id, sucursal_id, numero, created_at, cliente_nombre, cliente_telefono, forma_pago, metodo_pago_elegido, cuenta_bancaria_id, comprobante_path, monto_entregado, subtotal_usd, iva_usd, igtf_usd, total_usd, total_bs, tasa_usada, estado, motivo_rechazo, venta_id",
    )
    .eq("tenant_id", tenantId)
    .eq("id", pedidoId)
    .maybeSingle();
  if (!p) return null;

  const [itemsRes, configRes, sucRes] = await Promise.all([
    client
      .from("mm_pedidos_publicos_items")
      .select("producto_id, producto_nombre, cantidad, precio_usd, total_usd")
      .eq("tenant_id", tenantId)
      .eq("pedido_id", pedidoId)
      .order("created_at", { ascending: true }),
    client
      .from("mm_config_negocio")
      .select("nombre_comercial, logo_url, rif, parametros")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    client
      .from("mm_sucursales")
      .select("nombre, direccion, telefono")
      .eq("tenant_id", tenantId)
      .eq("id", p.sucursal_id)
      .maybeSingle(),
  ]);
  const items = itemsRes.data ?? [];
  const prodIds = items.map((i) => i.producto_id).filter((x): x is string => x !== null);
  const { data: imgs } =
    prodIds.length > 0
      ? await client
          .from("mm_productos")
          .select("id, imagen_url")
          .eq("tenant_id", tenantId)
          .in("id", prodIds)
      : { data: [] as { id: string; imagen_url: string | null }[] };
  const imgMap = new Map((imgs ?? []).map((i) => [i.id, i.imagen_url]));

  return {
    id: p.id,
    tenantId: p.tenant_id,
    sucursalId: p.sucursal_id,
    numero: p.numero,
    fecha: p.created_at,
    negocio: {
      nombre: configRes.data?.nombre_comercial || "Tienda",
      logoUrl: configRes.data?.logo_url ?? null,
      rif: configRes.data?.rif ?? null,
    },
    sucursal: {
      nombre: sucRes.data?.nombre ?? "",
      direccion: sucRes.data?.direccion ?? null,
      // Sin teléfono propio de la sucursal, se usa el teléfono general del negocio.
      telefono: sucRes.data?.telefono || telefonoNegocio(configRes.data?.parametros),
    },
    cliente: { nombre: p.cliente_nombre, telefono: p.cliente_telefono },
    formaPago: p.forma_pago,
    metodo: p.metodo_pago_elegido,
    cuentaBancariaId: p.cuenta_bancaria_id,
    comprobantePath: p.comprobante_path,
    montoEntregado: p.monto_entregado === null ? null : Number(p.monto_entregado),
    lineas: items.map((i) => ({
      nombre: i.producto_nombre,
      cantidad: Number(i.cantidad),
      precioUsd: Number(i.precio_usd),
      totalUsd: Number(i.total_usd),
      imagenUrl: i.producto_id ? (imgMap.get(i.producto_id) ?? null) : null,
    })),
    subtotalUsd: Number(p.subtotal_usd),
    ivaUsd: Number(p.iva_usd),
    igtfUsd: Number(p.igtf_usd),
    totalUsd: Number(p.total_usd),
    totalBs: Number(p.total_bs),
    tasa: Number(p.tasa_usada),
    estado: p.estado,
    motivoRechazo: p.motivo_rechazo,
    ventaId: p.venta_id,
  };
}
