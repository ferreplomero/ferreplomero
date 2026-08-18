/**
 * Capa de datos de ventas (lecturas y escrituras de estado). Aislada como el
 * resto: hoy lee de Supabase con el cliente del servidor; migrable a PowerSync
 * sin tocar la UI.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MmMetodoPago } from "@arkiteq/db";
import {
  construirRecibo,
  type DevolucionDocumento,
  type DocumentoFiscal,
  type ExcedenteDocumento,
} from "../documento";
import { linkPublicoRecibo } from "../recibo-link";
import { esEfectivo } from "../pos-calc";
import { esMetodoConCuenta, monedaNativaCuenta, type MetodoConCuenta } from "../bancos";
import { getSesionAbierta, insertarMovimientoCaja } from "./caja";
import { insertarMovimientoCuenta } from "./bancos";
import { hoyEnTz, medianocheLocalAUtcISO, rangoLocalAUtc } from "../date-format";

type Client = SupabaseClient<Database>;

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Historial de ventas
// ---------------------------------------------------------------------------

export interface VentaListItem {
  id: string;
  numero: string | null;
  fecha: string;
  created_at: string;
  cliente_nombre: string | null;
  cliente_id: string | null;
  cajero_nombre: string | null;
  metodos: string[];
  total_usd: number;
  total_bs: number;
  igtf_usd: number;
  descuento_usd: number;
  estado: "completada" | "anulada";
  num_items: number;
  fiado_estado: "abierto" | "pagado" | "anulado" | null;
}

export interface FiltrosVentas {
  desde?: string;
  hasta?: string;
  metodo?: MmMetodoPago | "";
  cliente_id?: string | "";
  estado?: "completada" | "anulada" | "";
  folio?: string;
  page?: number;
  per_page?: number;
}

export interface VentasPage {
  ventas: VentaListItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
  sum_total_usd: number;
  sum_igtf_usd: number;
}

export async function listVentas(
  client: Client,
  tenantId: string,
  tz: string,
  filtros: FiltrosVentas = {},
): Promise<VentasPage> {
  const { desde, hasta, metodo, cliente_id, estado, folio, page = 1, per_page = 50 } = filtros;

  let query = client
    .from("mm_ventas")
    .select(
      "id, numero_documento, fecha, created_at, cliente_id, usuario_id, total_usd, total_bs, igtf_usd, descuento_usd, estado",
    )
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  // `fecha` es timestamptz: comparar contra una cadena "YYYY-MM-DD" plana la
  // castea a medianoche UTC, no medianoche en la zona horaria del negocio
  // (América/Caracas = UTC-4), colando/excluyendo hasta 4 horas de ventas del
  // día real. `rangoLocalAUtc`/`medianocheLocalAUtcISO` (mismo criterio ya
  // usado por Reportes/Finanzas) resuelven los límites correctos.
  if (desde && hasta) {
    const { desdeIso, hastaIso } = rangoLocalAUtc({ desde, hasta }, tz);
    query = query.gte("fecha", desdeIso).lt("fecha", hastaIso);
  } else if (desde) {
    query = query.gte("fecha", medianocheLocalAUtcISO(desde, tz));
  } else if (hasta) {
    const { hastaIso } = rangoLocalAUtc({ desde: hasta, hasta }, tz);
    query = query.lt("fecha", hastaIso);
  }
  if (estado) query = query.eq("estado", estado);
  if (cliente_id) query = query.eq("cliente_id", cliente_id);
  if (folio) query = query.ilike("numero_documento", `%${folio}%`);

  const { data: ventas, error } = await query;
  if (error) throw new Error(`No se pudo cargar el historial de ventas: ${error.message}`);

  const rawVentas = ventas ?? [];
  if (rawVentas.length === 0) {
    return { ventas: [], total: 0, page, per_page, pages: 1, sum_total_usd: 0, sum_igtf_usd: 0 };
  }

  const ventaIds = rawVentas.map((v) => v.id);
  const clienteIds = [
    ...new Set(rawVentas.map((v) => v.cliente_id).filter((id): id is string => id !== null)),
  ];
  const usuarioIds = [
    ...new Set(rawVentas.map((v) => v.usuario_id).filter((id): id is string => id !== null)),
  ];

  const [pagosRes, itemsRes, clientesRes, profilesRes, fiadosRes] = await Promise.all([
    client
      .from("mm_pagos_venta")
      .select("venta_id, metodo")
      .eq("tenant_id", tenantId)
      .in("venta_id", ventaIds),
    client
      .from("mm_ventas_items")
      .select("venta_id")
      .eq("tenant_id", tenantId)
      .in("venta_id", ventaIds),
    clienteIds.length > 0
      ? client
          .from("mm_clientes")
          .select("id, nombre")
          .eq("tenant_id", tenantId)
          .in("id", clienteIds)
      : Promise.resolve({ data: [] as { id: string; nombre: string }[], error: null }),
    usuarioIds.length > 0
      ? client.from("profiles").select("id, full_name").in("id", usuarioIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[], error: null }),
    client
      .from("mm_fiados")
      .select("venta_id, estado")
      .eq("tenant_id", tenantId)
      .in("venta_id", ventaIds)
      .is("deleted_at", null),
  ]);

  const metodosPorVenta = new Map<string, string[]>();
  for (const p of pagosRes.data ?? []) {
    const arr = metodosPorVenta.get(p.venta_id) ?? [];
    if (!arr.includes(p.metodo)) arr.push(p.metodo);
    metodosPorVenta.set(p.venta_id, arr);
  }

  const itemsPorVenta = new Map<string, number>();
  for (const i of itemsRes.data ?? []) {
    itemsPorVenta.set(i.venta_id, (itemsPorVenta.get(i.venta_id) ?? 0) + 1);
  }

  const clienteMap = new Map((clientesRes.data ?? []).map((c) => [c.id, c.nombre]));
  const profileMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p.full_name]));
  const fiadoEstadoMap = new Map(
    (fiadosRes.data ?? [])
      .filter((f): f is typeof f & { venta_id: string } => f.venta_id !== null)
      .map((f) => [f.venta_id, f.estado as "abierto" | "pagado" | "anulado"]),
  );

  let items: VentaListItem[] = rawVentas.map((v) => ({
    id: v.id,
    numero: v.numero_documento,
    fecha: v.fecha,
    created_at: v.created_at,
    cliente_id: v.cliente_id,
    cliente_nombre: v.cliente_id ? (clienteMap.get(v.cliente_id) ?? null) : null,
    cajero_nombre: v.usuario_id ? (profileMap.get(v.usuario_id) ?? null) : null,
    metodos: metodosPorVenta.get(v.id) ?? [],
    total_usd: Number(v.total_usd),
    total_bs: Number(v.total_bs),
    igtf_usd: Number(v.igtf_usd),
    descuento_usd: Number(v.descuento_usd ?? 0),
    estado: v.estado,
    num_items: itemsPorVenta.get(v.id) ?? 0,
    fiado_estado: fiadoEstadoMap.get(v.id) ?? null,
  }));

  if (metodo) {
    items = items.filter((v) => v.metodos.includes(metodo));
  }

  // Una venta anulada no es ingreso real: se sigue LISTANDO (para el
  // historial/auditoría, con su badge "Anulada"), pero no debe sumar en el
  // total del período ni en el IGTF cobrado, sin importar qué filtro de
  // estado esté activo.
  const sum_total_usd = items.reduce(
    (s, v) => s + (v.estado === "completada" ? v.total_usd : 0),
    0,
  );
  const sum_igtf_usd = items.reduce((s, v) => s + (v.estado === "completada" ? v.igtf_usd : 0), 0);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / per_page));
  const offset = (page - 1) * per_page;

  return {
    ventas: items.slice(offset, offset + per_page),
    total,
    page,
    per_page,
    pages,
    sum_total_usd,
    sum_igtf_usd,
  };
}

/** Devuelve las ventas del día indicado (o del día actual en la zona horaria del negocio si no se pasa). */
export async function getRecibosDelDia(
  client: Client,
  tenantId: string,
  tz: string,
  fecha?: string,
): Promise<VentaListItem[]> {
  const hoy = fecha ?? hoyEnTz(tz);
  const result = await listVentas(client, tenantId, tz, { desde: hoy, hasta: hoy, per_page: 200 });
  return result.ventas;
}

/** Anula una venta completada, revierte el stock y marca el fiado como anulado si existe. */
export async function anularVenta(
  client: Client,
  tenantId: string,
  ventaId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: venta } = await client
    .from("mm_ventas")
    .select("id, sucursal_id, estado")
    .eq("id", ventaId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!venta) return { ok: false, error: "Venta no encontrada." };
  if (venta.estado !== "completada")
    return { ok: false, error: "Solo se pueden anular ventas con estado 'completada'." };

  const { error: upErr } = await client
    .from("mm_ventas")
    .update({ estado: "anulada" })
    .eq("id", ventaId)
    .eq("tenant_id", tenantId)
    .eq("estado", "completada");

  if (upErr) return { ok: false, error: "No se pudo anular la venta. Inténtalo de nuevo." };

  const { data: itemsVenta } = await client
    .from("mm_ventas_items")
    .select("producto_id, cantidad")
    .eq("tenant_id", tenantId)
    .eq("venta_id", ventaId);

  const movimientos = (itemsVenta ?? [])
    .filter((i): i is typeof i & { producto_id: string } => i.producto_id !== null)
    .map((i) => ({
      tenant_id: tenantId,
      producto_id: i.producto_id,
      sucursal_id: venta.sucursal_id,
      tipo: "entrada" as const,
      cantidad: Math.abs(Number(i.cantidad)),
      motivo: "Anulación de venta",
      referencia: ventaId,
    }));

  if (movimientos.length > 0) {
    await client.from("mm_movimientos_inventario").insert(movimientos);
  }

  await client
    .from("mm_fiados")
    .update({ estado: "anulado" })
    .eq("tenant_id", tenantId)
    .eq("venta_id", ventaId)
    .neq("estado", "anulado");

  // Saldo a favor: mm_creditos_cliente es un ledger append-only (no tiene un
  // estado que "anular" como mm_fiados) — se revierte con un asiento
  // contrario del mismo monto, mismo criterio que cualquier ledger contable.
  // Si esta venta otorgó saldo a favor (excedente acreditado), esa obligación
  // desaparece; si esta venta se pagó (en parte) con saldo a favor, ese saldo
  // vuelve a estar disponible para el cliente.
  const { data: creditosVenta } = await client
    .from("mm_creditos_cliente")
    .select("cliente_id, tipo, monto_usd, monto_bs, tasa_usada")
    .eq("tenant_id", tenantId)
    .eq("referencia", ventaId);

  if (creditosVenta && creditosVenta.length > 0) {
    await client.from("mm_creditos_cliente").insert(
      creditosVenta.map((c) => ({
        tenant_id: tenantId,
        cliente_id: c.cliente_id,
        tipo: c.tipo === "otorgado" ? ("usado" as const) : ("otorgado" as const),
        monto_usd: c.monto_usd,
        monto_bs: c.monto_bs,
        tasa_usada: c.tasa_usada,
        motivo: "Reversión por anulación de venta",
        referencia: ventaId,
      })),
    );
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Devolución de dinero al anular una venta
// ---------------------------------------------------------------------------

export interface DevolucionInput {
  metodo: MmMetodoPago;
  /** Obligatorio si `metodo` tiene cuenta (`esMetodoConCuenta`). */
  cuentaBancariaId?: string | null;
  /** Tecleado en la moneda NATIVA de `metodo` (Bs o USD) — nunca reconvertido. */
  monto: number;
}

export interface AnularVentaConDevolucionResult {
  ok: boolean;
  error?: string;
  /** true cuando la venta YA quedó anulada (stock revertido) pero el egreso
   * de la devolución no se pudo registrar — la UI debe avisar que hay que
   * anotarlo a mano en Caja/Bancos, no tratarlo como "no pasó nada". */
  devolucionFallida?: boolean;
}

/**
 * Anula una venta Y, si corresponde, registra la devolución del dinero como
 * un egreso NUEVO (fecha de hoy) en Caja o en la cuenta bancaria elegida —
 * nunca borra ni modifica el ingreso original de la venta. Reusa
 * `anularVenta` tal cual (no se toca) y los helpers ya existentes
 * `insertarMovimientoCaja`/`insertarMovimientoCuenta` (mismo mecanismo que ya
 * usan `registrarVenta` y los movimientos manuales de Bancos).
 *
 * Valida el destino ANTES de anular nada: si no hay caja abierta (efectivo) o
 * la cuenta no es válida, no se toca ni el stock ni la venta.
 */
export async function anularVentaConDevolucion(
  client: Client,
  tenantId: string,
  ventaId: string,
  usuarioId: string,
  devolucion: DevolucionInput | null,
): Promise<AnularVentaConDevolucionResult> {
  let sesionId: string | null = null;
  let cuentaId: string | null = null;

  if (devolucion) {
    if (!(devolucion.monto > 0)) {
      return { ok: false, error: "El monto a devolver debe ser mayor a cero." };
    }

    if (esEfectivo(devolucion.metodo)) {
      const { data: venta } = await client
        .from("mm_ventas")
        .select("sucursal_id")
        .eq("tenant_id", tenantId)
        .eq("id", ventaId)
        .maybeSingle();
      const sesion = venta ? await getSesionAbierta(client, tenantId, venta.sucursal_id) : null;
      if (!sesion) {
        return {
          ok: false,
          error:
            "No hay una caja abierta para registrar la devolución en efectivo. Abre la caja primero.",
        };
      }
      sesionId = sesion.id;
    } else if (esMetodoConCuenta(devolucion.metodo)) {
      if (!devolucion.cuentaBancariaId) {
        return { ok: false, error: "Selecciona la cuenta de la que sale la devolución." };
      }
      const { data: cuenta } = await client
        .from("mm_cuentas_bancarias")
        .select("id, metodo")
        .eq("tenant_id", tenantId)
        .eq("id", devolucion.cuentaBancariaId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!cuenta || cuenta.metodo !== devolucion.metodo) {
        return { ok: false, error: "La cuenta bancaria elegida no es válida para este método." };
      }
      cuentaId = cuenta.id;
    } else {
      return { ok: false, error: "Método de devolución inválido." };
    }
  }

  const resultado = await anularVenta(client, tenantId, ventaId);
  if (!resultado.ok || !devolucion) return resultado;

  const { data: venta } = await client
    .from("mm_ventas")
    .select("numero_documento, tasa_usada")
    .eq("tenant_id", tenantId)
    .eq("id", ventaId)
    .maybeSingle();
  const numero = venta?.numero_documento ?? ventaId.slice(0, 8);
  const tasaVenta = venta ? Number(venta.tasa_usada) : 0;

  const nativa = esEfectivo(devolucion.metodo)
    ? devolucion.metodo === "efectivo_usd"
      ? "USD"
      : "VES"
    : monedaNativaCuenta(devolucion.metodo as MetodoConCuenta);
  const montoUsd =
    nativa === "USD" ? devolucion.monto : tasaVenta > 0 ? devolucion.monto / tasaVenta : 0;
  const montoBs = nativa === "VES" ? devolucion.monto : devolucion.monto * tasaVenta;
  const motivo = `Devolución por anulación de venta ${numero}`;

  const { data: devolucionRow, error: devError } = await client
    .from("mm_devoluciones_venta")
    .insert({
      tenant_id: tenantId,
      venta_id: ventaId,
      usuario_id: usuarioId,
      metodo: devolucion.metodo,
      cuenta_bancaria_id: cuentaId,
      monto_usd: round2(montoUsd),
      monto_bs: round2(montoBs),
      tasa_usada: tasaVenta || null,
      motivo,
    })
    .select("id")
    .single();

  if (devError || !devolucionRow) {
    return {
      ok: true,
      devolucionFallida: true,
      error:
        "La venta quedó anulada, pero no se pudo registrar la devolución. Anótala manualmente en Caja/Bancos.",
    };
  }

  const { error: movError } = sesionId
    ? await insertarMovimientoCaja(client, {
        tenantId,
        sesionId,
        tipo: "egreso",
        monto: nativa === "USD" ? round2(montoUsd) : round2(montoBs),
        moneda: nativa,
        motivo,
        referencia: devolucionRow.id,
        usuarioId,
      })
    : await insertarMovimientoCuenta(client, {
        tenantId,
        cuentaId: cuentaId as string,
        tipo: "egreso",
        montoUsd: round2(montoUsd),
        montoBs: round2(montoBs),
        tasaUsada: tasaVenta || null,
        motivo,
        referencia: devolucionRow.id,
        usuarioId,
      });

  if (movError) {
    return {
      ok: true,
      devolucionFallida: true,
      error: `La venta quedó anulada, pero no se pudo registrar el egreso (${movError}). Anótalo manualmente en Caja/Bancos.`,
    };
  }

  return { ok: true };
}

/** Devolución registrada para una venta anulada, o null si no hubo. */
export async function getDevolucionVenta(
  client: Client,
  tenantId: string,
  ventaId: string,
): Promise<DevolucionDocumento | null> {
  const { data } = await client
    .from("mm_devoluciones_venta")
    .select("monto_usd, monto_bs, metodo, cuenta_bancaria_id, motivo, created_at")
    .eq("tenant_id", tenantId)
    .eq("venta_id", ventaId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  let banco: string | null = null;
  if (data.cuenta_bancaria_id) {
    const { data: cuenta } = await client
      .from("mm_cuentas_bancarias")
      .select("banco")
      .eq("tenant_id", tenantId)
      .eq("id", data.cuenta_bancaria_id)
      .maybeSingle();
    banco = cuenta?.banco ?? null;
  }

  return {
    montoUsd: Number(data.monto_usd),
    montoBs: Number(data.monto_bs),
    metodo: data.metodo,
    banco,
    fecha: data.created_at,
  };
}

export interface VentaParaAnular {
  id: string;
  numero: string | null;
  igtfUsd: number;
  tasaUsada: number;
  pagosReales: PagoRealVenta[];
  /** Monto que se ofrece devolver por defecto: suma de `pagosReales` en USD
   * menos cualquier vuelto (efectivo o por cuenta) ya entregado al vender —
   * nunca el bruto tendido, para no devolver el vuelto dos veces. */
  montoRealPagadoUsd: number;
  /** Deuda fiada pendiente que se cancelaría — null si la venta no tiene fiado abierto. */
  fiadoMontoUsd: number | null;
  puedeAnular: boolean;
  /** Por qué no se puede anular, cuando `puedeAnular` es false. */
  motivoBloqueo: string | null;
}

/**
 * Pagos reales de una venta (dinero que sí entró) y su suma en USD — excluye
 * 'fiado' y 'credito_cliente' (`anularVenta` ya los revierte por su cuenta
 * sin mover dinero de Caja/Bancos). Función pura, separada de la consulta a
 * la base para poder probarla con números concretos sin mockear Supabase.
 */
export function calcularPagosReales(
  pagos: {
    metodo: MmMetodoPago;
    monto: number | string;
    moneda: string;
    cuenta_bancaria_id: string | null;
  }[],
  tasaUsada: number,
): { pagosReales: PagoRealVenta[]; montoRealPagadoUsd: number } {
  const pagosReales: PagoRealVenta[] = pagos
    .filter((p) => p.metodo !== "fiado" && p.metodo !== "credito_cliente")
    .map((p) => ({
      metodo: p.metodo,
      montoUsd:
        p.moneda === "USD" ? Number(p.monto) : tasaUsada > 0 ? Number(p.monto) / tasaUsada : 0,
      cuentaBancariaId: p.cuenta_bancaria_id,
    }));
  return {
    pagosReales,
    montoRealPagadoUsd: round2(pagosReales.reduce((s, p) => s + p.montoUsd, 0)),
  };
}

/**
 * Datos livianos para el modal de anulación+devolución — se piden solo
 * cuando el cajero abre el modal (no en cada fila del historial de ventas),
 * así que es una consulta aparte de `getVentaDetalle` en vez de cargarle más
 * columnas a esa (que sí se pide siempre que se ve el detalle de una venta).
 */
export async function getVentaParaAnular(
  client: Client,
  tenantId: string,
  ventaId: string,
): Promise<VentaParaAnular | null> {
  const { data: venta } = await client
    .from("mm_ventas")
    .select("id, numero_documento, estado, igtf_usd, tasa_usada")
    .eq("tenant_id", tenantId)
    .eq("id", ventaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!venta) return null;

  const [pagosRes, fiadoRes, vueltoCajaRes, vueltoCuentaRes] = await Promise.all([
    client
      .from("mm_pagos_venta")
      .select("metodo, monto, moneda, cuenta_bancaria_id")
      .eq("tenant_id", tenantId)
      .eq("venta_id", ventaId),
    client
      .from("mm_fiados")
      .select("id, estado, monto_usd")
      .eq("tenant_id", tenantId)
      .eq("venta_id", ventaId)
      .is("deleted_at", null)
      .maybeSingle(),
    // Vuelto en efectivo ya entregado al vender (`registrarMovimientoCaja` en
    // ventas/actions.ts inserta este egreso con `referencia: ventaId`).
    client
      .from("mm_caja_movimientos")
      .select("monto, moneda")
      .eq("tenant_id", tenantId)
      .eq("referencia", ventaId)
      .eq("tipo", "egreso"),
    // Vuelto entregado por cuenta bancaria (`registrarMovimientoCuenta`,
    // mismo `referencia: ventaId`) — ya viene en USD, sin conversión.
    client
      .from("mm_cuenta_movimientos")
      .select("monto_usd")
      .eq("tenant_id", tenantId)
      .eq("referencia", ventaId)
      .eq("tipo", "egreso"),
  ]);

  const tasaUsada = Number(venta.tasa_usada);
  const { pagosReales, montoRealPagadoUsd: montoBrutoUsd } = calcularPagosReales(
    pagosRes.data ?? [],
    tasaUsada,
  );

  // El vuelto (efectivo o digital) ya salió de Caja/Bancos en el momento de
  // la venta — si se sugiriera devolver el bruto de nuevo al anular, ese
  // vuelto se devolvería DOS veces y la caja quedaría corta. El saldo a
  // favor otorgado en vez de vuelto NO se resta aquí: esa plata nunca salió
  // físicamente de Caja/Bancos, y `anularVenta` ya revierte ese crédito por
  // su cuenta (asiento contrario en `mm_creditos_cliente`).
  const vueltoEntregadoUsd = round2(
    (vueltoCajaRes.data ?? []).reduce((s, m) => {
      const monto = Number(m.monto);
      return s + (m.moneda === "USD" ? monto : tasaUsada > 0 ? monto / tasaUsada : 0);
    }, 0) + (vueltoCuentaRes.data ?? []).reduce((s, m) => s + Number(m.monto_usd), 0),
  );
  const montoRealPagadoUsd = Math.max(0, round2(montoBrutoUsd - vueltoEntregadoUsd));

  let fiadoMontoUsd: number | null = null;
  let puedeAnular = venta.estado === "completada";
  let motivoBloqueo: string | null = puedeAnular ? null : "Esta venta ya está anulada.";

  // Fiado con abonos ya registrados (o que ya no está abierto) se mantiene
  // bloqueado — anularlo dejaría un saldo fantasma en el cliente, ver el
  // comentario de este mismo caso en anularVenta/mm_v_saldo_cliente.
  if (fiadoRes.data && puedeAnular) {
    if (fiadoRes.data.estado !== "abierto") {
      puedeAnular = false;
      motivoBloqueo =
        "Esta venta tiene un fiado que ya no está abierto (pagado o anulado) — no se puede anular desde aquí.";
    } else {
      const { count } = await client
        .from("mm_abonos_fiado")
        .select("id", { count: "exact", head: true })
        .eq("fiado_id", fiadoRes.data.id);
      if ((count ?? 0) > 0) {
        puedeAnular = false;
        motivoBloqueo =
          "Esta venta tiene abonos registrados en su fiado — no se puede anular desde aquí.";
      } else {
        fiadoMontoUsd = Number(fiadoRes.data.monto_usd);
      }
    }
  }

  return {
    id: venta.id,
    numero: venta.numero_documento,
    igtfUsd: Number(venta.igtf_usd),
    tasaUsada,
    pagosReales,
    montoRealPagadoUsd,
    fiadoMontoUsd,
    puedeAnular,
    motivoBloqueo,
  };
}

// ---------------------------------------------------------------------------
// Detalle de venta
// ---------------------------------------------------------------------------

export interface AbonoInfo {
  id: string;
  monto_usd: number;
  monto_bs: number | null;
  igtf_usd: number;
  metodo: MmMetodoPago;
  created_at: string;
}

export interface FiadoInfo {
  id: string;
  monto_usd: number;
  estado: "abierto" | "pagado" | "anulado";
  abonos: AbonoInfo[];
  saldo_usd: number;
}

/** Un pago real de la venta (excluye 'fiado' y 'credito_cliente' — esos no
 * son dinero que haya que devolver, `anularVenta` ya los revierte aparte). */
export interface PagoRealVenta {
  metodo: MmMetodoPago;
  montoUsd: number;
  cuentaBancariaId: string | null;
}

export interface VentaDetalle extends DocumentoFiscal {
  id: string;
  estado: "completada" | "anulada";
  descuento_usd: number;
  cajero_nombre: string | null;
  created_at: string;
  cliente: { id: string; nombre: string; cedula: string | null } | null;
  fiado: FiadoInfo | null;
}

/** Carga la venta completa con cliente, ítems, cajero y fiado para la vista de detalle. */
export async function getVentaDetalle(
  client: Client,
  tenantId: string,
  ventaId: string,
): Promise<VentaDetalle | null> {
  const { data: venta } = await client
    .from("mm_ventas")
    .select(
      "id, estado, cliente_id, usuario_id, tipo_documento, numero_documento, fecha, created_at, tasa_usada, subtotal_usd, descuento_usd, igtf_usd, total_usd, total_bs",
    )
    .eq("tenant_id", tenantId)
    .eq("id", ventaId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!venta) return null;

  const [itemsRes, pagosRes, configRes, clienteRes, perfilRes, fiadoRes, devolucion] =
    await Promise.all([
      client
        .from("mm_ventas_items")
        .select("descripcion, cantidad, precio_usd, total_usd, impuesto_id, aplica_igtf")
        .eq("tenant_id", tenantId)
        .eq("venta_id", ventaId)
        .order("created_at", { ascending: true }),
      client
        .from("mm_pagos_venta")
        .select("metodo, monto, moneda")
        .eq("tenant_id", tenantId)
        .eq("venta_id", ventaId),
      client
        .from("mm_config_negocio")
        .select("nombre_comercial, rif, direccion, logo_url")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      venta.cliente_id
        ? client
            .from("mm_clientes")
            .select("id, nombre, cedula")
            .eq("tenant_id", tenantId)
            .eq("id", venta.cliente_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      venta.usuario_id
        ? client.from("profiles").select("full_name").eq("id", venta.usuario_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      client
        .from("mm_fiados")
        .select("id, monto_usd, estado")
        .eq("tenant_id", tenantId)
        .eq("venta_id", ventaId)
        .is("deleted_at", null)
        .maybeSingle(),
      getDevolucionVenta(client, tenantId, ventaId),
    ]);

  const negocio = {
    nombre: configRes.data?.nombre_comercial ?? "Mi negocio",
    rif: configRes.data?.rif ?? null,
    direccion: configRes.data?.direccion ?? null,
    logoUrl: configRes.data?.logo_url ?? null,
  };

  // Vista interna de detalle: siempre muestra el encabezado y la leyenda
  // (los toggles de Configuración solo aplican al recibo imprimible/compartible).
  // El botón de WhatsApp no vive en esta vista (solo en el recibo imprimible).
  const doc = construirRecibo(
    venta,
    itemsRes.data ?? [],
    pagosRes.data ?? [],
    negocio,
    true,
    clienteRes.data ? { nombre: clienteRes.data.nombre, cedula: clienteRes.data.cedula } : null,
    true,
    false,
    linkPublicoRecibo(ventaId, tenantId),
  );

  let fiado: FiadoInfo | null = null;
  if (fiadoRes.data) {
    const f = fiadoRes.data;
    const { data: abonos } = await client
      .from("mm_abonos_fiado")
      .select("id, monto_usd, monto_bs, igtf_usd, metodo, created_at")
      .eq("tenant_id", tenantId)
      .eq("fiado_id", f.id)
      .order("created_at", { ascending: true });

    const abonosTyped: AbonoInfo[] = (abonos ?? []).map((a) => ({
      id: a.id,
      monto_usd: Number(a.monto_usd),
      monto_bs: a.monto_bs !== null ? Number(a.monto_bs) : null,
      igtf_usd: Number(a.igtf_usd),
      metodo: a.metodo,
      created_at: a.created_at,
    }));

    const totalAbonado = abonosTyped.reduce((s, a) => s + a.monto_usd, 0);
    const saldo = Math.max(0, Number(f.monto_usd) - totalAbonado);

    fiado = {
      id: f.id,
      monto_usd: Number(f.monto_usd),
      estado: f.estado as "abierto" | "pagado" | "anulado",
      abonos: abonosTyped,
      saldo_usd: saldo,
    };
  }

  return {
    ...doc,
    id: venta.id,
    estado: venta.estado,
    descuento_usd: Number(venta.descuento_usd ?? 0),
    cajero_nombre: perfilRes.data?.full_name ?? null,
    created_at: venta.created_at,
    cliente: clienteRes.data
      ? { id: clienteRes.data.id, nombre: clienteRes.data.nombre, cedula: clienteRes.data.cedula }
      : null,
    fiado,
    devolucion,
  };
}

// ---------------------------------------------------------------------------
// Recibo (existente)
// ---------------------------------------------------------------------------

/**
 * Reconstruye "qué pasó con el excedente" de una venta ya guardada, para
 * mostrarlo en el recibo — NO calcula nada nuevo, solo lee lo que
 * `registrarVenta` (`ventas/actions.ts`) ya dejó registrado en el momento del
 * cobro. Las 3 tablas son mutuamente excluyentes por construcción (el cajero
 * solo puede elegir UN destino para el excedente): a lo sumo una de las tres
 * consultas trae una fila.
 *
 * `tasaUsada` es la tasa YA CONGELADA de la venta (`mm_ventas.tasa_usada`):
 * solo se usa para mostrar en la OTRA moneda un vuelto en efectivo, que en
 * `mm_caja_movimientos` se guarda en una sola moneda (a diferencia de banco/
 * crédito, que sí guardan monto_usd y monto_bs juntos) — es una conversión de
 * presentación, no un recálculo del cobro.
 */
async function getExcedenteVenta(
  client: Client,
  tenantId: string,
  ventaId: string,
  tasaUsada: number,
): Promise<ExcedenteDocumento | null> {
  const [cajaRes, cuentaRes, creditoRes] = await Promise.all([
    client
      .from("mm_caja_movimientos")
      .select("monto, moneda")
      .eq("tenant_id", tenantId)
      .eq("referencia", ventaId)
      .eq("tipo", "egreso")
      .maybeSingle(),
    client
      .from("mm_cuenta_movimientos")
      .select("monto_usd, monto_bs, cuenta_id")
      .eq("tenant_id", tenantId)
      .eq("referencia", ventaId)
      .eq("tipo", "egreso")
      .maybeSingle(),
    client
      .from("mm_creditos_cliente")
      .select("monto_usd, monto_bs")
      .eq("tenant_id", tenantId)
      .eq("referencia", ventaId)
      .eq("tipo", "otorgado")
      .maybeSingle(),
  ]);

  if (cajaRes.data) {
    const moneda = cajaRes.data.moneda === "USD" ? "USD" : "VES";
    const monto = Number(cajaRes.data.monto);
    return {
      montoUsd: moneda === "USD" ? round2(monto) : round2(monto / tasaUsada),
      montoBs: moneda === "VES" ? round2(monto) : round2(monto * tasaUsada),
      resolucion: { tipo: "efectivo", moneda },
    };
  }

  if (cuentaRes.data) {
    const { data: cuenta } = cuentaRes.data.cuenta_id
      ? await client
          .from("mm_cuentas_bancarias")
          .select("banco, metodo")
          .eq("tenant_id", tenantId)
          .eq("id", cuentaRes.data.cuenta_id)
          .maybeSingle()
      : { data: null };
    return {
      montoUsd: round2(Number(cuentaRes.data.monto_usd)),
      montoBs: round2(Number(cuentaRes.data.monto_bs)),
      resolucion: {
        tipo: "banco",
        metodo: cuenta?.metodo ?? "pago_movil",
        banco: cuenta?.banco ?? "cuenta bancaria",
      },
    };
  }

  if (creditoRes.data) {
    return {
      montoUsd: round2(Number(creditoRes.data.monto_usd)),
      montoBs: round2(Number(creditoRes.data.monto_bs)),
      resolucion: { tipo: "credito" },
    };
  }

  return null;
}

/** Devuelve el documento (recibo) de una venta, o null si no existe en el tenant. */
export async function getVentaParaRecibo(
  client: Client,
  tenantId: string,
  ventaId: string,
): Promise<DocumentoFiscal | null> {
  const { data: venta } = await client
    .from("mm_ventas")
    .select(
      "tipo_documento, numero_documento, fecha, tasa_usada, subtotal_usd, igtf_usd, total_usd, total_bs, cliente_id, estado",
    )
    .eq("tenant_id", tenantId)
    .eq("id", ventaId)
    .maybeSingle();

  if (!venta) return null;

  const [itemsRes, pagosRes, configRes, clienteRes, excedente, devolucion] = await Promise.all([
    client
      .from("mm_ventas_items")
      .select("descripcion, cantidad, precio_usd, total_usd, impuesto_id, aplica_igtf")
      .eq("tenant_id", tenantId)
      .eq("venta_id", ventaId)
      .order("created_at", { ascending: true }),
    client
      .from("mm_pagos_venta")
      .select("metodo, monto, moneda")
      .eq("tenant_id", tenantId)
      .eq("venta_id", ventaId),
    client
      .from("mm_config_negocio")
      .select("nombre_comercial, rif, direccion, logo_url, parametros")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    venta.cliente_id
      ? client
          .from("mm_clientes")
          .select("nombre, cedula, telefono, whatsapp, direccion")
          .eq("tenant_id", tenantId)
          .eq("id", venta.cliente_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    getExcedenteVenta(client, tenantId, ventaId, Number(venta.tasa_usada)),
    getDevolucionVenta(client, tenantId, ventaId),
  ]);

  const negocio = {
    nombre: configRes.data?.nombre_comercial || "Mi negocio",
    rif: configRes.data?.rif ?? null,
    direccion: configRes.data?.direccion ?? null,
    logoUrl: configRes.data?.logo_url ?? null,
  };

  const parametros =
    configRes.data?.parametros &&
    typeof configRes.data.parametros === "object" &&
    !Array.isArray(configRes.data.parametros)
      ? (configRes.data.parametros as Record<string, unknown>)
      : {};
  // "Mostrar encabezado de la empresa en los recibos" (Configuración) — activado por defecto.
  const mostrarEncabezado = parametros.mostrar_encabezado_recibo !== false;
  // "Mostrar leyenda de comprobante interno" (Configuración) — activado por defecto.
  const mostrarLeyenda = parametros.mostrar_leyenda_no_fiscal !== false;
  // "Mostrar botón de enviar recibo por WhatsApp" (Configuración) — activado por defecto.
  const mostrarBotonWhatsapp = parametros.mostrar_boton_whatsapp_recibo !== false;

  const cliente = clienteRes.data
    ? {
        nombre: clienteRes.data.nombre,
        cedula: clienteRes.data.cedula,
        telefono: clienteRes.data.telefono,
        whatsapp: clienteRes.data.whatsapp,
        direccion: clienteRes.data.direccion,
      }
    : null;

  return construirRecibo(
    venta,
    itemsRes.data ?? [],
    pagosRes.data ?? [],
    negocio,
    mostrarEncabezado,
    cliente,
    mostrarLeyenda,
    mostrarBotonWhatsapp,
    linkPublicoRecibo(ventaId, tenantId),
    excedente,
    venta.estado,
    devolucion,
  );
}

/**
 * Devuelve los IDs de los productos más vendidos del tenant en los últimos 30
 * días, ordenados por unidades vendidas descendente. Usado para los accesos
 * rápidos ("Frecuentes") del POS.
 */
export async function getProductosFrecuentes(
  client: Client,
  tenantId: string,
  limit = 8,
): Promise<string[]> {
  const desde = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString().slice(0, 10);

  // Tope de filas (no solo de fecha): esta consulta corre en CADA carga de
  // "Nueva venta" (la pantalla más visitada). Sin límite, un negocio con
  // meses de historial acumulado transfiere y agrupa en JS todas las líneas
  // de venta de 30 días completos cada vez que alguien abre el POS. Las 4000
  // más recientes son de sobra para detectar los productos frecuentes reales
  // (un negocio muy activo no llega ni cerca de esa cifra en un mes) y acotan
  // el costo para quien sí acumula mucho historial.
  const { data } = await client
    .from("mm_ventas_items")
    .select("producto_id, cantidad")
    .eq("tenant_id", tenantId)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(4000);

  if (!data?.length) return [];

  // Agrupa y suma en JS (sin RPC) para compatibilidad con RLS
  const totales = new Map<string, number>();
  for (const row of data) {
    if (!row.producto_id) continue;
    totales.set(row.producto_id, (totales.get(row.producto_id) ?? 0) + Number(row.cantidad));
  }

  return Array.from(totales.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}
