import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Card } from "@arkiteq/ui";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getVentaParaRecibo } from "@/lib/minimarket/data/ventas";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaHora } from "@/lib/minimarket/date-format";
import { ReciboDocumento } from "@/components/minimarket/pos/recibo-documento";
import { ReciboWhatsappBoton } from "@/components/minimarket/pos/recibo-whatsapp-boton";
import { ReciboAcciones } from "@/components/minimarket/pos/recibo-acciones";

export const metadata: Metadata = { title: "Recibo" };

export default async function ReciboPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/inicio");

  const supabase = await createClient();
  const [doc, tz] = await Promise.all([
    getVentaParaRecibo(supabase, tenantId, id),
    getTimezoneNegocio(supabase, tenantId),
  ]);
  if (!doc) notFound();

  const fecha = fmtFechaHora(doc.fecha, tz);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Card className="space-y-4 p-6">
        <ReciboDocumento doc={doc} fecha={fecha} />
      </Card>

      {doc.mostrarBotonWhatsapp ? (
        <ReciboWhatsappBoton
          link={doc.linkPublico}
          clienteNombre={doc.cliente?.nombre ?? null}
          numeroRegistrado={doc.cliente?.whatsapp || doc.cliente?.telefono || null}
          negocioNombre={doc.negocio.nombre}
          totalUsd={doc.totalUsd}
          totalBs={doc.totalBs}
        />
      ) : null}

      <ReciboAcciones />
    </div>
  );
}
