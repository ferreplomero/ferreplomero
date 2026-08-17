import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listProductos } from "@/lib/minimarket/data/inventario";
import { esCatalogoIrrestricto } from "@/lib/minimarket/sucursal-acceso";

/** Escapa un valor para CSV (comillas dobles si contiene coma, comilla o salto). */
function csv(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CABECERA = [
  "nombre",
  "sku",
  "codigo_barras",
  "categoria",
  "tipo_venta",
  "unidad",
  "costo_usd",
  "precio_usd",
  "impuesto",
  "aplica_igtf",
  "proveedor",
  "stock_inicial",
  "stock_minimo",
  "etiquetas",
];

/** Exporta el inventario del tenant como CSV (abrible en Excel), mismo formato que la importación. */
export async function GET() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const supabase = await createClient();
  const irrestricto = await esCatalogoIrrestricto(supabase, tenantId, session.user.id);
  const productos = await listProductos(supabase, tenantId, [], irrestricto);

  const filas = productos.map((p) =>
    [
      p.nombre,
      p.codigo ?? "",
      p.codigos.join(";"),
      p.categoria_nombre ?? "",
      p.tipo_venta,
      p.unidad,
      Number(p.costo_usd).toFixed(2),
      Number(p.precio_usd).toFixed(2),
      p.impuesto_id,
      p.aplica_igtf ? "si" : "no",
      p.proveedor_nombre ?? "",
      p.stock_actual,
      p.stock_minimo ?? 0,
      (p.etiquetas ?? []).join(";"),
    ]
      .map(csv)
      .join(","),
  );

  // BOM para que Excel reconozca UTF-8 (acentos correctos).
  const contenido = "﻿" + [CABECERA.join(","), ...filas].join("\r\n");
  const fecha = new Date().toISOString().slice(0, 10);

  return new NextResponse(contenido, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="inventario-${fecha}.csv"`,
    },
  });
}
