import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { obtenerDatosNotaEntrega } from "@/lib/minimarket/nota-entrega/datos";
import { respuestaPdfNotaEntrega } from "@/lib/minimarket/nota-entrega/pdf";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

/** PDF de la nota de entrega (con sesión; el cliente de Supabase aplica RLS
 * por tenant/sucursal, igual que la página del recibo). `?descargar=1` lo
 * baja como archivo; sin él se abre en el visor del navegador. */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const supabase = await createClient();
  const tz = await getTimezoneNegocio(supabase, tenantId);
  const datos = await obtenerDatosNotaEntrega(supabase, tenantId, id, tz);
  if (!datos) return NextResponse.json({ error: "Venta no encontrada." }, { status: 404 });

  const descargar = new URL(req.url).searchParams.get("descargar") === "1";
  return respuestaPdfNotaEntrega(datos, descargar ? "attachment" : "inline");
}
