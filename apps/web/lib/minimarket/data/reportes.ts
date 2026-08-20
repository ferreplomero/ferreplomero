import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@arkiteq/db";
import { fechaEnTz, hoyEnTz, rangoLocalAUtc } from "../date-format";
import { fetchAllRows } from "./pagination";

type Client = SupabaseClient<Database>;

export interface VentaDia {
  fecha: string;
  num_ventas: number;
  total_usd: number;
  igtf_usd: number;
  subtotal_usd: number;
}

export interface VentaMetodo {
  metodo: string;
  monto_total: number;
  moneda: string;
  num_pagos: number;
}

export interface ProductoMasVendido {
  producto_id: string | null;
  descripcion: string;
  unidades: number;
  ingreso_usd: number;
}

export interface VentaCategoria {
  categoria_nombre: string;
  unidades: number;
  ingreso_usd: number;
}

export interface ResumenPeriodo {
  totalVentasUsd: number;
  numVentas: number;
  igtfUsd: number;
  fiadoOtorgadoUsd: number;
  utilidadEstimadaUsd: number;
  ticketPromedioUsd: number;
}

export interface CierreDiario {
  fecha: string;
  num_ventas: number;
  total_usd: number;
  igtf_usd: number;
  fiado_usd: number;
  metodos: { metodo: string; monto: number }[];
}

/** Rango de fechas ISO YYYY-MM-DD */
export interface RangoFechas {
  desde: string;
  hasta: string;
}

/** Resta `dias` días de calendario a una fecha YYYY-MM-DD (aritmética pura, sin zona horaria). */
function haceDiasDesde(fechaISO: string, dias: number): string {
  const d = new Date(`${fechaISO}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Presets de rango de fechas para Reportes/Finanzas/Tablero, calculados en la
 * fecha de calendario del NEGOCIO (`tz`), nunca en la del servidor — de lo
 * contrario "Hoy" puede ser el día equivocado según la hora UTC actual.
 */
export function rangoPreset(
  preset: "hoy" | "semana" | "mes" | "mes-anterior",
  tz: string,
): RangoFechas {
  const hoy = hoyEnTz(tz);
  switch (preset) {
    case "hoy":
      return { desde: hoy, hasta: hoy };
    case "semana":
      return { desde: haceDiasDesde(hoy, 6), hasta: hoy };
    case "mes":
      return { desde: haceDiasDesde(hoy, 29), hasta: hoy };
    case "mes-anterior": {
      const [y, m] = hoy.split("-").map(Number) as [number, number];
      const yPrev = m === 1 ? y - 1 : y;
      const mPrev = m === 1 ? 12 : m - 1;
      const desde = `${yPrev}-${String(mPrev).padStart(2, "0")}-01`;
      const hasta = new Date(Date.UTC(yPrev, mPrev, 0)).toISOString().slice(0, 10);
      return { desde, hasta };
    }
  }
}

/** Resumen agregado del período. */
export async function getResumenPeriodo(
  client: Client,
  tenantId: string,
  rango: RangoFechas,
  tz: string,
): Promise<ResumenPeriodo> {
  const { desdeIso, hastaIso } = rangoLocalAUtc(rango, tz);
  const [ventasRes, fiadoRes, itemsCostoRes] = await Promise.all([
    client
      .from("mm_ventas")
      .select("id, total_usd, igtf_usd, subtotal_usd")
      .eq("tenant_id", tenantId)
      .eq("estado", "completada")
      .gte("fecha", desdeIso)
      .lt("fecha", hastaIso)
      .is("deleted_at", null),
    client
      .from("mm_fiados")
      .select("monto_usd")
      .eq("tenant_id", tenantId)
      .gte("created_at", desdeIso)
      .lt("created_at", hastaIso)
      .is("deleted_at", null),
    client
      .from("mm_ventas_items")
      .select("cantidad, precio_usd, total_usd, producto_id, venta_id")
      .eq("tenant_id", tenantId)
      .gte("created_at", desdeIso)
      .lt("created_at", hastaIso),
  ]);

  const ventas = ventasRes.data ?? [];
  const totalVentasUsd = ventas.reduce((s, v) => s + Number(v.total_usd), 0);
  const igtfUsd = ventas.reduce((s, v) => s + Number(v.igtf_usd), 0);
  const numVentas = ventas.length;
  const fiadoOtorgadoUsd = (fiadoRes.data ?? []).reduce((s, f) => s + Number(f.monto_usd), 0);

  // Solo ítems de ventas COMPLETADAS: `mm_ventas_items` no se borra al anular
  // una venta (`anularVenta` solo cambia `mm_ventas.estado`), así que sin este
  // filtro los ítems de una venta anulada seguían sumando a la utilidad
  // estimada aunque `totalVentasUsd`/`numVentas` (arriba) ya los excluían.
  const ventaIdsCompletadas = new Set(ventas.map((v) => v.id));
  const itemsDeVentasCompletadas = (itemsCostoRes.data ?? []).filter((i) =>
    ventaIdsCompletadas.has(i.venta_id),
  );

  const productosIds = [
    ...new Set(
      itemsDeVentasCompletadas.map((i) => i.producto_id).filter((id): id is string => id !== null),
    ),
  ];
  let utilidadEstimadaUsd = 0;
  if (productosIds.length > 0) {
    const { data: costos } = await client
      .from("mm_productos")
      .select("id, costo_usd")
      .in("id", productosIds);
    const costoMap = new Map((costos ?? []).map((p) => [p.id, Number(p.costo_usd)]));
    for (const item of itemsDeVentasCompletadas) {
      const costo = item.producto_id ? (costoMap.get(item.producto_id) ?? 0) : 0;
      utilidadEstimadaUsd += (Number(item.precio_usd) - costo) * Number(item.cantidad);
    }
  }

  return {
    totalVentasUsd,
    numVentas,
    igtfUsd,
    fiadoOtorgadoUsd,
    utilidadEstimadaUsd,
    ticketPromedioUsd: numVentas > 0 ? totalVentasUsd / numVentas : 0,
  };
}

/** Ventas agrupadas por día de calendario del negocio dentro del rango. */
export async function getVentasPorDia(
  client: Client,
  tenantId: string,
  rango: RangoFechas,
  tz: string,
): Promise<VentaDia[]> {
  const { desdeIso, hastaIso } = rangoLocalAUtc(rango, tz);
  const { data } = await client
    .from("mm_ventas")
    .select("fecha, total_usd, igtf_usd, subtotal_usd")
    .eq("tenant_id", tenantId)
    .eq("estado", "completada")
    .gte("fecha", desdeIso)
    .lt("fecha", hastaIso)
    .is("deleted_at", null)
    .order("fecha", { ascending: true });

  const byDate = new Map<string, VentaDia>();
  for (const v of data ?? []) {
    // `fecha` es un timestamptz completo: se agrupa por el día de calendario
    // del NEGOCIO, no por el instante exacto (que sería único por venta).
    const fecha = fechaEnTz(v.fecha, tz);
    const existing = byDate.get(fecha) ?? {
      fecha,
      num_ventas: 0,
      total_usd: 0,
      igtf_usd: 0,
      subtotal_usd: 0,
    };
    existing.num_ventas += 1;
    existing.total_usd += Number(v.total_usd);
    existing.igtf_usd += Number(v.igtf_usd);
    existing.subtotal_usd += Number(v.subtotal_usd);
    byDate.set(fecha, existing);
  }

  return [...byDate.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Métodos de pago usados en el período. */
export async function getVentasPorMetodo(
  client: Client,
  tenantId: string,
  rango: RangoFechas,
  tz: string,
): Promise<VentaMetodo[]> {
  const { desdeIso, hastaIso } = rangoLocalAUtc(rango, tz);
  const { data: ventaIds } = await client
    .from("mm_ventas")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("estado", "completada")
    .gte("fecha", desdeIso)
    .lt("fecha", hastaIso)
    .is("deleted_at", null);

  if (!ventaIds?.length) return [];

  const { data: pagos } = await client
    .from("mm_pagos_venta")
    .select("metodo, monto, moneda")
    .eq("tenant_id", tenantId)
    .in(
      "venta_id",
      ventaIds.map((v) => v.id),
    );

  const byMetodo = new Map<string, VentaMetodo>();
  for (const p of pagos ?? []) {
    const key = `${p.metodo}:${p.moneda}`;
    const existing = byMetodo.get(key) ?? {
      metodo: p.metodo,
      monto_total: 0,
      moneda: p.moneda ?? "USD",
      num_pagos: 0,
    };
    existing.monto_total += Number(p.monto);
    existing.num_pagos += 1;
    byMetodo.set(key, existing);
  }

  return [...byMetodo.values()].sort((a, b) => b.monto_total - a.monto_total);
}

/** Top N productos más vendidos por unidades. */
export async function getProductosMasVendidos(
  client: Client,
  tenantId: string,
  rango: RangoFechas,
  tz: string,
  limit = 10,
): Promise<ProductoMasVendido[]> {
  const { desdeIso, hastaIso } = rangoLocalAUtc(rango, tz);
  const { data } = await client
    .from("mm_ventas_items")
    .select("producto_id, descripcion, cantidad, total_usd, venta:mm_ventas(fecha, estado)")
    .eq("tenant_id", tenantId)
    .gte("created_at", desdeIso)
    .lt("created_at", hastaIso)
    .returns<
      {
        producto_id: string | null;
        descripcion: string;
        cantidad: number;
        total_usd: number;
        venta: { fecha: string; estado: string } | null;
      }[]
    >();

  const byProducto = new Map<
    string,
    { descripcion: string; unidades: number; ingreso_usd: number; producto_id: string | null }
  >();

  for (const item of data ?? []) {
    if (item.venta?.estado !== "completada") continue;
    const key = item.producto_id ?? item.descripcion;
    const existing = byProducto.get(key) ?? {
      descripcion: item.descripcion,
      unidades: 0,
      ingreso_usd: 0,
      producto_id: item.producto_id,
    };
    existing.unidades += Number(item.cantidad);
    existing.ingreso_usd += Number(item.total_usd);
    byProducto.set(key, existing);
  }

  return [...byProducto.values()].sort((a, b) => b.unidades - a.unidades).slice(0, limit);
}

/** Sesiones de caja cerradas en el período (cierre diario). */
export async function getCierresDiarios(
  client: Client,
  tenantId: string,
  rango: RangoFechas,
  tz: string,
): Promise<CierreDiario[]> {
  const { desdeIso, hastaIso } = rangoLocalAUtc(rango, tz);
  const { data: ventas } = await client
    .from("mm_ventas")
    .select("id, fecha, total_usd, igtf_usd")
    .eq("tenant_id", tenantId)
    .eq("estado", "completada")
    .gte("fecha", desdeIso)
    .lt("fecha", hastaIso)
    .is("deleted_at", null);

  const { data: fiados } = await client
    .from("mm_fiados")
    .select("monto_usd, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", desdeIso)
    .lt("created_at", hastaIso)
    .is("deleted_at", null);

  const { data: pagos } = await client
    .from("mm_pagos_venta")
    .select("venta_id, metodo, monto")
    .eq("tenant_id", tenantId)
    .in(
      "venta_id",
      (ventas ?? []).map((v) => v.id),
    );

  const pagosPorVenta = new Map<string, { metodo: string; monto: number }[]>();
  for (const p of pagos ?? []) {
    const arr = pagosPorVenta.get(p.venta_id) ?? [];
    arr.push({ metodo: p.metodo, monto: Number(p.monto) });
    pagosPorVenta.set(p.venta_id, arr);
  }

  const byFecha = new Map<
    string,
    {
      num_ventas: number;
      total_usd: number;
      igtf_usd: number;
      fiado_usd: number;
      metodos: Map<string, number>;
    }
  >();

  for (const v of ventas ?? []) {
    const fecha = fechaEnTz(v.fecha, tz);
    const entry = byFecha.get(fecha) ?? {
      num_ventas: 0,
      total_usd: 0,
      igtf_usd: 0,
      fiado_usd: 0,
      metodos: new Map(),
    };
    entry.num_ventas += 1;
    entry.total_usd += Number(v.total_usd);
    entry.igtf_usd += Number(v.igtf_usd);
    for (const p of pagosPorVenta.get(v.id) ?? []) {
      entry.metodos.set(p.metodo, (entry.metodos.get(p.metodo) ?? 0) + p.monto);
    }
    byFecha.set(fecha, entry);
  }

  for (const f of fiados ?? []) {
    const dia = fechaEnTz(f.created_at, tz);
    const entry = byFecha.get(dia);
    if (entry) entry.fiado_usd += Number(f.monto_usd);
  }

  return [...byFecha.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([fecha, entry]) => ({
      fecha,
      num_ventas: entry.num_ventas,
      total_usd: entry.total_usd,
      igtf_usd: entry.igtf_usd,
      fiado_usd: entry.fiado_usd,
      metodos: [...entry.metodos.entries()].map(([metodo, monto]) => ({ metodo, monto })),
    }));
}

export interface ItemInventarioReporte {
  id: string;
  nombre: string;
  codigo: string | null;
  categoria: string | null;
  stock_actual: number;
  stock_minimo: number | null;
  bajo_minimo: boolean;
  costo_usd: number;
  precio_usd: number;
  valor_costo_total: number;
  valor_venta_total: number;
}

export interface ResumenInventarioReporte {
  totalProductos: number;
  totalActivos: number;
  productosBajoMinimo: number;
  valorCostoUsd: number;
  valorVentaUsd: number;
  items: ItemInventarioReporte[];
}

/** Valorización completa del inventario para reportes. */
export async function getInventarioReporte(
  client: Client,
  tenantId: string,
): Promise<ResumenInventarioReporte> {
  // Estas tres tablas se paginan: el catálogo y el stock por sucursal pueden
  // superar largamente las 1000 filas por defecto de PostgREST (carga
  // masiva), que corta ahí en silencio sin `.range()`.
  const [productos, stock, minimos, catRes] = await Promise.all([
    fetchAllRows<{
      id: string;
      nombre: string;
      codigo: string | null;
      categoria_id: string | null;
      costo_usd: number;
      precio_usd: number;
      activo: boolean;
    }>((from, to) =>
      client
        .from("mm_productos")
        .select("id, nombre, codigo, categoria_id, costo_usd, precio_usd, activo")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .eq("activo", true)
        .order("nombre", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<{ producto_id: string | null; stock_actual: number | null }>((from, to) =>
      client
        .from("mm_v_stock")
        .select("producto_id, stock_actual")
        .eq("tenant_id", tenantId)
        .order("producto_id", { ascending: true })
        .order("sucursal_id", { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<{ producto_id: string; stock_minimo: number }>((from, to) =>
      client
        .from("mm_inventario")
        .select("producto_id, stock_minimo")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    client.from("mm_categorias").select("id, nombre").eq("tenant_id", tenantId),
  ]);

  if (!productos.length) {
    return {
      totalProductos: 0,
      totalActivos: 0,
      productosBajoMinimo: 0,
      valorCostoUsd: 0,
      valorVentaUsd: 0,
      items: [],
    };
  }

  const stockMap = new Map<string, number>();
  for (const s of stock) {
    if (!s.producto_id) continue;
    stockMap.set(s.producto_id, (stockMap.get(s.producto_id) ?? 0) + Number(s.stock_actual));
  }
  const minimoMap = new Map(minimos.map((s) => [s.producto_id, Number(s.stock_minimo)]));
  const catMap = new Map((catRes.data ?? []).map((c) => [c.id, c.nombre]));

  const items: ItemInventarioReporte[] = productos.map((p) => {
    const stock = stockMap.get(p.id) ?? 0;
    const minimo = minimoMap.get(p.id) ?? null;
    const bajo = minimo !== null && minimo > 0 && stock <= minimo;
    const costo = Number(p.costo_usd ?? 0);
    const precio = Number(p.precio_usd ?? 0);
    return {
      id: p.id,
      nombre: p.nombre,
      codigo: p.codigo ?? null,
      categoria: p.categoria_id ? (catMap.get(p.categoria_id) ?? null) : null,
      stock_actual: stock,
      stock_minimo: minimo,
      bajo_minimo: bajo,
      costo_usd: costo,
      precio_usd: precio,
      valor_costo_total: costo * stock,
      valor_venta_total: precio * stock,
    };
  });

  return {
    totalProductos: items.length,
    totalActivos: items.filter((i) => i.stock_actual > 0).length,
    productosBajoMinimo: items.filter((i) => i.bajo_minimo).length,
    valorCostoUsd: items.reduce((s, i) => s + i.valor_costo_total, 0),
    valorVentaUsd: items.reduce((s, i) => s + i.valor_venta_total, 0),
    items,
  };
}

export interface ProductoBajaRotacion {
  id: string;
  nombre: string;
  codigo: string | null;
  stock_actual: number;
  unidades_vendidas: number;
  dias_sin_venta: number | null;
}

/** Productos con menor rotación (stock > 0 pero pocas o ninguna venta en el rango). */
export async function getProductosBajaRotacion(
  client: Client,
  tenantId: string,
  rango: RangoFechas,
  tz: string,
  limit = 15,
): Promise<ProductoBajaRotacion[]> {
  // Catálogo del tenant — puede superar las 1000 filas por defecto de
  // PostgREST, así que se pagina en vez de un `.select()` plano.
  const productos = await fetchAllRows<{ id: string; nombre: string; codigo: string | null }>(
    (from, to) =>
      client
        .from("mm_productos")
        .select("id, nombre, codigo")
        .eq("tenant_id", tenantId)
        .eq("activo", true)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to),
  );

  if (!productos.length) return [];

  const ids = productos.map((p) => p.id);
  const { desdeIso, hastaIso } = rangoLocalAUtc(rango, tz);

  const [stock, ventasRes] = await Promise.all([
    fetchAllRows<{ producto_id: string | null; stock_actual: number | null }>((from, to) =>
      client
        .from("mm_v_stock")
        .select("producto_id, stock_actual")
        .eq("tenant_id", tenantId)
        .order("producto_id", { ascending: true })
        .order("sucursal_id", { ascending: true })
        .range(from, to),
    ),
    client
      .from("mm_ventas_items")
      .select("producto_id, cantidad, created_at, venta:mm_ventas(estado, fecha)")
      .eq("tenant_id", tenantId)
      .in("producto_id", ids)
      .gte("created_at", desdeIso)
      .lt("created_at", hastaIso)
      .returns<
        {
          producto_id: string;
          cantidad: number;
          created_at: string;
          venta: { estado: string; fecha: string } | null;
        }[]
      >(),
  ]);

  const stockMap = new Map<string, number>();
  for (const s of stock) {
    if (!s.producto_id) continue;
    stockMap.set(s.producto_id, (stockMap.get(s.producto_id) ?? 0) + Number(s.stock_actual));
  }

  const ventasPorProducto = new Map<string, { unidades: number; ultimaFecha: string }>();
  for (const item of ventasRes.data ?? []) {
    if (item.venta?.estado !== "completada" || !item.producto_id) continue;
    const existing = ventasPorProducto.get(item.producto_id);
    const fecha = fechaEnTz(item.venta.fecha, tz);
    ventasPorProducto.set(item.producto_id, {
      unidades: (existing?.unidades ?? 0) + Number(item.cantidad),
      ultimaFecha: existing ? (fecha > existing.ultimaFecha ? fecha : existing.ultimaFecha) : fecha,
    });
  }

  const hoy = hoyEnTz(tz);
  const result = productos
    .map((p) => {
      const stock = stockMap.get(p.id) ?? 0;
      const ventas = ventasPorProducto.get(p.id);
      const diasSinVenta = ventas
        ? Math.floor(
            (new Date(hoy).getTime() - new Date(ventas.ultimaFecha).getTime()) / 86_400_000,
          )
        : null;
      return {
        id: p.id,
        nombre: p.nombre,
        codigo: p.codigo ?? null,
        stock_actual: stock,
        unidades_vendidas: ventas?.unidades ?? 0,
        dias_sin_venta: diasSinVenta,
      };
    })
    .filter((p) => p.stock_actual > 0)
    .sort((a, b) => a.unidades_vendidas - b.unidades_vendidas)
    .slice(0, limit);

  return result;
}

export interface AlertasNegocio {
  productosBajoMinimo: number;
  clientesMorosos: number;
}

/**
 * Alertas de estado actual del negocio para el Tablero (§6.8): no dependen
 * del período seleccionado (un producto bajo mínimo o un cliente moroso lo
 * son "ahora", sin importar el rango de fechas que se esté mirando). Las
 * métricas de ventas/ganancia/IGTF/fiado del período las da `getResumenPeriodo`.
 */
export async function getAlertasNegocio(
  client: Client,
  tenantId: string,
  tz: string,
): Promise<AlertasNegocio> {
  // mm_v_stock/mm_productos pueden superar las 1000 filas por defecto de
  // PostgREST (catálogos/stock grandes), así que se paginan.
  const [morososRes, stock, minimos, activos] = await Promise.all([
    client
      .from("mm_v_saldo_cliente")
      .select("saldo_usd, primer_fiado_abierto_at")
      .eq("tenant_id", tenantId),
    fetchAllRows<{ producto_id: string | null; stock_actual: number | null }>((from, to) =>
      client
        .from("mm_v_stock")
        .select("producto_id, stock_actual")
        .eq("tenant_id", tenantId)
        .order("producto_id", { ascending: true })
        .order("sucursal_id", { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<{ producto_id: string; stock_minimo: number }>((from, to) =>
      client
        .from("mm_inventario")
        .select("producto_id, stock_minimo")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<{ id: string }>((from, to) =>
      client
        .from("mm_productos")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("activo", true)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);

  const hoy = hoyEnTz(tz);
  const morosos = (morososRes.data ?? []).filter((c) => {
    if (!c.primer_fiado_abierto_at || Number(c.saldo_usd) <= 0) return false;
    const dias = Math.floor(
      (new Date(hoy).getTime() - new Date(fechaEnTz(c.primer_fiado_abierto_at, tz)).getTime()) /
        86_400_000,
    );
    return dias >= 30;
  });

  // Stock total por producto sumando todas las sucursales.
  const stockPorProducto = new Map<string, number>();
  for (const s of stock) {
    if (!s.producto_id) continue;
    stockPorProducto.set(
      s.producto_id,
      (stockPorProducto.get(s.producto_id) ?? 0) + Number(s.stock_actual),
    );
  }

  // Mínimo por producto (el mayor entre sucursales para ser conservador).
  const minimoMap = new Map<string, number>();
  for (const m of minimos) {
    minimoMap.set(
      m.producto_id,
      Math.max(minimoMap.get(m.producto_id) ?? 0, Number(m.stock_minimo)),
    );
  }

  // Solo productos activos; "bajo mínimo" = estrictamente menor que el mínimo.
  const activosSet = new Set(activos.map((p) => p.id));
  const productosBajoMinimo = [...minimoMap.entries()].filter(([productoId, min]) => {
    if (min <= 0 || !activosSet.has(productoId)) return false;
    const stock = stockPorProducto.get(productoId) ?? 0;
    return stock < min;
  }).length;

  return { productosBajoMinimo, clientesMorosos: morosos.length };
}

// ---------------------------------------------------------------------------
// Ventas por cajero/usuario
// ---------------------------------------------------------------------------

export interface VentaCajero {
  cajero_id: string | null;
  cajero_nombre: string;
  num_ventas: number;
  total_usd: number;
  igtf_usd: number;
  ticket_promedio_usd: number;
}

export async function getVentasPorCajero(
  client: Client,
  tenantId: string,
  rango: RangoFechas,
  tz: string,
): Promise<VentaCajero[]> {
  const { desdeIso, hastaIso } = rangoLocalAUtc(rango, tz);
  const { data: ventas } = await client
    .from("mm_ventas")
    .select("usuario_id, total_usd, igtf_usd")
    .eq("tenant_id", tenantId)
    .eq("estado", "completada")
    .is("deleted_at", null)
    .gte("fecha", desdeIso)
    .lt("fecha", hastaIso);

  if (!ventas?.length) return [];

  // Agrupar por usuario antes de buscar nombres (evita N+1)
  const mapa = new Map<string, VentaCajero>();
  for (const v of ventas) {
    const key = v.usuario_id ?? "__sin_usuario__";
    const ya = mapa.get(key) ?? {
      cajero_id: v.usuario_id,
      cajero_nombre: "", // se rellena luego
      num_ventas: 0,
      total_usd: 0,
      igtf_usd: 0,
      ticket_promedio_usd: 0,
    };
    ya.num_ventas += 1;
    ya.total_usd += Number(v.total_usd);
    ya.igtf_usd += Number(v.igtf_usd);
    mapa.set(key, ya);
  }

  // Enriquecer con nombres desde profiles (un solo query)
  const ids = Array.from(mapa.keys()).filter((k) => k !== "__sin_usuario__");
  if (ids.length > 0) {
    const { data: perfiles } = await client.from("profiles").select("id, full_name").in("id", ids);
    const perfMap = new Map((perfiles ?? []).map((p) => [p.id, p.full_name ?? "Sin nombre"]));
    for (const [, cajero] of mapa) {
      cajero.cajero_nombre = cajero.cajero_id
        ? (perfMap.get(cajero.cajero_id) ?? "Sin nombre")
        : "Sin cajero";
    }
  } else {
    for (const cajero of mapa.values()) {
      cajero.cajero_nombre = "Sin cajero";
    }
  }

  return Array.from(mapa.values())
    .map((c) => ({
      ...c,
      ticket_promedio_usd: c.num_ventas > 0 ? c.total_usd / c.num_ventas : 0,
    }))
    .sort((a, b) => b.total_usd - a.total_usd);
}
