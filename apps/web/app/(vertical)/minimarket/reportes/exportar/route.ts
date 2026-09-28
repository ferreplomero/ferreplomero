import { type NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  getInventarioReporte,
  getResumenPeriodo,
  getVentasPorDia,
  getVentasPorMetodo,
  getProductosMasVendidos,
  getVentasPorCajero,
} from "@/lib/minimarket/data/reportes";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaHora, rangoLocalAUtc } from "@/lib/minimarket/date-format";
import { agregarHoja, respuestaXlsx } from "@/lib/minimarket/reportes/excel-plantilla";
import { ivaDeValor, preciosConIva } from "@/lib/minimarket/reportes/inventario-iva";
import { corteInventario, resolverRangoReporte } from "@/lib/minimarket/reportes/rango";
import { getTasaParaFecha } from "@/lib/minimarket/exchange-rate";

export const runtime = "nodejs";

/** Sin límite práctico: el Excel lista TODOS los productos vendidos del período. */
const TODOS_LOS_PRODUCTOS = 100_000;

const r2 = (n: number) => Math.round(n * 100) / 100;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET(request: NextRequest) {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get("tipo") ?? "ventas";
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");

  const supabase = await createClient();
  const tz = await getTimezoneNegocio(supabase, tenantId);

  const { data: negocioCfg } = await supabase
    .from("mm_config_negocio")
    .select("nombre_comercial, rif")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const negocio = {
    nombre: negocioCfg?.nombre_comercial || "Mi negocio",
    rif: negocioCfg?.rif ?? null,
  };
  const generado = `Generado: ${fmtFechaHora(new Date().toISOString(), tz)}`;

  if (tipo === "ventas") {
    const { rango } = resolverRangoReporte({ desde, hasta }, tz);
    const { desdeIso, hastaIso } = rangoLocalAUtc(rango, tz);
    const periodo = rango.desde === rango.hasta ? rango.desde : `${rango.desde} al ${rango.hasta}`;

    const [{ data: ventasData }, productos, { data: sucursales }] = await Promise.all([
      supabase
        .from("mm_ventas")
        .select(
          "id, fecha, numero_documento, total_usd, subtotal_usd, descuento_usd, igtf_usd, total_bs, tasa_usada, cliente_id, sucursal_id",
        )
        .eq("tenant_id", tenantId)
        .eq("estado", "completada")
        .is("deleted_at", null)
        .gte("fecha", desdeIso)
        .lt("fecha", hastaIso)
        .order("fecha", { ascending: true }),
      getProductosMasVendidos(supabase, tenantId, rango, tz, TODOS_LOS_PRODUCTOS),
      supabase.from("mm_sucursales").select("id, nombre").eq("tenant_id", tenantId),
    ]);
    const ventas = ventasData ?? [];

    const clienteIds = [...new Set(ventas.flatMap((v) => (v.cliente_id ? [v.cliente_id] : [])))];
    const { data: clientes } =
      clienteIds.length > 0
        ? await supabase
            .from("mm_clientes")
            .select("id, nombre")
            .in("id", clienteIds)
            .eq("tenant_id", tenantId)
        : { data: [] };
    const clienteMap = new Map((clientes ?? []).map((c) => [c.id, c.nombre]));
    const sucursalMap = new Map((sucursales ?? []).map((x) => [x.id, x.nombre]));

    const suma = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
    const wb = new ExcelJS.Workbook();
    wb.creator = negocio.nombre;

    agregarHoja(wb, {
      nombre: "Ventas",
      titulo: "Reporte de ventas",
      negocio,
      subtitulos: [`Período: ${periodo}`, `${ventas.length} ventas completadas · ${generado}`],
      filas: ventas,
      columnas: [
        {
          titulo: "Fecha y hora",
          ancho: 20,
          tipo: "texto",
          valor: (v) => fmtFechaHora(v.fecha, tz),
        },
        { titulo: "N.º", ancho: 12, tipo: "texto", valor: (v) => v.numero_documento ?? "" },
        {
          titulo: "Sucursal",
          ancho: 16,
          tipo: "texto",
          valor: (v) => sucursalMap.get(v.sucursal_id) ?? "",
        },
        {
          titulo: "Cliente",
          ancho: 26,
          tipo: "texto",
          valor: (v) => (v.cliente_id ? (clienteMap.get(v.cliente_id) ?? "") : "Cliente ocasional"),
        },
        { titulo: "Subtotal USD", ancho: 14, tipo: "usd", valor: (v) => Number(v.subtotal_usd) },
        { titulo: "Descuento USD", ancho: 14, tipo: "usd", valor: (v) => Number(v.descuento_usd) },
        { titulo: "IGTF USD", ancho: 12, tipo: "usd", valor: (v) => Number(v.igtf_usd) },
        { titulo: "Total USD", ancho: 14, tipo: "usd", valor: (v) => Number(v.total_usd) },
        { titulo: "Tasa (Bs/USD)", ancho: 13, tipo: "tasa", valor: (v) => Number(v.tasa_usada) },
        { titulo: "Total Bs", ancho: 17, tipo: "bs", valor: (v) => Number(v.total_bs) },
      ],
      totales: [
        "TOTALES",
        null,
        null,
        null,
        suma(ventas.map((v) => Number(v.subtotal_usd))),
        suma(ventas.map((v) => Number(v.descuento_usd))),
        suma(ventas.map((v) => Number(v.igtf_usd))),
        suma(ventas.map((v) => Number(v.total_usd))),
        null,
        suma(ventas.map((v) => Number(v.total_bs))),
      ],
    });

    const baseTotal = productos.reduce((a, p) => a + p.precio_unitario_usd * p.unidades, 0);
    const margenTotal = productos.reduce((a, p) => a + p.margen_usd, 0);
    agregarHoja(wb, {
      nombre: "Productos vendidos",
      titulo: "Productos vendidos",
      negocio,
      subtitulos: [
        `Período: ${periodo} · ${generado}`,
        "Precio unit.: precio al que se vendió (promedio ponderado si varió). Margen: (precio vendido − costo actual) × unidades, mismo criterio que la utilidad estimada.",
      ],
      filas: productos,
      columnas: [
        { titulo: "SKU", ancho: 14, tipo: "texto", valor: (p) => p.codigo ?? "" },
        { titulo: "Producto", ancho: 34, tipo: "texto", valor: (p) => p.descripcion },
        { titulo: "Unidades", ancho: 11, tipo: "cantidad", valor: (p) => p.unidades },
        {
          titulo: "Precio unit. USD",
          ancho: 15,
          tipo: "usd",
          valor: (p) => r2(p.precio_unitario_usd),
        },
        { titulo: "Ingreso USD", ancho: 14, tipo: "usd", valor: (p) => r2(p.ingreso_usd) },
        { titulo: "Costo unit. USD", ancho: 15, tipo: "usd", valor: (p) => p.costo_unitario_usd },
        { titulo: "Margen USD", ancho: 14, tipo: "usd", valor: (p) => r2(p.margen_usd) },
        {
          titulo: "Margen %",
          ancho: 11,
          tipo: "pct",
          valor: (p) => (p.margen_pct === null ? null : p.margen_pct / 100),
        },
      ],
      totales: [
        "TOTALES",
        null,
        productos.reduce((a, p) => a + p.unidades, 0),
        null,
        suma(productos.map((p) => p.ingreso_usd)),
        null,
        Math.round(margenTotal * 100) / 100,
        baseTotal > 0 ? margenTotal / baseTotal : null,
      ],
    });

    return respuestaXlsx(await wb.xlsx.writeBuffer(), `ventas_${rango.desde}_${rango.hasta}.xlsx`);
  } else if (tipo === "inventario") {
    // Corte al final del día "hasta" del reporte (sin rango o hasta = hoy →
    // stock actual). Tasa para los Bs: la de ESE día.
    const { fechaCorte, corteIso } = corteInventario(hasta ?? "", tz);
    const [inventario, tasaCorte, { data: cfgIva }] = await Promise.all([
      getInventarioReporte(supabase, tenantId, { corteIso }),
      getTasaParaFecha(supabase, tenantId, fechaCorte),
      supabase
        .from("mm_config_negocio")
        .select("parametros")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
    ]);
    const parametros =
      cfgIva?.parametros &&
      typeof cfgIva.parametros === "object" &&
      !Array.isArray(cfgIva.parametros)
        ? (cfgIva.parametros as Record<string, unknown>)
        : {};
    // Mismo porcentaje que usa la venta (`params.iva_pct ?? 16`). Se aplica
    // de forma REFERENCIAL a todo producto no exento, aunque el negocio tenga
    // el IVA desactivado (decisión del usuario) — se aclara en el encabezado.
    const ivaPct = Number(parametros.iva_pct ?? 16);
    const ivaActivo = Boolean(parametros.iva_activo ?? false);
    const tasa = tasaCorte && tasaCorte.valor > 0 ? tasaCorte.valor : null;

    const filas = inventario.items.map((p) => {
      const precios = preciosConIva(p.precio_usd, p.impuesto_id, ivaPct, tasa);
      const valorSinIva = r2(p.valor_venta_total);
      const ivaStock = ivaDeValor(p.valor_venta_total, p.impuesto_id, ivaPct);
      const valorConIva = r2(valorSinIva + ivaStock);
      return {
        p,
        precios,
        valorSinIva,
        ivaStock,
        valorConIva,
        valorConIvaBs: tasa ? r2(valorConIva * tasa) : null,
      };
    });
    const sumar = (xs: number[]) => r2(xs.reduce((x, y) => x + y, 0));
    const totalConIva = sumar(filas.map((f) => f.valorConIva));

    const wb = new ExcelJS.Workbook();
    wb.creator = negocio.nombre;

    agregarHoja(wb, {
      nombre: "Inventario",
      titulo: "Inventario valorizado",
      negocio,
      subtitulos: [
        `Corte al ${fechaCorte}${corteIso ? " (stock al cierre de ese día)" : " (stock actual)"} · ${inventario.totalProductos} productos · ${inventario.productosBajoMinimo} bajo mínimo`,
        tasa
          ? `Tasa del ${fechaCorte}: Bs ${tasa.toFixed(2)} / USD (${tasaCorte?.fuente === "manual" ? "personalizada" : "oficial"}) · IVA ${ivaPct}% sobre productos gravados${ivaActivo ? "" : " (referencial: el IVA está desactivado en Configuración)"}`
          : `Sin tasa registrada para el ${fechaCorte}: columnas en Bs vacías · IVA ${ivaPct}% sobre productos gravados`,
        `Costo y precio: valores actuales del producto · ${generado}`,
      ],
      filas,
      columnas: [
        { titulo: "SKU", ancho: 14, tipo: "texto", valor: (f) => f.p.codigo ?? "" },
        { titulo: "Producto", ancho: 32, tipo: "texto", valor: (f) => f.p.nombre },
        { titulo: "Categoría", ancho: 16, tipo: "texto", valor: (f) => f.p.categoria ?? "" },
        { titulo: "Stock al corte", ancho: 11, tipo: "cantidad", valor: (f) => f.p.stock_actual },
        { titulo: "Stock mínimo", ancho: 10, tipo: "cantidad", valor: (f) => f.p.stock_minimo },
        {
          titulo: "Bajo mínimo",
          ancho: 9,
          tipo: "texto",
          valor: (f) => (f.p.bajo_minimo ? "Sí" : "No"),
        },
        { titulo: "Costo USD", ancho: 12, tipo: "usd", valor: (f) => f.p.costo_usd },
        {
          titulo: "Impuesto",
          ancho: 10,
          tipo: "texto",
          valor: (f) => (f.precios.gravado ? `IVA ${ivaPct}%` : "Exento"),
        },
        { titulo: "Precio sin IVA USD", ancho: 13, tipo: "usd", valor: (f) => f.precios.sinIvaUsd },
        { titulo: "IVA USD", ancho: 11, tipo: "usd", valor: (f) => f.precios.ivaUsd },
        { titulo: "Precio con IVA USD", ancho: 13, tipo: "usd", valor: (f) => f.precios.conIvaUsd },
        { titulo: "Precio sin IVA Bs", ancho: 15, tipo: "bs", valor: (f) => f.precios.sinIvaBs },
        { titulo: "IVA Bs", ancho: 13, tipo: "bs", valor: (f) => f.precios.ivaBs },
        { titulo: "Precio con IVA Bs", ancho: 15, tipo: "bs", valor: (f) => f.precios.conIvaBs },
        {
          titulo: "Margen %",
          ancho: 9,
          tipo: "pct",
          valor: (f) =>
            f.p.precio_usd > 0 ? (f.p.precio_usd - f.p.costo_usd) / f.p.precio_usd : null,
        },
        {
          titulo: "Valor costo USD",
          ancho: 14,
          tipo: "usd",
          valor: (f) => r2(f.p.valor_costo_total),
        },
        { titulo: "Valor venta sin IVA USD", ancho: 15, tipo: "usd", valor: (f) => f.valorSinIva },
        { titulo: "IVA del stock USD", ancho: 13, tipo: "usd", valor: (f) => f.ivaStock },
        { titulo: "Valor venta con IVA USD", ancho: 15, tipo: "usd", valor: (f) => f.valorConIva },
        { titulo: "Valor venta con IVA Bs", ancho: 17, tipo: "bs", valor: (f) => f.valorConIvaBs },
      ],
      totales: [
        "TOTALES",
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        r2(inventario.valorCostoUsd),
        sumar(filas.map((f) => f.valorSinIva)),
        sumar(filas.map((f) => f.ivaStock)),
        totalConIva,
        tasa ? r2(totalConIva * tasa) : null,
      ],
    });

    return respuestaXlsx(await wb.xlsx.writeBuffer(), `inventario_${fechaCorte}.xlsx`);
  } else if (tipo === "pdf") {
    const { rango } = resolverRangoReporte({ desde, hasta }, tz);
    const usdFmt = new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD" });
    const fmt = (v: number) => usdFmt.format(v);

    const [resumen, ventasDia, porMetodo, masVendidos, porCajero] = await Promise.all([
      getResumenPeriodo(supabase, tenantId, rango, tz),
      getVentasPorDia(supabase, tenantId, rango, tz),
      getVentasPorMetodo(supabase, tenantId, rango, tz),
      getProductosMasVendidos(supabase, tenantId, rango, tz, 10),
      getVentasPorCajero(supabase, tenantId, rango, tz),
    ]);

    const nombreNegocio = escapeHtml(negocio.nombre);
    const hoy = new Date().toLocaleDateString("es-VE", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    const METODO_LABEL: Record<string, string> = {
      efectivo_bs: "Efectivo Bs",
      efectivo_usd: "Efectivo USD",
      pago_movil: "Pago móvil",
      transferencia: "Transferencia",
      zelle: "Zelle",
      tarjeta: "Tarjeta",
      cashea: "Cashea",
      fiado: "Fiado",
    };

    const thead = (cols: string[]) => `<tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr>`;

    const row = (...cells: string[]) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Reporte ${rango.desde} — ${rango.hasta}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:24px}
  h1{font-size:18px;margin-bottom:2px}
  h2{font-size:13px;margin:20px 0 6px;border-bottom:1px solid #ccc;padding-bottom:4px}
  .meta{color:#555;font-size:10px;margin-bottom:16px}
  .kpis{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px}
  .kpi{border:1px solid #ddd;border-radius:4px;padding:8px 14px;min-width:140px}
  .kpi .label{font-size:9px;color:#666;text-transform:uppercase;letter-spacing:.5px}
  .kpi .val{font-size:15px;font-weight:700;margin-top:2px}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}
  th{background:#f4f4f4;text-align:left;padding:5px 8px;font-size:10px;border:1px solid #ddd}
  td{padding:4px 8px;border:1px solid #e8e8e8;vertical-align:top}
  tr:nth-child(even) td{background:#fafafa}
  .right{text-align:right}
  @media print{@page{size:A4;margin:12mm}body{padding:0}}
</style>
</head>
<body>
<h1>${nombreNegocio}</h1>
<p class="meta">Reporte de ventas · ${rango.desde === rango.hasta ? rango.desde : `${rango.desde} al ${rango.hasta}`} · Generado: ${hoy}</p>

<div class="kpis">
  <div class="kpi"><div class="label">Ventas totales</div><div class="val">${fmt(resumen.totalVentasUsd)}</div></div>
  <div class="kpi"><div class="label">Transacciones</div><div class="val">${resumen.numVentas}</div></div>
  <div class="kpi"><div class="label">Ticket promedio</div><div class="val">${fmt(resumen.ticketPromedioUsd)}</div></div>
  <div class="kpi"><div class="label">Utilidad estimada</div><div class="val">${fmt(resumen.utilidadEstimadaUsd)}</div></div>
  <div class="kpi"><div class="label">IGTF cobrado</div><div class="val">${fmt(resumen.igtfUsd)}</div></div>
</div>

<h2>Ventas por día</h2>
<table>
  ${thead(["Fecha", "Ventas", "Total USD"])}
  ${ventasDia.map((d) => row(d.fecha, String(d.num_ventas), `<span class="right">${fmt(d.total_usd)}</span>`)).join("")}
</table>

<h2>Por método de pago</h2>
<table>
  ${thead(["Método", "Pagos", "Total"])}
  ${porMetodo.map((m) => row(METODO_LABEL[m.metodo] ?? m.metodo, String(m.num_pagos), `<span class="right">${m.moneda === "VES" ? "Bs. " + m.monto_total.toFixed(2) : fmt(m.monto_total)}</span>`)).join("")}
</table>

<h2>Top 10 productos más vendidos</h2>
<table>
  ${thead(["#", "SKU", "Producto", "Unidades", "Precio unit.", "Ingreso USD", "Margen USD", "Margen %"])}
  ${masVendidos.map((p, i) => row(String(i + 1), escapeHtml(p.codigo ?? "—"), escapeHtml(p.descripcion), `<span class="right">${p.unidades}</span>`, `<span class="right">${fmt(p.precio_unitario_usd)}</span>`, `<span class="right">${fmt(p.ingreso_usd)}</span>`, `<span class="right">${fmt(p.margen_usd)}</span>`, `<span class="right">${p.margen_pct === null ? "—" : p.margen_pct.toFixed(1) + "%"}</span>`)).join("")}
</table>
<p class="meta">Precio unit.: precio al que se vendió (promedio ponderado si varió en el período). Margen: (precio vendido − costo actual del producto) × unidades — mismo criterio que la utilidad estimada.</p>

${
  porCajero.length > 0
    ? `<h2>Por cajero</h2>
<table>
  ${thead(["Cajero", "Ventas", "Total USD", "IGTF", "Ticket prom."])}
  ${porCajero.map((c) => row(c.cajero_nombre, String(c.num_ventas), `<span class="right">${fmt(c.total_usd)}</span>`, `<span class="right">${fmt(c.igtf_usd)}</span>`, `<span class="right">${fmt(c.ticket_promedio_usd)}</span>`)).join("")}
</table>`
    : ""
}

<hr style="border:none;border-top:1px solid #ddd;margin:24px 0 8px">
<p style="text-align:center;font-size:9px;color:#999">Comprobante interno de venta — no es una factura fiscal</p>
<script>window.onload=function(){window.print()}</script>
</body>
</html>`;

    const periodo2 = `${rango.desde}_${rango.hasta}`;
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="reporte_${periodo2}.html"`,
      },
    });
  } else {
    return new NextResponse("Tipo no válido", { status: 400 });
  }
}
