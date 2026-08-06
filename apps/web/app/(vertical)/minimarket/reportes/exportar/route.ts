import { type NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  rangoPreset,
  getInventarioReporte,
  getResumenPeriodo,
  getVentasPorDia,
  getVentasPorMetodo,
  getProductosMasVendidos,
  getVentasPorCajero,
} from "@/lib/minimarket/data/reportes";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { hoyEnTz, rangoLocalAUtc } from "@/lib/minimarket/date-format";

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows: Record<string, string | number | null | undefined>[]): string {
  if (rows.length === 0) return "";
  const firstRow = rows[0];
  if (!firstRow) return "";
  const headers = Object.keys(firstRow);
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
  ];
  return "﻿" + lines.join("\r\n"); // BOM for Excel UTF-8
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

  let csv = "";
  let filename = "exportacion.csv";

  if (tipo === "ventas") {
    const rango = desde && hasta ? { desde, hasta } : rangoPreset("mes", tz);
    const { desdeIso, hastaIso } = rangoLocalAUtc(rango, tz);

    const { data: ventasData } = await supabase
      .from("mm_ventas")
      .select(
        "id, fecha, numero_documento, estado, total_usd, subtotal_usd, descuento_usd, igtf_usd, cliente_id",
      )
      .eq("tenant_id", tenantId)
      .eq("estado", "completada")
      .is("deleted_at", null)
      .gte("fecha", desdeIso)
      .lt("fecha", hastaIso)
      .order("fecha", { ascending: false });

    const clienteIds = [
      ...new Set((ventasData ?? []).flatMap((v) => (v.cliente_id ? [v.cliente_id] : []))),
    ];

    const { data: clientes } =
      clienteIds.length > 0
        ? await supabase
            .from("mm_clientes")
            .select("id, nombre")
            .in("id", clienteIds)
            .eq("tenant_id", tenantId)
        : { data: [] };

    const clienteMap = new Map((clientes ?? []).map((c) => [c.id, c.nombre]));

    const rows = (ventasData ?? []).map((v) => ({
      Fecha: v.fecha,
      Documento: v.numero_documento ?? "",
      Cliente: v.cliente_id ? (clienteMap.get(v.cliente_id) ?? "") : "",
      "Subtotal USD": v.subtotal_usd,
      "Descuento USD": v.descuento_usd,
      "IGTF USD": v.igtf_usd,
      "Total USD": v.total_usd,
    }));

    csv = toCsv(rows);
    filename = `ventas_${rango.desde}_${rango.hasta}.csv`;
  } else if (tipo === "inventario") {
    const inventario = await getInventarioReporte(supabase, tenantId);

    const rows = inventario.items.map((p) => ({
      Código: p.codigo ?? "",
      Producto: p.nombre,
      Categoría: p.categoria ?? "",
      Stock: p.stock_actual,
      "Stock mínimo": p.stock_minimo ?? "",
      "Bajo mínimo": p.bajo_minimo ? "Sí" : "No",
      "Costo USD": p.costo_usd,
      "Precio USD": p.precio_usd,
      "Valor costo USD": p.valor_costo_total,
      "Valor venta USD": p.valor_venta_total,
    }));

    csv = toCsv(rows);
    filename = `inventario_${hoyEnTz(tz)}.csv`;
  } else if (tipo === "pdf") {
    const rango = desde && hasta ? { desde, hasta } : rangoPreset("mes", tz);
    const usdFmt = new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD" });
    const fmt = (v: number) => usdFmt.format(v);

    const [resumen, ventasDia, porMetodo, masVendidos, porCajero] = await Promise.all([
      getResumenPeriodo(supabase, tenantId, rango, tz),
      getVentasPorDia(supabase, tenantId, rango, tz),
      getVentasPorMetodo(supabase, tenantId, rango, tz),
      getProductosMasVendidos(supabase, tenantId, rango, tz, 10),
      getVentasPorCajero(supabase, tenantId, rango, tz),
    ]);

    const { data: negocio } = await supabase
      .from("mm_config_negocio")
      .select("nombre_comercial, rif")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const nombreNegocio = negocio?.nombre_comercial ?? "Mi negocio";
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
  ${thead(["#", "Producto", "Unidades", "Ingreso USD"])}
  ${masVendidos.map((p, i) => row(String(i + 1), p.descripcion, String(p.unidades), `<span class="right">${fmt(p.ingreso_usd)}</span>`)).join("")}
</table>

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

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
