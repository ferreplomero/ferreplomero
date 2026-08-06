import { NextResponse } from "next/server";
import { createServiceClient } from "@arkiteq/db/service";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { tokenPresupuestoValido } from "@/lib/minimarket/presupuesto-link";
import { obtenerDatosDocumentoPresupuesto } from "@/lib/minimarket/presupuestos/documento-datos";
import { PresupuestoDocumento } from "@/lib/minimarket/pdf/presupuesto-documento";
import { renderPresupuestoAResponse } from "@/lib/minimarket/pdf/render";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ presupuestoId: string; token: string }>;
}

/** PDF público sin sesión (link de WhatsApp) — mismo criterio de validación
 * por token que la página pública `/pp/[presupuestoId]/[token]`. */
export async function GET(_req: Request, { params }: Params) {
  const { presupuestoId, token } = await params;

  const service = createServiceClient();
  const { data: presupuestoRow } = await service
    .from("mm_presupuestos")
    .select("tenant_id")
    .eq("id", presupuestoId)
    .maybeSingle();
  if (!presupuestoRow || !tokenPresupuestoValido(presupuestoId, presupuestoRow.tenant_id, token)) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const tz = await getTimezoneNegocio(service, presupuestoRow.tenant_id);
  const datos = await obtenerDatosDocumentoPresupuesto(
    service,
    presupuestoRow.tenant_id,
    presupuestoId,
    tz,
  );
  if (!datos) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

  const documento = PresupuestoDocumento({ datos });
  return renderPresupuestoAResponse(documento, `presupuesto-${datos.numero}.pdf`, "inline");
}
