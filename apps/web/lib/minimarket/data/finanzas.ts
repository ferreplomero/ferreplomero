import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@arkiteq/db";
import type { RangoFechas } from "./reportes";
import { rangoLocalAUtc } from "../date-format";
import { getTasaVigente } from "../exchange-rate";

type Client = SupabaseClient<Database>;

export interface FinanzasResumen {
  totalVentasUsd: number;
  totalVentasBs: number;
  igtfCobradoUsd: number;
  /** Derivado: total_usd − igtf_usd − subtotal_usd. Es IVA cuando está activo; 0 si no. */
  ivaRegistradoUsd: number;
  /** Suma de pagos en efectivo USD + Zelle (base sobre la que aplica el IGTF). */
  totalDivisaUsd: number;
  numVentas: number;
}

export interface FinanzasMetodo {
  metodo: string;
  totalUsd: number;
  totalBs: number;
  numPagos: number;
}

export interface FinanzasVenta {
  id: string;
  numero: string | null;
  fecha: string;
  created_at: string;
  cliente_nombre: string | null;
  total_usd: number;
  total_bs: number;
  igtf_usd: number;
  /** Derivado: total_usd − igtf_usd − subtotal_usd */
  iva_usd: number;
  metodos: string[];
}

// =============================================================================
// Gastos operativos — espejo de Compras, para la sección "Gastos" de
// Finanzas. Agrupa por `metodo_pago` (origen del dinero, ver migración
// 0082): permite ver de un vistazo cuánto salió de la caja física (efectivo)
// frente a lo pagado por métodos digitales. Puramente informativo — no usa
// lenguaje de "a pagar/declarar" (regla 16 de CLAUDE.md).
// =============================================================================

export interface FinanzasResumenGastos {
  totalGastosUsd: number;
  /** Suma de los pagados en efectivo (Bs o USD) — lo que realmente salió de la caja física. */
  totalEfectivoUsd: number;
  /** Suma de los pagados por método digital (pago móvil, transferencia, Zelle, tarjeta). */
  totalDigitalUsd: number;
  numGastos: number;
}

export interface FinanzasGastoMetodo {
  /** "sin_especificar" para gastos históricos anteriores a esta funcionalidad. */
  metodo: string;
  totalUsd: number;
  numGastos: number;
}

export interface FinanzasGasto {
  id: string;
  descripcion: string;
  categoria: string;
  fecha: string;
  monto_usd: number;
  metodo_pago: string | null;
}

const METODOS_EFECTIVO_GASTO = new Set(["efectivo_bs", "efectivo_usd"]);

/**
 * mm_gastos_operativos.fecha es `date` puro (calendario, sin hora): se
 * compara directo contra `rango.desde`/`rango.hasta`, igual criterio que
 * usa `getResumenGanancias` para la misma tabla — nunca contra límites UTC
 * de un timestamptz.
 */
export async function getFinanzasGastos(
  client: Client,
  tenantId: string,
  rango: RangoFechas,
): Promise<{
  resumen: FinanzasResumenGastos;
  porMetodo: FinanzasGastoMetodo[];
  gastos: FinanzasGasto[];
}> {
  const { data } = await client
    .from("mm_gastos_operativos")
    .select("id, descripcion, categoria_id, monto_usd, fecha, metodo_pago")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .gte("fecha", rango.desde)
    .lte("fecha", rango.hasta)
    .order("fecha", { ascending: false });

  const gastos = data ?? [];
  const r2 = (n: number) => Math.round(n * 100) / 100;

  const catIds = [...new Set(gastos.map((g) => g.categoria_id))];
  const catNombre = new Map<string, string>();
  if (catIds.length > 0) {
    const { data: cats } = await client
      .from("mm_categorias_movimiento")
      .select("id, nombre")
      .in("id", catIds);
    for (const c of cats ?? []) catNombre.set(c.id, c.nombre);
  }

  let totalGastosUsd = 0;
  let totalEfectivoUsd = 0;
  let totalDigitalUsd = 0;
  const porMetodoMap = new Map<string, { totalUsd: number; numGastos: number }>();

  for (const g of gastos) {
    const monto = Number(g.monto_usd);
    totalGastosUsd += monto;
    if (g.metodo_pago && METODOS_EFECTIVO_GASTO.has(g.metodo_pago)) totalEfectivoUsd += monto;
    else if (g.metodo_pago) totalDigitalUsd += monto;

    const key = g.metodo_pago ?? "sin_especificar";
    const entry = porMetodoMap.get(key) ?? { totalUsd: 0, numGastos: 0 };
    entry.totalUsd += monto;
    entry.numGastos += 1;
    porMetodoMap.set(key, entry);
  }

  const ORDEN_METODO: Record<string, number> = {
    efectivo_bs: 1,
    efectivo_usd: 2,
    pago_movil: 3,
    transferencia: 4,
    zelle: 5,
    tarjeta: 6,
    sin_especificar: 99,
  };
  const porMetodo: FinanzasGastoMetodo[] = Array.from(porMetodoMap.entries())
    .map(([metodo, v]) => ({ metodo, totalUsd: r2(v.totalUsd), numGastos: v.numGastos }))
    .sort((a, b) => (ORDEN_METODO[a.metodo] ?? 90) - (ORDEN_METODO[b.metodo] ?? 90));

  return {
    resumen: {
      totalGastosUsd: r2(totalGastosUsd),
      totalEfectivoUsd: r2(totalEfectivoUsd),
      totalDigitalUsd: r2(totalDigitalUsd),
      numGastos: gastos.length,
    },
    porMetodo,
    gastos: gastos.map((g) => ({
      id: g.id,
      descripcion: g.descripcion,
      categoria: catNombre.get(g.categoria_id) ?? "Sin categoría",
      fecha: g.fecha,
      monto_usd: r2(Number(g.monto_usd)),
      metodo_pago: g.metodo_pago,
    })),
  };
}

export async function getFinanzasResumen(
  client: Client,
  tenantId: string,
  rango: RangoFechas,
  tz: string,
): Promise<{ resumen: FinanzasResumen; porMetodo: FinanzasMetodo[]; ventas: FinanzasVenta[] }> {
  // fecha es timestamptz → se filtra por instante UTC exacto del rango local
  // del negocio, nunca comparando el string de fecha plano directamente.
  const { desdeIso, hastaIso } = rangoLocalAUtc(rango, tz);
  const ventasRes = await client
    .from("mm_ventas")
    .select(
      "id, numero_documento, fecha, created_at, cliente_id, total_usd, total_bs, igtf_usd, subtotal_usd",
    )
    .eq("tenant_id", tenantId)
    .eq("estado", "completada")
    .gte("fecha", desdeIso)
    .lt("fecha", hastaIso)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const ventas = ventasRes.data ?? [];
  const ventaIds = ventas.map((v) => v.id);

  const clienteIds = [
    ...new Set(ventas.map((v) => v.cliente_id).filter((id): id is string => id !== null)),
  ];

  const [pagosRes, clientesRes] = await Promise.all([
    ventaIds.length > 0
      ? client
          .from("mm_pagos_venta")
          .select("venta_id, metodo, monto, moneda, tasa_usada")
          .eq("tenant_id", tenantId)
          .in("venta_id", ventaIds)
      : Promise.resolve({
          data: [] as {
            venta_id: string;
            metodo: string;
            monto: number;
            moneda: string;
            tasa_usada: number | null;
          }[],
        }),
    clienteIds.length > 0
      ? client
          .from("mm_clientes")
          .select("id, nombre")
          .eq("tenant_id", tenantId)
          .in("id", clienteIds)
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
  ]);

  const pagos = pagosRes.data ?? [];
  const clienteMap = new Map((clientesRes.data ?? []).map((c) => [c.id, c.nombre]));

  // ── Resumen de ventas ────────────────────────────────────────────────────
  const totalVentasUsd = ventas.reduce((s, v) => s + Number(v.total_usd), 0);
  const totalVentasBs = ventas.reduce((s, v) => s + Number(v.total_bs), 0);
  const igtfCobradoUsd = ventas.reduce((s, v) => s + Number(v.igtf_usd), 0);
  const ivaRegistradoUsd = ventas.reduce(
    (s, v) => s + Math.max(0, Number(v.total_usd) - Number(v.igtf_usd) - Number(v.subtotal_usd)),
    0,
  );
  const numVentas = ventas.length;

  // ── Total cobrado en divisa (base del IGTF) ──────────────────────────────
  const DIVISA = new Set(["efectivo_usd", "zelle"]);
  let totalDivisaUsd = 0;
  for (const p of pagos) {
    if (!DIVISA.has(p.metodo)) continue;
    totalDivisaUsd +=
      p.moneda === "USD" ? Number(p.monto) : Number(p.monto) / (Number(p.tasa_usada) || 1);
  }

  // ── Desglose por método ──────────────────────────────────────────────────
  const metodosMap = new Map<string, { totalUsd: number; totalBs: number; numPagos: number }>();
  for (const p of pagos) {
    const tasaP = Number(p.tasa_usada) || 1;
    const montoUsd = p.moneda === "USD" ? Number(p.monto) : Number(p.monto) / tasaP;
    const montoBs = p.moneda === "VES" ? Number(p.monto) : Number(p.monto) * tasaP;
    const entry = metodosMap.get(p.metodo) ?? { totalUsd: 0, totalBs: 0, numPagos: 0 };
    entry.totalUsd += montoUsd;
    entry.totalBs += montoBs;
    entry.numPagos += 1;
    metodosMap.set(p.metodo, entry);
  }

  const ORDEN_METODO: Record<string, number> = {
    efectivo_bs: 1,
    efectivo_usd: 2,
    pago_movil: 3,
    transferencia: 4,
    zelle: 5,
    tarjeta: 6,
    cashea: 7,
    fiado: 8,
  };
  const porMetodo: FinanzasMetodo[] = Array.from(metodosMap.entries())
    .map(([metodo, v]) => ({ metodo, ...v }))
    .sort((a, b) => (ORDEN_METODO[a.metodo] ?? 99) - (ORDEN_METODO[b.metodo] ?? 99));

  // ── Lista por venta ──────────────────────────────────────────────────────
  const metodosPorVenta = new Map<string, string[]>();
  for (const p of pagos) {
    const arr = metodosPorVenta.get(p.venta_id) ?? [];
    if (!arr.includes(p.metodo)) arr.push(p.metodo);
    metodosPorVenta.set(p.venta_id, arr);
  }

  const ventasList: FinanzasVenta[] = ventas.map((v) => ({
    id: v.id,
    numero: v.numero_documento,
    fecha: v.fecha,
    created_at: v.created_at,
    cliente_nombre: v.cliente_id ? (clienteMap.get(v.cliente_id) ?? null) : null,
    total_usd: Math.round(Number(v.total_usd) * 100) / 100,
    total_bs: Math.round(Number(v.total_bs) * 100) / 100,
    igtf_usd: Math.round(Number(v.igtf_usd) * 100) / 100,
    iva_usd: Math.max(
      0,
      Math.round((Number(v.total_usd) - Number(v.igtf_usd) - Number(v.subtotal_usd)) * 100) / 100,
    ),
    metodos: (metodosPorVenta.get(v.id) ?? []).sort(
      (a, b) => (ORDEN_METODO[a] ?? 99) - (ORDEN_METODO[b] ?? 99),
    ),
  }));

  const r2 = (n: number) => Math.round(n * 100) / 100;

  return {
    resumen: {
      totalVentasUsd: r2(totalVentasUsd),
      totalVentasBs: r2(totalVentasBs),
      igtfCobradoUsd: r2(igtfCobradoUsd),
      ivaRegistradoUsd: r2(ivaRegistradoUsd),
      totalDivisaUsd: r2(totalDivisaUsd),
      numVentas,
    },
    porMetodo: porMetodo.map((m) => ({
      ...m,
      totalUsd: r2(m.totalUsd),
      totalBs: r2(m.totalBs),
    })),
    ventas: ventasList,
  };
}

// =============================================================================
// Compras — espejo de lo anterior, para la sección "Compras" de Finanzas.
// =============================================================================

export interface FinanzasResumenCompras {
  /** Costo de mercancía + IVA + IGTF: lo realmente desembolsado en el período. */
  totalComprasUsd: number;
  totalComprasBs: number;
  ivaPagadoUsd: number;
  igtfPagadoUsd: number;
  /** Suma de (costo + IVA) de las compras pagadas en efectivo USD o Zelle (base del IGTF). */
  totalDivisaUsd: number;
  numCompras: number;
}

export interface FinanzasProveedorResumen {
  proveedorId: string | null;
  proveedorNombre: string;
  totalUsd: number;
  numCompras: number;
}

export interface FinanzasCompra {
  id: string;
  proveedor_nombre: string | null;
  fecha: string;
  created_at: string;
  total_usd: number;
  total_bs: number;
  iva_usd: number;
  igtf_usd: number;
  metodo_pago: string | null;
}

/**
 * A diferencia de las ventas, una compra no congela su propia tasa de cambio
 * (no hay un "tasa_usada" por compra) — el equivalente en Bs se calcula con
 * la tasa VIGENTE hoy, igual que ya hacen las demás pantallas de Compras
 * (lista, detalle, cuentas por pagar). Es una cifra de referencia, no un
 * monto congelado en el momento de la compra.
 */
export async function getFinanzasCompras(
  client: Client,
  tenantId: string,
  rango: RangoFechas,
  tz: string,
): Promise<{
  resumen: FinanzasResumenCompras;
  porProveedor: FinanzasProveedorResumen[];
  compras: FinanzasCompra[];
}> {
  const { desdeIso, hastaIso } = rangoLocalAUtc(rango, tz);

  const [comprasRes, tasa] = await Promise.all([
    client
      .from("mm_compras")
      .select("id, proveedor_id, fecha, created_at, total_usd, iva_usd, igtf_usd, metodo_pago")
      .eq("tenant_id", tenantId)
      .eq("estado", "recibida")
      // Solo lo REALMENTE desembolsado (ver el docstring de esta función):
      // una compra recibida a crédito de proveedor y aún sin pagar
      // (pagada=false) no ha salido de caja/banco todavía — sin este filtro
      // se contaba igual que una ya pagada, inflando el total del período.
      .eq("pagada", true)
      .gte("fecha", desdeIso)
      .lt("fecha", hastaIso)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    getTasaVigente(client, tenantId),
  ]);

  const compras = comprasRes.data ?? [];
  const tasaValor = tasa?.valor ?? 1;

  const proveedorIds = [
    ...new Set(compras.map((c) => c.proveedor_id).filter((id): id is string => id !== null)),
  ];
  const { data: provs } =
    proveedorIds.length > 0
      ? await client.from("mm_proveedores").select("id, nombre").in("id", proveedorIds)
      : { data: [] as { id: string; nombre: string }[] };
  const provMap = new Map((provs ?? []).map((p) => [p.id, p.nombre]));

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const DIVISA = new Set(["efectivo_usd", "zelle"]);

  let totalComprasUsd = 0;
  let ivaPagadoUsd = 0;
  let igtfPagadoUsd = 0;
  let totalDivisaUsd = 0;

  const porProveedorMap = new Map<
    string,
    { nombre: string; totalUsd: number; numCompras: number }
  >();

  for (const c of compras) {
    const costo = Number(c.total_usd);
    const iva = Number(c.iva_usd);
    const igtf = Number(c.igtf_usd);
    const pagadoAlProveedor = costo + iva;
    const pagadoTotal = pagadoAlProveedor + igtf;

    totalComprasUsd += pagadoTotal;
    ivaPagadoUsd += iva;
    igtfPagadoUsd += igtf;
    if (c.metodo_pago && DIVISA.has(c.metodo_pago)) totalDivisaUsd += pagadoAlProveedor;

    const key = c.proveedor_id ?? "sin-proveedor";
    const entry = porProveedorMap.get(key) ?? {
      nombre: c.proveedor_id ? (provMap.get(c.proveedor_id) ?? "Proveedor") : "Sin proveedor",
      totalUsd: 0,
      numCompras: 0,
    };
    entry.totalUsd += pagadoTotal;
    entry.numCompras += 1;
    porProveedorMap.set(key, entry);
  }

  const porProveedor: FinanzasProveedorResumen[] = Array.from(porProveedorMap.entries())
    .map(([key, v]) => ({
      proveedorId: key === "sin-proveedor" ? null : key,
      proveedorNombre: v.nombre,
      totalUsd: r2(v.totalUsd),
      numCompras: v.numCompras,
    }))
    .sort((a, b) => b.totalUsd - a.totalUsd);

  const comprasList: FinanzasCompra[] = compras.map((c) => {
    const pagadoTotal = Number(c.total_usd) + Number(c.iva_usd) + Number(c.igtf_usd);
    return {
      id: c.id,
      proveedor_nombre: c.proveedor_id ? (provMap.get(c.proveedor_id) ?? null) : null,
      fecha: c.fecha,
      created_at: c.created_at,
      total_usd: r2(pagadoTotal),
      total_bs: r2(pagadoTotal * tasaValor),
      iva_usd: r2(Number(c.iva_usd)),
      igtf_usd: r2(Number(c.igtf_usd)),
      metodo_pago: c.metodo_pago,
    };
  });

  return {
    resumen: {
      totalComprasUsd: r2(totalComprasUsd),
      totalComprasBs: r2(totalComprasUsd * tasaValor),
      ivaPagadoUsd: r2(ivaPagadoUsd),
      igtfPagadoUsd: r2(igtfPagadoUsd),
      totalDivisaUsd: r2(totalDivisaUsd),
      numCompras: compras.length,
    },
    porProveedor,
    compras: comprasList,
  };
}
