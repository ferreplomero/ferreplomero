/**
 * Capa de datos de Libro Diario y Libro Mayor (Reportes → Contabilidad).
 *
 * REPORTES DE SOLO LECTURA: no crean ni modifican ningún dato. Leen las
 * mismas tablas que ya alimentan Ventas, Fiado, Gastos, Otros ingresos,
 * Compras, Deudas, Caja, Bancos y Saldos iniciales, y las presentan en
 * formato contable (cuenta afectada, origen/destino, monto USD/Bs, tasa).
 *
 * ANTI-DOBLE-CONTEO: cada documento (venta, gasto, otro-ingreso, abono,
 * compra, pago) genera UNA sola fila en su cuenta de origen (ej. "Ventas",
 * "Gastos"). El movimiento de caja/banco que ese documento ya dispara
 * (`mm_caja_movimientos`/`mm_cuenta_movimientos` con `referencia` =
 * documento.id) se usa como su "origen/destino" (texto), no como una fila
 * aparte — así un mismo dólar nunca se cuenta dos veces dentro de una misma
 * cuenta. Los movimientos de caja/banco SIN documento asociado (depósito,
 * retiro o ajuste manual) sí aparecen como su propia fila, en la cuenta
 * "Caja" o "Banco: <nombre>".
 *
 * Las cuentas "Caja" y "Banco: X" del Libro Mayor, en cambio, se calculan
 * del ledger COMPLETO (`mm_caja_movimientos`/`mm_cuenta_movimientos`, todas
 * las filas, con o sin documento) para que su saldo coincida exactamente con
 * el que ya muestran los módulos Caja y Bancos — nunca un cálculo propio.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@arkiteq/db";
import { rangoLocalAUtc } from "../date-format";
import { getTipoPreferido } from "../exchange-rate";
import { METODOS_PAGO } from "../constants";
import type { RangoFechas } from "./reportes";

type Client = SupabaseClient<Database>;

export type EfectoMovimiento = "entrada" | "salida";

export interface MovimientoDiario {
  id: string;
  /** Instante ISO (timestamptz) usado para ordenar y filtrar. */
  fecha: string;
  concepto: string;
  cuenta: string;
  /** Identificador estable de la cuenta, usado para agrupar/enrutar (ej. "banco-<id>"). */
  cuentaSlug: string;
  origenDestino: string;
  efecto: EfectoMovimiento;
  montoUsd: number;
  montoBs: number;
  tasa: number;
  /** Solo en movimientos de Caja/Banco: id del documento que lo originó (si
   * lo tiene), usado internamente para excluirlo del Diario y no duplicar la
   * fila que ya representa ese documento en su propia cuenta. */
  referencia?: string | null;
}

export interface CuentaResumen {
  cuenta: string;
  cuentaSlug: string;
  totalUsd: number;
  totalBs: number;
  numMovimientos: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function metodoLabel(metodo: string | null | undefined): string {
  if (!metodo) return "Sin especificar";
  return METODOS_PAGO.find((m) => m.value === metodo)?.label ?? metodo;
}

/** Tasa vigente en un instante pasado (misma técnica que `ganancias.ts`). */
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

/** Resuelve (montoBs, tasa) para una fila que solo guarda USD (gasto, otro
 * ingreso, compra) o cuya tasa congelada puede faltar (abono histórico). */
function resolverBsTasa(
  montoUsd: number,
  montoBsExistente: number | null | undefined,
  tasaExistente: number | null | undefined,
  instanteIso: string,
  tasas: { valor: number; created_at: string }[],
): { montoBs: number; tasa: number } {
  if (tasaExistente && tasaExistente > 0) {
    return { montoBs: montoBsExistente ?? r2(montoUsd * tasaExistente), tasa: tasaExistente };
  }
  const tasa = tasaEnInstante(tasas, instanteIso);
  return { montoBs: r2(montoUsd * tasa), tasa };
}

async function cargarTasas(client: Client, tenantId: string) {
  const tipoPreferido = await getTipoPreferido(client, tenantId);
  const { data } = await client
    .from("mm_tasas_cambio")
    .select("valor, created_at")
    .eq("tenant_id", tenantId)
    .eq("tipo", tipoPreferido)
    .order("created_at", { ascending: true });
  return (data ?? []).map((t) => ({ valor: Number(t.valor), created_at: t.created_at }));
}

async function mapCategoriaNombres(client: Client, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await client.from("mm_categorias_movimiento").select("id, nombre").in("id", ids);
  return new Map((data ?? []).map((c) => [c.id, c.nombre]));
}

/**
 * Movimientos "documento" del período: Ventas, Cuentas por Cobrar, Gastos,
 * Otros Ingresos, Compras, Cuentas por Pagar, Deudas, Saldos Iniciales.
 * NO incluye Caja/Banco (ver `getMovimientosCaja`/`getMovimientosBanco`).
 */
async function getMovimientosDocumento(
  client: Client,
  tenantId: string,
  rango: RangoFechas,
  tz: string,
): Promise<MovimientoDiario[]> {
  const { desdeIso, hastaIso } = rangoLocalAUtc(rango, tz);
  const tasas = await cargarTasas(client, tenantId);
  const movimientos: MovimientoDiario[] = [];

  const { data: cuentasBancarias } = await client
    .from("mm_cuentas_bancarias")
    .select("id, banco")
    .eq("tenant_id", tenantId);
  const bancoNombre = new Map((cuentasBancarias ?? []).map((c) => [c.id, c.banco]));
  const origenCuenta = (metodo: string | null, cuentaBancariaId: string | null) =>
    cuentaBancariaId ? `Banco: ${bancoNombre.get(cuentaBancariaId) ?? "—"}` : metodoLabel(metodo);

  // 1) Ventas completadas del período + su detalle de pagos (para
  // "origen/destino" y para detectar la porción fiada).
  const { data: ventas } = await client
    .from("mm_ventas")
    .select("id, cliente_id, numero_documento, fecha, tasa_usada, total_usd, total_bs")
    .eq("tenant_id", tenantId)
    .eq("estado", "completada")
    .gte("fecha", desdeIso)
    .lt("fecha", hastaIso)
    .is("deleted_at", null);

  const ventaIds = (ventas ?? []).map((v) => v.id);
  const pagosPorVenta = new Map<string, { metodo: string; monto: number }[]>();
  if (ventaIds.length > 0) {
    const { data: pagos } = await client
      .from("mm_pagos_venta")
      .select("venta_id, metodo, monto")
      .in("venta_id", ventaIds);
    for (const p of pagos ?? []) {
      const arr = pagosPorVenta.get(p.venta_id) ?? [];
      arr.push({ metodo: p.metodo, monto: Number(p.monto) });
      pagosPorVenta.set(p.venta_id, arr);
    }
  }

  const clienteIds = [
    ...new Set((ventas ?? []).map((v) => v.cliente_id).filter((id): id is string => !!id)),
  ];
  const clienteNombre = new Map<string, string>();
  if (clienteIds.length > 0) {
    const { data: clientes } = await client
      .from("mm_clientes")
      .select("id, nombre")
      .in("id", clienteIds);
    for (const c of clientes ?? []) clienteNombre.set(c.id, c.nombre);
  }

  for (const v of ventas ?? []) {
    const pagos = pagosPorVenta.get(v.id) ?? [];
    const metodosUnicos = [...new Set(pagos.map((p) => metodoLabel(p.metodo)))];
    const cliente = v.cliente_id ? clienteNombre.get(v.cliente_id) : null;
    movimientos.push({
      id: v.id,
      fecha: v.fecha,
      concepto: `Venta${v.numero_documento ? ` #${v.numero_documento}` : ""}${cliente ? ` — ${cliente}` : ""}`,
      cuenta: "Ventas",
      cuentaSlug: "ventas",
      origenDestino: metodosUnicos.join(", ") || "—",
      efecto: "entrada",
      montoUsd: Number(v.total_usd),
      montoBs: Number(v.total_bs),
      tasa: Number(v.tasa_usada),
    });

    const fiado = pagos.find((p) => p.metodo === "fiado");
    if (fiado) {
      movimientos.push({
        id: `${v.id}:fiado`,
        fecha: v.fecha,
        concepto: `Fiado otorgado${cliente ? ` — ${cliente}` : ""}`,
        cuenta: "Cuentas por Cobrar",
        cuentaSlug: "cuentas-por-cobrar",
        origenDestino: "Ventas",
        efecto: "entrada",
        montoUsd: fiado.monto,
        montoBs: r2(fiado.monto * Number(v.tasa_usada)),
        tasa: Number(v.tasa_usada),
      });
    }
  }

  // 2) Cobros de fiado (abonos) — reducen Cuentas por Cobrar. La venta ya se
  // contó como ingreso al momento de venderse (arriba); esto NUNCA se suma a
  // "Ventas" de nuevo.
  const { data: abonosFiado } = await client
    .from("mm_abonos_fiado")
    .select("id, cliente_id, monto_usd, monto_bs, tasa_usada, metodo, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", desdeIso)
    .lt("created_at", hastaIso);

  const clienteIdsAbono = [...new Set((abonosFiado ?? []).map((a) => a.cliente_id))];
  const clientesFaltantes = clienteIdsAbono.filter((id) => !clienteNombre.has(id));
  if (clientesFaltantes.length > 0) {
    const { data: clientes } = await client
      .from("mm_clientes")
      .select("id, nombre")
      .in("id", clientesFaltantes);
    for (const c of clientes ?? []) clienteNombre.set(c.id, c.nombre);
  }

  for (const a of abonosFiado ?? []) {
    const montoUsd = Number(a.monto_usd);
    const { montoBs, tasa } = resolverBsTasa(
      montoUsd,
      a.monto_bs,
      a.tasa_usada,
      a.created_at,
      tasas,
    );
    movimientos.push({
      id: a.id,
      fecha: a.created_at,
      concepto: `Cobro fiado — ${clienteNombre.get(a.cliente_id) ?? "Cliente"}`,
      cuenta: "Cuentas por Cobrar",
      cuentaSlug: "cuentas-por-cobrar",
      origenDestino: metodoLabel(a.metodo),
      efecto: "salida",
      montoUsd,
      montoBs,
      tasa,
    });
  }

  // 3) Gastos operativos manuales.
  const { data: gastos } = await client
    .from("mm_gastos_operativos")
    .select("id, descripcion, categoria_id, monto_usd, fecha, metodo_pago, cuenta_bancaria_id")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .gte("fecha", rango.desde)
    .lte("fecha", rango.hasta);

  const catGasto = await mapCategoriaNombres(client, [
    ...new Set((gastos ?? []).map((g) => g.categoria_id)),
  ]);
  for (const g of gastos ?? []) {
    const montoUsd = Number(g.monto_usd);
    const instante = `${g.fecha}T12:00:00.000Z`;
    const { montoBs, tasa } = resolverBsTasa(montoUsd, null, null, instante, tasas);
    movimientos.push({
      id: g.id,
      fecha: instante,
      concepto: `Gasto: ${g.descripcion} (${catGasto.get(g.categoria_id) ?? "Sin categoría"})`,
      cuenta: "Gastos",
      cuentaSlug: "gastos",
      origenDestino: origenCuenta(g.metodo_pago, g.cuenta_bancaria_id),
      efecto: "entrada",
      montoUsd,
      montoBs,
      tasa,
    });
  }

  // 4) Otros ingresos.
  const { data: otrosIngresos } = await client
    .from("mm_otros_ingresos")
    .select("id, descripcion, categoria_id, monto_usd, fecha, metodo_pago, cuenta_bancaria_id")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .gte("fecha", rango.desde)
    .lte("fecha", rango.hasta);

  const catOtroIngreso = await mapCategoriaNombres(client, [
    ...new Set((otrosIngresos ?? []).map((i) => i.categoria_id)),
  ]);
  for (const i of otrosIngresos ?? []) {
    const montoUsd = Number(i.monto_usd);
    const instante = `${i.fecha}T12:00:00.000Z`;
    const { montoBs, tasa } = resolverBsTasa(montoUsd, null, null, instante, tasas);
    movimientos.push({
      id: i.id,
      fecha: instante,
      concepto: `Otro ingreso: ${i.descripcion} (${catOtroIngreso.get(i.categoria_id) ?? "Sin categoría"})`,
      cuenta: "Otros Ingresos",
      cuentaSlug: "otros-ingresos",
      origenDestino: origenCuenta(i.metodo_pago, i.cuenta_bancaria_id),
      efecto: "entrada",
      montoUsd,
      montoBs,
      tasa,
    });
  }

  // 5) Compras — costo de mercancía (creación) y Cuentas por Pagar
  // (obligación al crédito + su pago, si cayó dentro del rango).
  const { data: comprasCreadas } = await client
    .from("mm_compras")
    .select("id, proveedor_id, fecha, total_usd, metodo_pago, pagada")
    .eq("tenant_id", tenantId)
    .neq("estado", "anulada")
    .gte("fecha", desdeIso)
    .lt("fecha", hastaIso)
    .is("deleted_at", null);

  const proveedorIds = [
    ...new Set(
      (comprasCreadas ?? []).map((c) => c.proveedor_id).filter((id): id is string => !!id),
    ),
  ];
  const proveedorNombre = new Map<string, string>();
  if (proveedorIds.length > 0) {
    const { data: proveedores } = await client
      .from("mm_proveedores")
      .select("id, nombre")
      .in("id", proveedorIds);
    for (const p of proveedores ?? []) proveedorNombre.set(p.id, p.nombre);
  }

  for (const c of comprasCreadas ?? []) {
    const montoUsd = Number(c.total_usd);
    const { montoBs, tasa } = resolverBsTasa(montoUsd, null, null, c.fecha, tasas);
    const proveedor = c.proveedor_id ? proveedorNombre.get(c.proveedor_id) : null;
    const esCredito = c.metodo_pago === "credito_proveedor";
    movimientos.push({
      id: c.id,
      fecha: c.fecha,
      concepto: `Compra${proveedor ? ` — ${proveedor}` : ""}`,
      cuenta: "Compras",
      cuentaSlug: "compras",
      origenDestino: esCredito ? "Cuentas por Pagar" : metodoLabel(c.metodo_pago),
      efecto: "entrada",
      montoUsd,
      montoBs,
      tasa,
    });
    if (esCredito) {
      movimientos.push({
        id: `${c.id}:cxp`,
        fecha: c.fecha,
        concepto: `Compra a crédito${proveedor ? ` — ${proveedor}` : ""}`,
        cuenta: "Cuentas por Pagar",
        cuentaSlug: "cuentas-por-pagar",
        origenDestino: "Compras",
        efecto: "entrada",
        montoUsd,
        montoBs,
        tasa,
      });
    }
  }

  const { data: comprasPagadas } = await client
    .from("mm_compras")
    .select("id, proveedor_id, total_usd, fecha_pago")
    .eq("tenant_id", tenantId)
    .eq("metodo_pago", "credito_proveedor")
    .eq("pagada", true)
    .not("fecha_pago", "is", null)
    .gte("fecha_pago", desdeIso)
    .lt("fecha_pago", hastaIso)
    .is("deleted_at", null);

  const proveedorIdsPago = [
    ...new Set(
      (comprasPagadas ?? []).map((c) => c.proveedor_id).filter((id): id is string => !!id),
    ),
  ].filter((id) => !proveedorNombre.has(id));
  if (proveedorIdsPago.length > 0) {
    const { data: proveedores } = await client
      .from("mm_proveedores")
      .select("id, nombre")
      .in("id", proveedorIdsPago);
    for (const p of proveedores ?? []) proveedorNombre.set(p.id, p.nombre);
  }

  for (const c of comprasPagadas ?? []) {
    const montoUsd = Number(c.total_usd);
    const fechaPago = c.fecha_pago as string;
    const { montoBs, tasa } = resolverBsTasa(montoUsd, null, null, fechaPago, tasas);
    const proveedor = c.proveedor_id ? proveedorNombre.get(c.proveedor_id) : null;
    movimientos.push({
      id: `${c.id}:pago`,
      fecha: fechaPago,
      concepto: `Pago a proveedor${proveedor ? ` — ${proveedor}` : ""}`,
      cuenta: "Cuentas por Pagar",
      cuentaSlug: "cuentas-por-pagar",
      origenDestino: "Pago a proveedor",
      efecto: "salida",
      montoUsd,
      montoBs,
      tasa,
    });
  }

  // 6) Deudas del dueño/negocio (pasivo) — solo sus abonos (pagos reales);
  // la creación de una deuda no siempre implica un ingreso de caja real.
  const { data: abonosDeuda } = await client
    .from("mm_abonos_deuda")
    .select("id, deuda_id, monto_usd, monto_bs, tasa_usada, metodo, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", desdeIso)
    .lt("created_at", hastaIso);

  const deudaIds = [...new Set((abonosDeuda ?? []).map((a) => a.deuda_id))];
  const deudaDescripcion = new Map<string, string>();
  if (deudaIds.length > 0) {
    const { data: deudas } = await client
      .from("mm_deudas")
      .select("id, descripcion")
      .in("id", deudaIds);
    for (const d of deudas ?? []) deudaDescripcion.set(d.id, d.descripcion);
  }

  for (const a of abonosDeuda ?? []) {
    const montoUsd = Number(a.monto_usd);
    const { montoBs, tasa } = resolverBsTasa(
      montoUsd,
      a.monto_bs,
      a.tasa_usada,
      a.created_at,
      tasas,
    );
    movimientos.push({
      id: a.id,
      fecha: a.created_at,
      concepto: `Abono deuda: ${deudaDescripcion.get(a.deuda_id) ?? "Deuda"}`,
      cuenta: "Deudas",
      cuentaSlug: "deudas",
      origenDestino: metodoLabel(a.metodo),
      efecto: "salida",
      montoUsd,
      montoBs,
      tasa,
    });
  }

  // 7) Saldos iniciales (capital — nunca ganancia, ver Estado de Resultados).
  const { data: saldosIniciales } = await client
    .from("mm_saldos_iniciales")
    .select("id, destino, cuenta_id, monto_usd, monto_bs, tasa_usada, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", desdeIso)
    .lt("created_at", hastaIso);

  for (const s of saldosIniciales ?? []) {
    const montoUsd = Number(s.monto_usd);
    const { montoBs, tasa } = resolverBsTasa(
      montoUsd,
      s.monto_bs,
      s.tasa_usada,
      s.created_at,
      tasas,
    );
    movimientos.push({
      id: s.id,
      fecha: s.created_at,
      concepto: "Saldo inicial declarado",
      cuenta: "Saldos Iniciales",
      cuentaSlug: "saldos-iniciales",
      origenDestino:
        s.destino === "cuenta_bancaria" && s.cuenta_id
          ? `Banco: ${bancoNombre.get(s.cuenta_id) ?? "—"}`
          : "Caja",
      efecto: "entrada",
      montoUsd,
      montoBs,
      tasa,
    });
  }

  // 8) Devoluciones de venta (reversa parcial/total — reduce "Ventas").
  const { data: devoluciones } = await client
    .from("mm_devoluciones_venta")
    .select("id, venta_id, metodo, monto_usd, monto_bs, tasa_usada, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", desdeIso)
    .lt("created_at", hastaIso);

  for (const d of devoluciones ?? []) {
    const montoUsd = Number(d.monto_usd);
    const { montoBs, tasa } = resolverBsTasa(
      montoUsd,
      d.monto_bs,
      d.tasa_usada,
      d.created_at,
      tasas,
    );
    movimientos.push({
      id: d.id,
      fecha: d.created_at,
      concepto: "Devolución de venta",
      cuenta: "Ventas",
      cuentaSlug: "ventas",
      origenDestino: metodoLabel(d.metodo),
      efecto: "salida",
      montoUsd,
      montoBs,
      tasa,
    });
  }

  return movimientos;
}

/** Ledger COMPLETO de Caja (todas las filas, con o sin documento) — mismo
 * criterio que usa el módulo Caja para su saldo. */
async function getMovimientosCaja(
  client: Client,
  tenantId: string,
  rango: RangoFechas,
  tz: string,
): Promise<MovimientoDiario[]> {
  const { desdeIso, hastaIso } = rangoLocalAUtc(rango, tz);
  const tasas = await cargarTasas(client, tenantId);
  const { data } = await client
    .from("mm_caja_movimientos")
    .select("id, tipo, monto, moneda, motivo, referencia, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", desdeIso)
    .lt("created_at", hastaIso);

  return (data ?? []).map((m) => {
    const monto = Number(m.monto);
    const montoUsd = m.moneda === "USD" ? monto : r2(monto / tasaEnInstante(tasas, m.created_at));
    const montoBs = m.moneda === "VES" ? monto : r2(monto * tasaEnInstante(tasas, m.created_at));
    return {
      id: m.id,
      fecha: m.created_at,
      concepto: m.motivo && m.motivo.length > 0 ? m.motivo : "Movimiento de caja",
      cuenta: "Caja",
      cuentaSlug: "caja",
      origenDestino: m.tipo === "venta" ? "Venta" : m.tipo === "retiro" ? "Retiro" : "—",
      efecto: (m.tipo === "ingreso" || m.tipo === "venta"
        ? "entrada"
        : "salida") as EfectoMovimiento,
      montoUsd,
      montoBs,
      tasa: tasaEnInstante(tasas, m.created_at),
      referencia: m.referencia,
    };
  });
}

/** Ledger COMPLETO de una cuenta bancaria (todas las filas). */
async function getMovimientosBanco(
  client: Client,
  tenantId: string,
  cuentaId: string,
  nombreCuenta: string,
  rango: RangoFechas,
  tz: string,
): Promise<MovimientoDiario[]> {
  const { desdeIso, hastaIso } = rangoLocalAUtc(rango, tz);
  const { data } = await client
    .from("mm_cuenta_movimientos")
    .select("id, tipo, monto_usd, monto_bs, tasa_usada, motivo, referencia, created_at")
    .eq("tenant_id", tenantId)
    .eq("cuenta_id", cuentaId)
    .gte("created_at", desdeIso)
    .lt("created_at", hastaIso);

  return (data ?? []).map((m) => ({
    id: m.id,
    fecha: m.created_at,
    concepto: m.motivo && m.motivo.length > 0 ? m.motivo : "Movimiento bancario",
    cuenta: `Banco: ${nombreCuenta}`,
    cuentaSlug: `banco-${cuentaId}`,
    origenDestino: m.tipo === "venta" ? "Venta" : m.tipo === "retiro" ? "Retiro" : "—",
    efecto: (m.tipo === "ingreso" || m.tipo === "venta" ? "entrada" : "salida") as EfectoMovimiento,
    montoUsd: Number(m.monto_usd),
    montoBs: Number(m.monto_bs),
    tasa: Number(m.tasa_usada ?? 0),
    referencia: m.referencia,
  }));
}

/** Ids de documentos ya representados como su propia fila — para excluir sus
 * movimientos de caja/banco "espejo" del Diario (evita duplicar la fila). */
function idsDocumento(documentos: MovimientoDiario[]): Set<string> {
  const ids = new Set<string>();
  for (const m of documentos) {
    const base = m.id.split(":")[0];
    if (base) ids.add(base);
  }
  return ids;
}

/**
 * Libro Diario: todos los movimientos del período en orden cronológico.
 * Incluye cada documento como una sola fila (ver anti-doble-conteo arriba) y
 * los movimientos de caja/banco que NO pertenecen a ningún documento
 * (depósitos, retiros o ajustes manuales).
 */
export async function getLibroDiario(
  client: Client,
  tenantId: string,
  rango: RangoFechas,
  tz: string,
): Promise<MovimientoDiario[]> {
  const [documentos, cuentasBancarias] = await Promise.all([
    getMovimientosDocumento(client, tenantId, rango, tz),
    client.from("mm_cuentas_bancarias").select("id, banco").eq("tenant_id", tenantId),
  ]);

  const documentoIds = idsDocumento(documentos);

  const [caja, ...bancos] = await Promise.all([
    getMovimientosCaja(client, tenantId, rango, tz),
    ...(cuentasBancarias.data ?? []).map((c) =>
      getMovimientosBanco(client, tenantId, c.id, c.banco, rango, tz),
    ),
  ]);

  const manuales = [...caja, ...bancos.flat()].filter(
    (m) => !m.referencia || !documentoIds.has(m.referencia),
  );

  return [...documentos, ...manuales].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Libro Mayor: resumen por cuenta del período (Caja/Banco desde su ledger
 * completo, para que su saldo coincida con Caja/Bancos; el resto desde los
 * movimientos "documento"). */
export async function getLibroMayor(
  client: Client,
  tenantId: string,
  rango: RangoFechas,
  tz: string,
): Promise<CuentaResumen[]> {
  const [documentos, cuentasBancarias] = await Promise.all([
    getMovimientosDocumento(client, tenantId, rango, tz),
    client.from("mm_cuentas_bancarias").select("id, banco").eq("tenant_id", tenantId),
  ]);

  const [caja, ...bancos] = await Promise.all([
    getMovimientosCaja(client, tenantId, rango, tz),
    ...(cuentasBancarias.data ?? []).map((c) =>
      getMovimientosBanco(client, tenantId, c.id, c.banco, rango, tz),
    ),
  ]);

  return agruparPorCuenta([...documentos, ...caja, ...bancos.flat()]);
}

/** Agrupa una lista de movimientos por cuenta, con su total y cantidad. */
export function agruparPorCuenta(movimientos: MovimientoDiario[]): CuentaResumen[] {
  const map = new Map<string, CuentaResumen>();
  for (const m of movimientos) {
    const entry = map.get(m.cuentaSlug) ?? {
      cuenta: m.cuenta,
      cuentaSlug: m.cuentaSlug,
      totalUsd: 0,
      totalBs: 0,
      numMovimientos: 0,
    };
    const signo = m.efecto === "entrada" ? 1 : -1;
    entry.totalUsd = r2(entry.totalUsd + signo * m.montoUsd);
    entry.totalBs = r2(entry.totalBs + signo * m.montoBs);
    entry.numMovimientos += 1;
    map.set(m.cuentaSlug, entry);
  }
  return [...map.values()].sort((a, b) => a.cuenta.localeCompare(b.cuenta, "es"));
}

/** Movimientos de una cuenta específica del Libro Mayor (para su detalle). */
export async function getLibroMayorCuenta(
  client: Client,
  tenantId: string,
  cuentaSlug: string,
  rango: RangoFechas,
  tz: string,
): Promise<MovimientoDiario[]> {
  if (cuentaSlug === "caja") {
    return getMovimientosCaja(client, tenantId, rango, tz);
  }
  if (cuentaSlug.startsWith("banco-")) {
    const cuentaId = cuentaSlug.slice("banco-".length);
    const { data: cuenta } = await client
      .from("mm_cuentas_bancarias")
      .select("id, banco")
      .eq("tenant_id", tenantId)
      .eq("id", cuentaId)
      .maybeSingle();
    if (!cuenta) return [];
    return getMovimientosBanco(client, tenantId, cuenta.id, cuenta.banco, rango, tz);
  }
  const documentos = await getMovimientosDocumento(client, tenantId, rango, tz);
  return documentos.filter((m) => m.cuentaSlug === cuentaSlug);
}
