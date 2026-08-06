import { type NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getFinanzasResumen, getFinanzasCompras } from "@/lib/minimarket/data/finanzas";
import { METODOS_PAGO } from "@/lib/minimarket/constants";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { hoyEnTz } from "@/lib/minimarket/date-format";

const LEYENDA =
  "Información de control interno para apoyo contable. No constituye una declaración fiscal ni un documento fiscal. Consulte a su contador para sus obligaciones ante el SENIAT.";

const LEYENDA_COMPARATIVO =
  "La diferencia entre IVA cobrado en ventas e IVA pagado en compras es solo una referencia informativa — NO es el IVA neto a enterar al SENIAT. El cálculo real lo determina su contador.";

function fmt(n: number, moneda: "USD" | "VES"): string {
  return new Intl.NumberFormat("es-VE", { style: "currency", currency: moneda }).format(n);
}

function metodoLabel(metodo: string | null): string {
  if (!metodo) return "—";
  return METODOS_PAGO.find((m) => m.value === metodo)?.label ?? metodo;
}

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const supabase = await createClient();
  const tz = await getTimezoneNegocio(supabase, tenantId);

  const sp = req.nextUrl.searchParams;
  const tipo = sp.get("tipo") ?? "pdf";
  const desde = sp.get("desde") ?? hoyEnTz(tz);
  const hasta = sp.get("hasta") ?? desde;
  const negocioNombre = sp.get("negocio") ?? "Mi negocio";
  const seccion = sp.get("seccion") === "compras" ? "compras" : "ventas";

  const [{ resumen, porMetodo }, { resumen: resumenCompras, porProveedor }, configRes] =
    await Promise.all([
      getFinanzasResumen(supabase, tenantId, { desde, hasta }, tz),
      getFinanzasCompras(supabase, tenantId, { desde, hasta }, tz),
      supabase
        .from("mm_config_negocio")
        .select("parametros")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
    ]);

  const params = (configRes.data?.parametros as Record<string, unknown>) ?? {};
  const ivaActivo = Boolean(params.iva_activo ?? false);
  const ivaPct = Number(params.iva_pct ?? 16);
  const igtfActivo = params.igtf_activo !== false;
  // Mismo criterio que finanzas/page.tsx: el cajero puede activar IVA/IGTF
  // puntualmente por venta sin tocar esta configuración, así que el export
  // no debe ocultar montos realmente cobrados solo porque el default esté apagado.
  const mostrarIva =
    ivaActivo || resumen.ivaRegistradoUsd > 0.001 || resumenCompras.ivaPagadoUsd > 0.001;
  const mostrarIgtf =
    igtfActivo || resumen.igtfCobradoUsd > 0.001 || resumenCompras.igtfPagadoUsd > 0.001;

  const periodoLabel = desde === hasta ? desde : `${desde} al ${hasta}`;
  const diferenciaIva = resumen.ivaRegistradoUsd - resumenCompras.ivaPagadoUsd;

  // ── CSV ──────────────────────────────────────────────────────────────────
  if (tipo === "csv") {
    const rows: string[] =
      seccion === "compras"
        ? [
            `"Reporte de control interno — ${negocioNombre}"`,
            `"Compras — Período: ${periodoLabel}"`,
            `"${LEYENDA}"`,
            "",
            "Concepto,USD,Bs",
            `${csvEscape("Total compras (mercancía + IVA + IGTF)")},${resumenCompras.totalComprasUsd},${resumenCompras.totalComprasBs}`,
            `${csvEscape("IGTF pagado")},${mostrarIgtf ? resumenCompras.igtfPagadoUsd : 0},`,
            `${csvEscape("IVA pagado en compras")},${mostrarIva ? resumenCompras.ivaPagadoUsd : 0},`,
            `${csvEscape("Total pagado en divisa (base IGTF)")},${resumenCompras.totalDivisaUsd},`,
            `${csvEscape("Número de compras")},${resumenCompras.numCompras},`,
            "",
            "Desglose por proveedor",
            "Proveedor,Total USD,# Compras",
            ...porProveedor.map(
              (p) => `${csvEscape(p.proveedorNombre)},${p.totalUsd},${p.numCompras}`,
            ),
            "",
            "Comparativo IVA (referencia — NO es el neto a declarar)",
            `${csvEscape("IVA cobrado en ventas")},${mostrarIva ? resumen.ivaRegistradoUsd : 0},`,
            `${csvEscape("IVA pagado en compras")},${mostrarIva ? resumenCompras.ivaPagadoUsd : 0},`,
            `${csvEscape("Diferencia (solo referencia)")},${mostrarIva ? diferenciaIva : 0},`,
            `"${LEYENDA_COMPARATIVO}"`,
          ]
        : [
            `"Reporte de control interno — ${negocioNombre}"`,
            `"Ventas — Período: ${periodoLabel}"`,
            `"${LEYENDA}"`,
            "",
            "Concepto,USD,Bs",
            `${csvEscape("Total ventas")},${resumen.totalVentasUsd},${resumen.totalVentasBs}`,
            `${csvEscape("IGTF cobrado")},${mostrarIgtf ? resumen.igtfCobradoUsd : 0},`,
            `${csvEscape("IVA registrado en ventas")},${mostrarIva ? resumen.ivaRegistradoUsd : 0},`,
            `${csvEscape("Total cobrado en divisa (base IGTF)")},${resumen.totalDivisaUsd},`,
            `${csvEscape("Número de ventas")},${resumen.numVentas},`,
            "",
            "Desglose por método de pago",
            "Método,Total USD,Total Bs,# Pagos",
            ...porMetodo.map(
              (m) => `${csvEscape(metodoLabel(m.metodo))},${m.totalUsd},${m.totalBs},${m.numPagos}`,
            ),
            "",
            "Comparativo IVA (referencia — NO es el neto a declarar)",
            `${csvEscape("IVA cobrado en ventas")},${mostrarIva ? resumen.ivaRegistradoUsd : 0},`,
            `${csvEscape("IVA pagado en compras")},${mostrarIva ? resumenCompras.ivaPagadoUsd : 0},`,
            `${csvEscape("Diferencia (solo referencia)")},${mostrarIva ? diferenciaIva : 0},`,
            `"${LEYENDA_COMPARATIVO}"`,
          ];

    const csv = rows.join("\r\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="control-interno-${seccion}-${desde}.csv"`,
      },
    });
  }

  // ── PDF (HTML para imprimir) ──────────────────────────────────────────────
  const comparativoHtml = `
  <h2>Comparativo IVA — ventas vs. compras (referencia)</h2>
  <div class="grid" style="grid-template-columns: repeat(3, 1fr);">
    <div class="card">
      <div class="card-label">IVA cobrado en ventas</div>
      <div class="card-value">${mostrarIva ? fmt(resumen.ivaRegistradoUsd, "USD") : "—"}</div>
    </div>
    <div class="card">
      <div class="card-label">IVA pagado en compras</div>
      <div class="card-value">${mostrarIva ? fmt(resumenCompras.ivaPagadoUsd, "USD") : "—"}</div>
    </div>
    <div class="card">
      <div class="card-label">Diferencia (referencia)</div>
      <div class="card-value">${mostrarIva ? fmt(diferenciaIva, "USD") : "—"}</div>
    </div>
  </div>
  <div class="leyenda">⚠ ${LEYENDA_COMPARATIVO}</div>`;

  const contenidoHtml =
    seccion === "compras"
      ? `
  <h1>${negocioNombre}</h1>
  <p class="negocio">Reporte de control interno — Compras</p>
  <p class="periodo">Período: ${periodoLabel}</p>
  <div class="leyenda">⚠ ${LEYENDA}</div>
  <div class="grid">
    <div class="card">
      <div class="card-label">Total compras</div>
      <div class="card-value">${fmt(resumenCompras.totalComprasUsd, "USD")}</div>
      <div class="card-sub">${fmt(resumenCompras.totalComprasBs, "VES")}</div>
      <div class="card-sub">${resumenCompras.numCompras} compra${resumenCompras.numCompras !== 1 ? "s" : ""}</div>
    </div>
    <div class="card">
      <div class="card-label">IGTF pagado</div>
      <div class="card-value">${mostrarIgtf ? fmt(resumenCompras.igtfPagadoUsd, "USD") : "—"}</div>
      <div class="card-sub">${mostrarIgtf ? "Sobre " + fmt(resumenCompras.totalDivisaUsd, "USD") + " en divisa" : "IGTF desactivado"}</div>
    </div>
    <div class="card">
      <div class="card-label">IVA pagado en compras</div>
      <div class="card-value">${mostrarIva ? fmt(resumenCompras.ivaPagadoUsd, "USD") : "—"}</div>
      <div class="card-sub">${mostrarIva ? ivaPct + "% sobre costo de mercancía" : "IVA desactivado"}</div>
    </div>
    <div class="card">
      <div class="card-label">Total pagado en divisa</div>
      <div class="card-value">${fmt(resumenCompras.totalDivisaUsd, "USD")}</div>
      <div class="card-sub">Base del IGTF</div>
    </div>
  </div>
  <h2>Desglose por proveedor</h2>
  <table>
    <thead>
      <tr>
        <th>Proveedor</th>
        <th style="text-align:right">Total USD</th>
        <th style="text-align:right"># Compras</th>
      </tr>
    </thead>
    <tbody>${
      porProveedor
        .map(
          (p) => `
      <tr>
        <td>${p.proveedorNombre}</td>
        <td style="text-align:right">${fmt(p.totalUsd, "USD")}</td>
        <td style="text-align:right">${p.numCompras}</td>
      </tr>`,
        )
        .join("") ||
      '<tr><td colspan="3" style="color:#9CA3AF;text-align:center;padding:16px">Sin compras recibidas en el período</td></tr>'
    }</tbody>
  </table>
  ${comparativoHtml}
  <div class="footer">
    <p>${LEYENDA}</p>
    <p>Comprobante interno — no es una factura fiscal</p>
  </div>`
      : `
  <h1>${negocioNombre}</h1>
  <p class="negocio">Reporte de control interno — Ventas</p>
  <p class="periodo">Período: ${periodoLabel}</p>
  <div class="leyenda">⚠ ${LEYENDA}</div>
  <div class="grid">
    <div class="card">
      <div class="card-label">Total ventas</div>
      <div class="card-value">${fmt(resumen.totalVentasUsd, "USD")}</div>
      <div class="card-sub">${fmt(resumen.totalVentasBs, "VES")}</div>
      <div class="card-sub">${resumen.numVentas} venta${resumen.numVentas !== 1 ? "s" : ""}</div>
    </div>
    <div class="card">
      <div class="card-label">IGTF cobrado</div>
      <div class="card-value">${mostrarIgtf ? fmt(resumen.igtfCobradoUsd, "USD") : "—"}</div>
      <div class="card-sub">${mostrarIgtf ? "Sobre " + fmt(resumen.totalDivisaUsd, "USD") + " en divisa" : "IGTF desactivado"}</div>
    </div>
    <div class="card">
      <div class="card-label">IVA registrado en ventas</div>
      <div class="card-value">${mostrarIva ? fmt(resumen.ivaRegistradoUsd, "USD") : "—"}</div>
      <div class="card-sub">${mostrarIva ? ivaPct + "% sobre subtotal" : "IVA desactivado"}</div>
    </div>
    <div class="card">
      <div class="card-label">Total cobrado en divisa</div>
      <div class="card-value">${fmt(resumen.totalDivisaUsd, "USD")}</div>
      <div class="card-sub">Base del IGTF</div>
    </div>
  </div>
  <h2>Desglose por método de pago</h2>
  <table>
    <thead>
      <tr>
        <th>Método</th>
        <th style="text-align:right">Total USD</th>
        <th style="text-align:right">Total Bs</th>
        <th style="text-align:right"># Pagos</th>
      </tr>
    </thead>
    <tbody>${
      porMetodo
        .map(
          (m) => `
      <tr>
        <td>${metodoLabel(m.metodo)}</td>
        <td style="text-align:right">${fmt(m.totalUsd, "USD")}</td>
        <td style="text-align:right">${fmt(m.totalBs, "VES")}</td>
        <td style="text-align:right">${m.numPagos}</td>
      </tr>`,
        )
        .join("") ||
      '<tr><td colspan="4" style="color:#9CA3AF;text-align:center;padding:16px">Sin ventas en el período</td></tr>'
    }</tbody>
  </table>
  ${comparativoHtml}
  <div class="footer">
    <p>${LEYENDA}</p>
    <p>Comprobante interno de venta — no es una factura fiscal</p>
  </div>`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Control interno — ${negocioNombre}</title>
  <style>
    @page { size: A4; margin: 20mm 18mm; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #16252B; margin: 0; }
    h1 { font-size: 18px; margin: 0 0 2px; color: #16252B; }
    h2 { font-size: 13px; margin: 16px 0 6px; color: #16252B; }
    .negocio { font-size: 12px; color: #4A5A60; }
    .periodo { font-size: 11px; color: #4A5A60; margin-top: 2px; }
    .leyenda { background: #FFF7ED; border: 1px solid #FED7AA; border-radius: 4px; padding: 8px 12px; margin: 14px 0; font-size: 10px; color: #92400E; line-height: 1.5; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
    .card { border: 1px solid #E5E7EB; border-radius: 6px; padding: 10px; }
    .card-label { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #6B7280; margin-bottom: 4px; }
    .card-value { font-size: 16px; font-weight: bold; color: #16252B; }
    .card-sub { font-size: 9px; color: #6B7280; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead tr { background: #F3F4F6; }
    th { padding: 6px 8px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #6B7280; border-bottom: 1px solid #E5E7EB; }
    td { padding: 6px 8px; border-bottom: 1px solid #F3F4F6; }
    .footer { margin-top: 20px; border-top: 1px solid #E5E7EB; padding-top: 8px; font-size: 9px; color: #9CA3AF; text-align: center; }
  </style>
</head>
<body>
  ${contenidoHtml}
  <script>window.onload=function(){window.print()}</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": "inline",
    },
  });
}
