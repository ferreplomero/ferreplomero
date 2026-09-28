import { NextResponse } from "next/server";
import { createServiceClient } from "@arkiteq/db/service";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { tokenNotaEntregaValido } from "@/lib/minimarket/nota-entrega-link";
import { obtenerDatosNotaEntrega } from "@/lib/minimarket/nota-entrega/datos";
import { respuestaPdfNotaEntrega } from "@/lib/minimarket/nota-entrega/pdf";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ ventaId: string; token: string }>;
}

/** PDF público de la nota de entrega, SIN sesión (link de WhatsApp) — mismo
 * criterio que `/r/[ventaId]/[token]`: token firmado por servidor y lectura
 * con `service_role` solo de esa venta puntual. */
export async function GET(_req: Request, { params }: Params) {
  const { ventaId, token } = await params;

  const service = createServiceClient();
  const { data: venta } = await service
    .from("mm_ventas")
    .select("tenant_id")
    .eq("id", ventaId)
    .maybeSingle();
  if (!venta || !tokenNotaEntregaValido(ventaId, venta.tenant_id, token)) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const tz = await getTimezoneNegocio(service, venta.tenant_id);
  const datos = await obtenerDatosNotaEntrega(service, venta.tenant_id, ventaId, tz);
  if (!datos) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

  return respuestaPdfNotaEntrega(datos, "inline");
}
