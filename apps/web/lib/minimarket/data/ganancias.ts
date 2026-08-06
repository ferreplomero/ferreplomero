/**
 * Capa de datos de la sección Ganancias (Reportes). Cálculo de ganancia neta
 * real del período: ingresos por ventas, costo de mercancía vendida (COGS),
 * ganancia bruta, gastos del período y ganancia neta.
 *
 * LIMITACIONES DE PRECISIÓN — documentadas explícitamente, nunca ocultas:
 *
 * 1. COSTO DE MERCANCÍA VENDIDA: `mm_ventas_items` nunca guardó el costo del
 *    producto al momento de la venta (a diferencia de `mm_ventas.tasa_usada`,
 *    que sí congela la tasa de cambio). Por eso el COGS se calcula con el
 *    costo VIGENTE actual de `mm_productos.costo_usd`, igual que la
 *    "Utilidad estimada" ya existente en Reportes/Tablero. Si el costo de un
 *    producto cambió desde que se vendió (común en Venezuela por inflación),
 *    la ganancia bruta de períodos pasados es una aproximación, no el costo
 *    exacto de esa venta.
 * 2. GASTOS: solo se restan los que el sistema puede ver: egresos de caja
 *    (`mm_caja_movimientos` tipo='egreso'), abonos a deudas cuya categoría
 *    esté marcada como "gasto operativo" (`mm_categorias_deuda
 *    .es_gasto_operativo`), y gastos operativos manuales
 *    (`mm_gastos_operativos`). Gastos que no pasen por ninguno de estos tres
 *    canales (ej. una transferencia bancaria sin registrar) NO se reflejan.
 * 3. OTROS INGRESOS (`mm_otros_ingresos`): dinero que entra sin ser una venta
 *    (aporte del dueño, venta de un activo, reembolso, etc.). Se suma APARTE
 *    de `ingresosUsd` (que sigue siendo solo ventas) directo a la ganancia
 *    neta — nunca infla "Ingresos por ventas" ni el número de ventas.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MmGastoCategoria, MmGastoOperativo, MmOtroIngreso } from "@arkiteq/db";
import { rangoLocalAUtc } from "../date-format";
import { getTipoPreferido } from "../exchange-rate";
import type { RangoFechas } from "./reportes";

type Client = SupabaseClient<Database>;

export interface DetalleProductoVendido {
  producto_id: string | null;
  descripcion: string;
  cantidad: number;
  ingresoUsd: number;
  costoUsd: number;
}

export type OrigenGasto = "caja" | "deuda" | "manual";

export interface DetalleGasto {
  id: string;
  origen: OrigenGasto;
  descripcion: string;
  categoria: string | null;
  fecha: string;
  montoUsd: number;
  /** Solo para origen "manual": de dónde salió el dinero (null = gasto histórico sin origen). */
  metodoPago?: string | null;
}

export interface DetalleOtroIngreso {
  id: string;
  descripcion: string;
  fecha: string;
  montoUsd: number;
  metodoPago: string;
}

export interface ResumenGanancias {
  ingresosUsd: number;
  numVentas: number;
  costoMercanciaUsd: number;
  gananciaBrutaUsd: number;
  /** Dinero que entró SIN ser una venta (aporte del dueño, venta de un
   * activo, reembolso, etc. — módulo "Otros ingresos"). Se suma aparte de
   * `ingresosUsd` (que es SOLO ventas) para no inflar "Ingresos por ventas",
   * pero SÍ se suma a la ganancia neta. */
  otrosIngresosUsd: number;
  gastosCajaUsd: number;
  gastosDeudaOperativaUsd: number;
  gastosOperativosUsd: number;
  gastosTotalUsd: number;
  gananciaNetaUsd: number;
  detalleProductos: DetalleProductoVendido[];
  detalleGastos: DetalleGasto[];
  detalleOtrosIngresos: DetalleOtroIngreso[];
}

/** Divide un array en trozos de tamaño `n` (para IN de Postgrest con muchos ids). */
function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * Resuelve, para un instante dado, la tasa de cambio (tipo preferido del
 * negocio) que estaba vigente EN ESE MOMENTO — no la de hoy. `tasas` debe
 * venir ordenada ascendente por `created_at`. Usado para convertir a USD
 * egresos de caja históricos registrados en bolívares (que no congelan su
 * propia tasa, a diferencia de las ventas).
 */
function tasaEnInstante(
  tasas: { valor: number; created_at: string }[],
  instanteIso: string,
): number {
  let resultado = tasas[0]?.valor ?? 1;
  for (const t of tasas) {
    if (t.created_at <= instanteIso) resultado = t.valor;
    else break;
  }
  return resultado > 0 ? resultado : 1;
}

/** Resumen de ganancias del período: ingresos, costo, gastos y ganancia neta, con desglose. */
export async function getResumenGanancias(
  client: Client,
  tenantId: string,
  rango: RangoFechas,
  tz: string,
): Promise<ResumenGanancias> {
  const { desdeIso, hastaIso } = rangoLocalAUtc(rango, tz);

  // 1) Ventas completadas del período (misma fuente que "Ventas totales" del
  // resto de Reportes: estado='completada', no eliminadas).
  const { data: ventas } = await client
    .from("mm_ventas")
    .select("id, total_usd")
    .eq("tenant_id", tenantId)
    .eq("estado", "completada")
    .gte("fecha", desdeIso)
    .lt("fecha", hastaIso)
    .is("deleted_at", null);

  const ventaIds = (ventas ?? []).map((v) => v.id);
  const ingresosUsd = (ventas ?? []).reduce((s, v) => s + Number(v.total_usd), 0);
  const numVentas = (ventas ?? []).length;

  // 2) Ítems de esas ventas (nunca por rango de fecha propio: siempre atados
  // a las mismas ventas que "ingresosUsd", para que ambos números sean
  // consistentes entre sí).
  const items: {
    producto_id: string | null;
    descripcion: string;
    cantidad: number;
    precio_usd: number;
    total_usd: number;
  }[] = [];
  if (ventaIds.length > 0) {
    for (const lote of chunk(ventaIds, 200)) {
      const { data } = await client
        .from("mm_ventas_items")
        .select("producto_id, descripcion, cantidad, precio_usd, total_usd")
        .in("venta_id", lote);
      items.push(...(data ?? []));
    }
  }

  const productoIds = [
    ...new Set(items.map((i) => i.producto_id).filter((id): id is string => id !== null)),
  ];
  const costoMap = new Map<string, number>();
  if (productoIds.length > 0) {
    for (const lote of chunk(productoIds, 200)) {
      const { data: productos } = await client
        .from("mm_productos")
        .select("id, costo_usd")
        .in("id", lote);
      for (const p of productos ?? []) costoMap.set(p.id, Number(p.costo_usd));
    }
  }

  const porProducto = new Map<string, DetalleProductoVendido>();
  let costoMercanciaUsd = 0;
  for (const item of items) {
    const costoUnitario = item.producto_id ? (costoMap.get(item.producto_id) ?? 0) : 0;
    const costoLinea = costoUnitario * Number(item.cantidad);
    costoMercanciaUsd += costoLinea;

    const key = item.producto_id ?? `sin-producto:${item.descripcion}`;
    const entry = porProducto.get(key) ?? {
      producto_id: item.producto_id,
      descripcion: item.descripcion,
      cantidad: 0,
      ingresoUsd: 0,
      costoUsd: 0,
    };
    entry.cantidad += Number(item.cantidad);
    entry.ingresoUsd += Number(item.total_usd);
    entry.costoUsd += costoLinea;
    porProducto.set(key, entry);
  }

  const gananciaBrutaUsd = ingresosUsd - costoMercanciaUsd;

  // 3) Gastos — egresos de caja (nunca "retiro": eso es distribución del
  // dueño, no un gasto operativo del negocio).
  const [{ data: movimientos }, tipoPreferido] = await Promise.all([
    client
      .from("mm_caja_movimientos")
      .select("id, monto, moneda, motivo, referencia, created_at")
      .eq("tenant_id", tenantId)
      .eq("tipo", "egreso")
      .gte("created_at", desdeIso)
      .lt("created_at", hastaIso),
    getTipoPreferido(client, tenantId),
  ]);

  const { data: tasasRaw } = await client
    .from("mm_tasas_cambio")
    .select("valor, created_at")
    .eq("tenant_id", tenantId)
    .eq("tipo", tipoPreferido)
    .order("created_at", { ascending: true });
  const tasas = (tasasRaw ?? []).map((t) => ({ valor: Number(t.valor), created_at: t.created_at }));

  // Egresos de caja generados por un gasto operativo manual (`referencia` =
  // mm_gastos_operativos.id, ver migración 0082) NO se suman aquí — ya se
  // cuentan en `gastosOperativosUsd` (fuente 3, más abajo). Sumarlos también
  // aquí duplicaría el gasto en `gastosTotalUsd`. Esto no cambia en nada la
  // suma de egresos de caja "normales" (sin `referencia` de gasto): siguen
  // sumando exactamente igual que antes.
  const referenciasGasto = [
    ...new Set((movimientos ?? []).map((m) => m.referencia).filter((r): r is string => !!r)),
  ];
  const idsGastoVinculado = new Set<string>();
  if (referenciasGasto.length > 0) {
    const { data: gastosVinculados } = await client
      .from("mm_gastos_operativos")
      .select("id")
      .in("id", referenciasGasto);
    for (const g of gastosVinculados ?? []) idsGastoVinculado.add(g.id);
  }

  const detalleGastosCaja: DetalleGasto[] = [];
  let gastosCajaUsd = 0;
  for (const m of movimientos ?? []) {
    if (m.referencia && idsGastoVinculado.has(m.referencia)) continue;
    const montoUsd =
      m.moneda === "USD" ? Number(m.monto) : Number(m.monto) / tasaEnInstante(tasas, m.created_at);
    gastosCajaUsd += montoUsd;
    detalleGastosCaja.push({
      id: m.id,
      origen: "caja",
      descripcion: m.motivo && m.motivo.length > 0 ? m.motivo : "Egreso de caja",
      categoria: null,
      fecha: m.created_at,
      montoUsd,
    });
  }

  // 4) Gastos — abonos a deudas cuya categoría está marcada como operativa.
  const { data: categoriasOperativas } = await client
    .from("mm_categorias_deuda")
    .select("id, nombre")
    .eq("tenant_id", tenantId)
    .eq("es_gasto_operativo", true)
    .is("deleted_at", null);

  const catOperativaIds = (categoriasOperativas ?? []).map((c) => c.id);
  const catNombre = new Map((categoriasOperativas ?? []).map((c) => [c.id, c.nombre]));

  let gastosDeudaOperativaUsd = 0;
  const detalleGastosDeuda: DetalleGasto[] = [];
  if (catOperativaIds.length > 0) {
    const { data: deudasOperativas } = await client
      .from("mm_deudas")
      .select("id, descripcion, categoria_id")
      .eq("tenant_id", tenantId)
      .in("categoria_id", catOperativaIds)
      .is("deleted_at", null);

    const deudaIds = (deudasOperativas ?? []).map((d) => d.id);
    const deudaMap = new Map((deudasOperativas ?? []).map((d) => [d.id, d]));

    if (deudaIds.length > 0) {
      const { data: abonos } = await client
        .from("mm_abonos_deuda")
        .select("id, deuda_id, monto_usd, created_at")
        .in("deuda_id", deudaIds)
        .gte("created_at", desdeIso)
        .lt("created_at", hastaIso);

      for (const a of abonos ?? []) {
        const monto = Number(a.monto_usd);
        gastosDeudaOperativaUsd += monto;
        const deuda = deudaMap.get(a.deuda_id);
        detalleGastosDeuda.push({
          id: a.id,
          origen: "deuda",
          descripcion: deuda?.descripcion ?? "Abono a deuda",
          categoria: deuda?.categoria_id ? (catNombre.get(deuda.categoria_id) ?? null) : null,
          fecha: a.created_at,
          montoUsd: monto,
        });
      }
    }
  }

  // 5) Gastos operativos manuales (mm_gastos_operativos.fecha es `date`
  // puro: se compara directo contra las fechas de calendario del rango,
  // nunca contra los límites UTC de un timestamptz).
  const { data: gastosManuales } = await client
    .from("mm_gastos_operativos")
    .select("id, descripcion, categoria, monto_usd, fecha, metodo_pago")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .gte("fecha", rango.desde)
    .lte("fecha", rango.hasta);

  let gastosOperativosUsd = 0;
  const detalleGastosManual: DetalleGasto[] = [];
  for (const g of gastosManuales ?? []) {
    const monto = Number(g.monto_usd);
    gastosOperativosUsd += monto;
    detalleGastosManual.push({
      id: g.id,
      origen: "manual",
      descripcion: g.descripcion,
      categoria: g.categoria,
      fecha: g.fecha,
      montoUsd: monto,
      metodoPago: g.metodo_pago,
    });
  }

  // 6) Otros ingresos del período (mm_otros_ingresos.fecha es `date` puro,
  // mismo criterio de rango que los gastos operativos manuales arriba). Se
  // suman aparte de `ingresosUsd` (ventas) para no inflar "Ingresos por
  // ventas" — van directo a la ganancia neta, sin costo de mercancía.
  const { data: otrosIngresos } = await client
    .from("mm_otros_ingresos")
    .select("id, descripcion, monto_usd, fecha, metodo_pago")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .gte("fecha", rango.desde)
    .lte("fecha", rango.hasta);

  let otrosIngresosUsd = 0;
  const detalleOtrosIngresos: DetalleOtroIngreso[] = [];
  for (const i of otrosIngresos ?? []) {
    const monto = Number(i.monto_usd);
    otrosIngresosUsd += monto;
    detalleOtrosIngresos.push({
      id: i.id,
      descripcion: i.descripcion,
      fecha: i.fecha,
      montoUsd: monto,
      metodoPago: i.metodo_pago,
    });
  }

  const gastosTotalUsd = gastosCajaUsd + gastosDeudaOperativaUsd + gastosOperativosUsd;
  const gananciaNetaUsd = gananciaBrutaUsd + otrosIngresosUsd - gastosTotalUsd;

  const detalleProductos = [...porProducto.values()].sort((a, b) => b.costoUsd - a.costoUsd);
  const detalleGastos = [...detalleGastosCaja, ...detalleGastosDeuda, ...detalleGastosManual].sort(
    (a, b) => b.fecha.localeCompare(a.fecha),
  );

  return {
    ingresosUsd,
    numVentas,
    costoMercanciaUsd,
    gananciaBrutaUsd,
    otrosIngresosUsd,
    gastosCajaUsd,
    gastosDeudaOperativaUsd,
    gastosOperativosUsd,
    gastosTotalUsd,
    gananciaNetaUsd,
    detalleProductos,
    detalleGastos,
    detalleOtrosIngresos: detalleOtrosIngresos.sort((a, b) => b.fecha.localeCompare(a.fecha)),
  };
}

export const GASTO_CATEGORIA_LABEL: Record<MmGastoCategoria, string> = {
  alquiler: "Alquiler",
  servicios: "Servicios (luz, agua, internet)",
  sueldos: "Sueldos y personal",
  mantenimiento: "Mantenimiento",
  impuestos_permisos: "Impuestos y permisos",
  otros: "Otros",
};

/** Lista los gastos operativos manuales del tenant (historial completo, más reciente primero). */
export async function listGastosOperativos(
  client: Client,
  tenantId: string,
): Promise<MmGastoOperativo[]> {
  const { data, error } = await client
    .from("mm_gastos_operativos")
    .select("*")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("fecha", { ascending: false });

  if (error) throw new Error(`No se pudieron cargar los gastos operativos: ${error.message}`);
  return data ?? [];
}

/** Devuelve un gasto operativo por id, o null si no existe. */
export async function getGastoOperativo(
  client: Client,
  tenantId: string,
  id: string,
): Promise<MmGastoOperativo | null> {
  const { data, error } = await client
    .from("mm_gastos_operativos")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(`No se pudo cargar el gasto: ${error.message}`);
  return data;
}

/** Lista los otros ingresos del tenant (historial completo, más reciente primero). */
export async function listOtrosIngresos(
  client: Client,
  tenantId: string,
): Promise<MmOtroIngreso[]> {
  const { data, error } = await client
    .from("mm_otros_ingresos")
    .select("*")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("fecha", { ascending: false });

  if (error) throw new Error(`No se pudieron cargar los otros ingresos: ${error.message}`);
  return data ?? [];
}

/** Devuelve un otro ingreso por id, o null si no existe. */
export async function getOtroIngreso(
  client: Client,
  tenantId: string,
  id: string,
): Promise<MmOtroIngreso | null> {
  const { data, error } = await client
    .from("mm_otros_ingresos")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(`No se pudo cargar el ingreso: ${error.message}`);
  return data;
}
