/**
 * Datos de la NOTA DE ENTREGA de una venta: documento aparte del recibo de
 * venta (que queda intacto), pensado para acompañar la mercancía y firmarse
 * al recibirla. No calcula NINGÚN monto: todo sale de lo que la venta ya dejó
 * congelado (`getVentaParaRecibo` → `mm_ventas` / `mm_ventas_items` /
 * `mm_pagos_venta`), incluidos el total en Bs y la tasa del día de la venta.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@arkiteq/db";
import { getVentaParaRecibo } from "@/lib/minimarket/data/ventas";
import type { DocumentoFiscal } from "@/lib/minimarket/documento";
import { fmtFechaHora } from "@/lib/minimarket/date-format";
import { linkPublicoNotaEntrega } from "@/lib/minimarket/nota-entrega-link";

type Client = SupabaseClient<Database>;

export interface NotaEntregaDatos {
  ventaId: string;
  /** N.º de la nota, derivado del de la venta (R-000013 → NE-000013). */
  numero: string;
  /** N.º de la venta relacionada (recibo), null si la venta no tiene. */
  ventaNumero: string | null;
  fecha: string;
  sucursal: { nombre: string; direccion: string | null; telefono: string | null } | null;
  doc: DocumentoFiscal;
  /** Link público del PDF (`/ne/[ventaId]/[token]`) para enviar por WhatsApp. */
  linkPublico: string;
}

/** R-000013 → NE-000013; sin número de venta, usa el inicio del id. */
export function numeroNotaEntrega(ventaNumero: string | null, ventaId: string): string {
  const digitos = ventaNumero?.match(/(\d+)\s*$/)?.[1];
  return `NE-${digitos ?? ventaId.slice(0, 8).toUpperCase()}`;
}

export async function obtenerDatosNotaEntrega(
  client: Client,
  tenantId: string,
  ventaId: string,
  tz: string,
): Promise<NotaEntregaDatos | null> {
  const [doc, ventaRes] = await Promise.all([
    getVentaParaRecibo(client, tenantId, ventaId),
    client
      .from("mm_ventas")
      .select("sucursal_id")
      .eq("tenant_id", tenantId)
      .eq("id", ventaId)
      .maybeSingle(),
  ]);
  if (!doc) return null;

  const sucursalId = ventaRes.data?.sucursal_id ?? null;
  const { data: sucursal } = sucursalId
    ? await client
        .from("mm_sucursales")
        .select("nombre, direccion, telefono")
        .eq("tenant_id", tenantId)
        .eq("id", sucursalId)
        .maybeSingle()
    : { data: null };

  return {
    ventaId,
    numero: numeroNotaEntrega(doc.numero, ventaId),
    ventaNumero: doc.numero,
    fecha: fmtFechaHora(doc.fecha, tz),
    sucursal: sucursal ?? null,
    doc,
    linkPublico: linkPublicoNotaEntrega(ventaId, tenantId),
  };
}
