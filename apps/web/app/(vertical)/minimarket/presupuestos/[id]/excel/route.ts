import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { requirePermisoAccion } from "@/lib/minimarket/permisos";
import { obtenerDatosDocumentoPresupuesto } from "@/lib/minimarket/presupuestos/documento-datos";
import { construirExcelPresupuesto } from "@/lib/minimarket/presupuestos/excel";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "presupuestos",
    "crear",
  );
  if (permisoError) return NextResponse.json({ error: permisoError }, { status: 403 });

  const tz = await getTimezoneNegocio(supabase, tenantId);
  const datos = await obtenerDatosDocumentoPresupuesto(supabase, tenantId, id, tz);
  if (!datos) {
    return NextResponse.json({ error: "Presupuesto no encontrado." }, { status: 404 });
  }

  const buffer = await construirExcelPresupuesto(datos);

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="presupuesto-${datos.numero}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
