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
  getDetalleVentas,
  getVentasPorSucursal,
} from "@/lib/minimarket/data/reportes";
import { fetchAllRows } from "@/lib/minimarket/data/pagination";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaHora, rangoLocalAUtc } from "@/lib/minimarket/date-format";
import { agregarHoja, respuestaXlsx } from "@/lib/minimarket/reportes/excel-plantilla";
import { ivaDeValor, preciosConIva } from "@/lib/minimarket/reportes/inventario-iva";
import { totalBsVenta } from "@/lib/minimarket/pos-calc";
import { corteInventario, resolverRangoReporte } from "@/lib/minimarket/reportes/rango";
import { getTasaParaFecha } from "@/lib/minimarket/exchange-rate";

export const runtime = "nodejs";

/** Sin límite práctico: el Excel lista TODOS los productos vendidos del período. */
const TODOS_LOS_PRODUCTOS = 100_000;

const r2 = (n: number) => Math.round(n * 100) / 100;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Documento HTML imprimible (se abre y lanza el diálogo de imprimir / guardar PDF). */
function paginaImprimible(titulo: string, encabezado: string, cuerpo: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${titulo}</title>
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
  tfoot td{background:#f4f4f4;font-weight:700}
  .right{text-align:right}
  .sub{color:#666;font-size:10px;white-space:nowrap}
  .bajo{color:#b91c1c;font-weight:700}
  @media print{@page{size:A4;margin:12mm}body{padding:0}}
</style>
</head>
<body>
${encabezado}
${cuerpo}
<hr style="border:none;border-top:1px solid #ddd;margin:24px 0 8px">
<p style="text-align:center;font-size:9px;color:#999">Comprobante interno — no es una factura fiscal</p>
<script>window.onload=function(){window.print()}</script>
</body>
</html>`;
}

const thead = (cols: string[]) => `<tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr>`;
const row = (...cells: string[]) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;

function respuestaHtml(html: string, nombre: string) {
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="${nombre}.html"`,
    },
  });
}

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

  // Sucursal (opcional): solo se acepta una del propio tenant; sin ella o con
  // un id ajeno, el reporte es de todas las sucursales.
  const { data: sucursales } = await supabase
    .from("mm_sucursales")
    .select("id, nombre")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const sucursalSel = (sucursales ?? []).find((x) => x.id === searchParams.get("sucursal"));
  const sucursalId = sucursalSel?.id ?? null;
  const sucursalLabel = sucursalSel ? `Sucursal: ${sucursalSel.nombre}` : "Todas las sucursales";
  const sufijoArchivo = sucursalSel
    ? `_${sucursalSel.nombre.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`
    : "";

  if (tipo === "ventas") {
    const { rango } = resolverRangoReporte({ desde, hasta }, tz);
    const { desdeIso, hastaIso } = rangoLocalAUtc(rango, tz);
    const periodo = rango.desde === rango.hasta ? rango.desde : `${rango.desde} al ${rango.hasta}`;

    const [ventas, productos, detalle] = await Promise.all([
      // Paginado: sin esto PostgREST corta en 1000 ventas en silencio.
      fetchAllRows((from, to) => {
        let q = supabase
          .from("mm_ventas")
          .select(
            "id, fecha, numero_documento, total_usd, subtotal_usd, descuento_usd, igtf_usd, total_bs, tasa_usada, cliente_id, sucursal_id",
          )
          .eq("tenant_id", tenantId)
          .eq("estado", "completada")
          .is("deleted_at", null)
          .gte("fecha", desdeIso)
          .lt("fecha", hastaIso);
        if (sucursalId) q = q.eq("sucursal_id", sucursalId);
        return q
          .order("fecha", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to);
      }),
      getProductosMasVendidos(supabase, tenantId, rango, tz, TODOS_LOS_PRODUCTOS, sucursalId),
      getDetalleVentas(supabase, tenantId, rango, tz, sucursalId),
    ]);

    const clienteIds = [...new Set(ventas.flatMap((v) => (v.cliente_id ? [v.cliente_id] : [])))];
    const clienteMap = new Map<string, string>();
    for (let i = 0; i < clienteIds.length; i += 200) {
      const { data: clientes } = await supabase
        .from("mm_clientes")
        .select("id, nombre")
        .in("id", clienteIds.slice(i, i + 200))
        .eq("tenant_id", tenantId);
      for (const c of clientes ?? []) clienteMap.set(c.id, c.nombre);
    }
    const sucursalMap = new Map((sucursales ?? []).map((x) => [x.id, x.nombre]));

    const suma = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
    const wb = new ExcelJS.Workbook();
    wb.creator = negocio.nombre;

    agregarHoja(wb, {
      nombre: "Ventas",
      titulo: "Reporte de ventas",
      negocio,
      subtitulos: [
        `Período: ${periodo} · ${sucursalLabel}`,
        `${ventas.length} ventas completadas · ${generado}`,
      ],
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
        `Período: ${periodo} · ${sucursalLabel} · ${generado}`,
        "Precio unit.: precio al que se vendió (promedio ponderado si varió). Bs: a la tasa congelada de cada venta. Margen: (precio vendido − costo actual) × unidades, mismo criterio que la utilidad estimada.",
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
        {
          titulo: "Precio unit. Bs",
          ancho: 15,
          tipo: "bs",
          valor: (p) => p.precio_unitario_bs,
        },
        { titulo: "Ingreso USD", ancho: 14, tipo: "usd", valor: (p) => r2(p.ingreso_usd) },
        { titulo: "Ingreso Bs", ancho: 17, tipo: "bs", valor: (p) => p.ingreso_bs },
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
        null,
        suma(productos.map((p) => p.ingreso_usd)),
        suma(productos.map((p) => p.ingreso_bs)),
        null,
        Math.round(margenTotal * 100) / 100,
        baseTotal > 0 ? margenTotal / baseTotal : null,
      ],
    });

    agregarHoja(wb, {
      nombre: "Detalle de ventas",
      titulo: "Detalle de ventas (producto por producto)",
      negocio,
      subtitulos: [
        `Período: ${periodo} · ${sucursalLabel} · ${generado}`,
        `${new Set(detalle.map((l) => l.venta_id)).size} ventas · ${detalle.length} líneas · Bs a la tasa congelada de cada venta`,
      ],
      filas: detalle,
      columnas: [
        {
          titulo: "Fecha y hora",
          ancho: 20,
          tipo: "texto",
          valor: (l) => fmtFechaHora(l.fecha, tz),
        },
        { titulo: "N.º", ancho: 12, tipo: "texto", valor: (l) => l.numero_documento ?? "" },
        { titulo: "SKU", ancho: 14, tipo: "texto", valor: (l) => l.codigo ?? "" },
        { titulo: "Producto", ancho: 34, tipo: "texto", valor: (l) => l.descripcion },
        { titulo: "Cantidad", ancho: 11, tipo: "cantidad", valor: (l) => l.cantidad },
        { titulo: "Precio unit. USD", ancho: 15, tipo: "usd", valor: (l) => r2(l.precio_usd) },
        { titulo: "Total USD", ancho: 14, tipo: "usd", valor: (l) => r2(l.total_usd) },
        { titulo: "Tasa (Bs/USD)", ancho: 13, tipo: "tasa", valor: (l) => l.tasa_usada },
        { titulo: "Total Bs", ancho: 17, tipo: "bs", valor: (l) => l.total_bs },
      ],
      totales: [
        "TOTALES",
        null,
        null,
        null,
        detalle.reduce((a, l) => a + l.cantidad, 0),
        null,
        suma(detalle.map((l) => l.total_usd)),
        null,
        suma(detalle.map((l) => l.total_bs)),
      ],
    });

    return respuestaXlsx(
      await wb.xlsx.writeBuffer(),
      `ventas_${rango.desde}_${rango.hasta}${sufijoArchivo}.xlsx`,
    );
  } else if (tipo === "inventario") {
    // Corte al final del día "hasta" del reporte (sin rango o hasta = hoy →
    // stock actual). Tasa para los Bs: la de ESE día.
    const { fechaCorte, corteIso } = corteInventario(hasta ?? "", tz);
    const [inventario, tasaCorte, { data: cfgIva }] = await Promise.all([
      getInventarioReporte(supabase, tenantId, { corteIso, sucursalId }),
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
        valorConIvaBs: tasa
          ? totalBsVenta({
              subtotalNeto: valorSinIva,
              igtf: 0,
              tasa,
              ivaActivo: ivaStock > 0,
              ivaPct,
            })
          : null,
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
        `${sucursalLabel} · Corte al ${fechaCorte}${corteIso ? " (stock al cierre de ese día)" : " (stock actual)"} · ${inventario.totalProductos} productos · ${inventario.productosBajoMinimo} bajo mínimo`,
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
        tasa ? sumar(filas.map((f) => f.valorConIvaBs ?? 0)) : null,
      ],
    });

    return respuestaXlsx(
      await wb.xlsx.writeBuffer(),
      `inventario_${fechaCorte}${sufijoArchivo}.xlsx`,
    );
  } else if (tipo === "inventario-pdf") {
    const { fechaCorte, corteIso } = corteInventario(hasta ?? "", tz);
    const inventario = await getInventarioReporte(supabase, tenantId, { corteIso, sucursalId });
    const usdFmt = new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD" });
    const fmt = (v: number) => usdFmt.format(v);
    const der = (t: string) => `<span class="right">${t}</span>`;

    const encabezado = `<h1>${escapeHtml(negocio.nombre)}</h1>
<p class="meta">Inventario valorizado · ${escapeHtml(sucursalLabel)} · Corte al ${fechaCorte}${corteIso ? " (stock al cierre de ese día)" : " (stock actual)"} · costo y precio actuales · ${generado}</p>`;
    const cuerpo = `<div class="kpis">
  <div class="kpi"><div class="label">Productos</div><div class="val">${inventario.totalProductos}</div></div>
  <div class="kpi"><div class="label">Con stock</div><div class="val">${inventario.totalActivos}</div></div>
  <div class="kpi"><div class="label">Bajo mínimo</div><div class="val">${inventario.productosBajoMinimo}</div></div>
  <div class="kpi"><div class="label">Valor a costo</div><div class="val">${fmt(inventario.valorCostoUsd)}</div></div>
  <div class="kpi"><div class="label">Valor a precio venta</div><div class="val">${fmt(inventario.valorVentaUsd)}</div></div>
</div>

<h2>Detalle por producto</h2>
<table>
  <thead>${thead(["SKU", "Producto", "Categoría", "Stock", "Mín.", "Costo USD", "Precio USD", "Val. costo", "Val. venta"])}</thead>
  <tbody>
  ${inventario.items
    .map((p) =>
      row(
        escapeHtml(p.codigo ?? "—"),
        escapeHtml(p.nombre) + (p.bajo_minimo ? ' <span class="bajo">(bajo mín.)</span>' : ""),
        escapeHtml(p.categoria ?? "—"),
        der(String(p.stock_actual)),
        der(p.stock_minimo === null ? "—" : String(p.stock_minimo)),
        der(p.costo_usd > 0 ? fmt(p.costo_usd) : "—"),
        der(p.precio_usd > 0 ? fmt(p.precio_usd) : "—"),
        der(p.costo_usd > 0 ? fmt(p.valor_costo_total) : "—"),
        der(p.precio_usd > 0 ? fmt(p.valor_venta_total) : "—"),
      ),
    )
    .join("")}
  </tbody>
  <tfoot><tr><td colspan="7">TOTALES (${inventario.totalProductos} productos)</td><td>${der(fmt(inventario.valorCostoUsd))}</td><td>${der(fmt(inventario.valorVentaUsd))}</td></tr></tfoot>
</table>`;
    return respuestaHtml(
      paginaImprimible(`Inventario ${fechaCorte}`, encabezado, cuerpo),
      `inventario_${fechaCorte}${sufijoArchivo}`,
    );
  } else if (tipo === "pdf") {
    const { rango } = resolverRangoReporte({ desde, hasta }, tz);
    const usdFmt = new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD" });
    const fmt = (v: number) => usdFmt.format(v);
    const bsFmt = new Intl.NumberFormat("es-VE", { style: "currency", currency: "VES" });
    // USD arriba y, debajo, los Bs a la tasa congelada de cada venta.
    const usdYBs = (u: number, b: number) =>
      `<span class="right">${fmt(u)}<br><span class="sub">${bsFmt.format(b)}</span></span>`;

    const [resumen, ventasDia, porMetodo, masVendidos, porCajero, detalle, porSucursal] =
      await Promise.all([
        getResumenPeriodo(supabase, tenantId, rango, tz, sucursalId),
        getVentasPorDia(supabase, tenantId, rango, tz, sucursalId),
        getVentasPorMetodo(supabase, tenantId, rango, tz, sucursalId),
        getProductosMasVendidos(supabase, tenantId, rango, tz, TODOS_LOS_PRODUCTOS, sucursalId),
        getVentasPorCajero(supabase, tenantId, rango, tz, sucursalId),
        getDetalleVentas(supabase, tenantId, rango, tz, sucursalId),
        sucursalId
          ? Promise.resolve([])
          : getVentasPorSucursal(supabase, tenantId, rango, tz, sucursales ?? []),
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

    const encabezado = `<h1>${nombreNegocio}</h1>
<p class="meta">Reporte de ventas · ${escapeHtml(sucursalLabel)} · ${rango.desde === rango.hasta ? rango.desde : `${rango.desde} al ${rango.hasta}`} · Generado: ${hoy}</p>`;
    const cuerpo = `
<div class="kpis">
  <div class="kpi"><div class="label">Ventas totales</div><div class="val">${fmt(resumen.totalVentasUsd)}</div></div>
  <div class="kpi"><div class="label">Transacciones</div><div class="val">${resumen.numVentas}</div></div>
  <div class="kpi"><div class="label">Ticket promedio</div><div class="val">${fmt(resumen.ticketPromedioUsd)}</div></div>
  <div class="kpi"><div class="label">Utilidad estimada</div><div class="val">${fmt(resumen.utilidadEstimadaUsd)}</div></div>
  <div class="kpi"><div class="label">IGTF cobrado</div><div class="val">${fmt(resumen.igtfUsd)}</div></div>
</div>

${
  porSucursal.length > 0
    ? `<h2>Por sucursal</h2>
<table>
  ${thead(["Sucursal", "Ventas", "Total USD", "IGTF", "Ticket prom."])}
  ${porSucursal.map((x) => row(escapeHtml(x.sucursal_nombre), String(x.num_ventas), `<span class="right">${fmt(x.total_usd)}</span>`, `<span class="right">${fmt(x.igtf_usd)}</span>`, `<span class="right">${fmt(x.ticket_promedio_usd)}</span>`)).join("")}
</table>`
    : ""
}

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

<h2>Productos vendidos (${masVendidos.length})</h2>
<table>
  ${thead(["#", "SKU", "Producto", "Unidades", "Precio unit.", "Ingreso", "Margen USD", "Margen %"])}
  ${masVendidos.map((p, i) => row(String(i + 1), escapeHtml(p.codigo ?? "—"), escapeHtml(p.descripcion), `<span class="right">${p.unidades}</span>`, usdYBs(p.precio_unitario_usd, p.precio_unitario_bs), usdYBs(p.ingreso_usd, p.ingreso_bs), `<span class="right">${fmt(p.margen_usd)}</span>`, `<span class="right">${p.margen_pct === null ? "—" : p.margen_pct.toFixed(1) + "%"}</span>`)).join("")}
</table>
<p class="meta">Precio unit.: precio al que se vendió (promedio ponderado si varió en el período). Bs: a la tasa congelada de cada venta. Margen: (precio vendido − costo actual del producto) × unidades — mismo criterio que la utilidad estimada.</p>

${
  porCajero.length > 0
    ? `<h2>Por cajero</h2>
<table>
  ${thead(["Cajero", "Ventas", "Total USD", "IGTF", "Ticket prom."])}
  ${porCajero.map((c) => row(escapeHtml(c.cajero_nombre), String(c.num_ventas), `<span class="right">${fmt(c.total_usd)}</span>`, `<span class="right">${fmt(c.igtf_usd)}</span>`, `<span class="right">${fmt(c.ticket_promedio_usd)}</span>`)).join("")}
</table>`
    : ""
}

<h2>Detalle de ventas (${new Set(detalle.map((l) => l.venta_id)).size} ventas · ${detalle.length} líneas)</h2>
<table>
  <thead>${thead(["Fecha y hora", "N.º", "SKU", "Producto", "Cant.", "Precio unit.", "Total"])}</thead>
  <tbody>
  ${detalle.map((l) => row(fmtFechaHora(l.fecha, tz), escapeHtml(l.numero_documento ?? "—"), escapeHtml(l.codigo ?? "—"), escapeHtml(l.descripcion), `<span class="right">${l.cantidad}</span>`, `<span class="right">${fmt(l.precio_usd)}</span>`, usdYBs(l.total_usd, l.total_bs))).join("")}
  </tbody>
  <tfoot><tr><td colspan="4">TOTALES</td><td><span class="right">${r2(detalle.reduce((a, l) => a + l.cantidad, 0))}</span></td><td></td><td>${usdYBs(
    detalle.reduce((a, l) => a + l.total_usd, 0),
    detalle.reduce((a, l) => a + l.total_bs, 0),
  )}</td></tr></tfoot>
</table>`;

    return respuestaHtml(
      paginaImprimible(`Reporte ${rango.desde} — ${rango.hasta}`, encabezado, cuerpo),
      `reporte_${rango.desde}_${rango.hasta}${sufijoArchivo}`,
    );
  } else {
    return new NextResponse("Tipo no válido", { status: 400 });
  }
}
