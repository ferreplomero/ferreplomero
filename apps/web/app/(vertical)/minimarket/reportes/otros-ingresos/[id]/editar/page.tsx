import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { hoyEnTz } from "@/lib/minimarket/date-format";
import { parseMetodosPago } from "@/lib/minimarket/metodos-pago";
import { getOtroIngreso } from "@/lib/minimarket/data/ganancias";
import { getImpactoCajaGasto, getSesionAbierta } from "@/lib/minimarket/data/caja";
import { listCuentasBancarias } from "@/lib/minimarket/data/bancos";
import { listCategoriasMovimiento } from "@/lib/minimarket/data/categorias-movimiento";
import { actualizarOtroIngreso } from "../../actions";
import { OtroIngresoForm } from "../../otro-ingreso-form";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const session = await getSessionContext();
  if (!session?.activeTenant?.id) return { title: "Editar otro ingreso" };
  const supabase = await createClient();
  const otroIngreso = await getOtroIngreso(supabase, session.activeTenant.id, id);
  return { title: otroIngreso ? `Editar — ${otroIngreso.descripcion}` : "Editar otro ingreso" };
}

export default async function EditarOtroIngresoPage({ params }: Props) {
  const { id } = await params;

  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();

  const [otroIngreso, tasa, tz, configRes, sesion, impacto, cuentasBancarias, categorias] =
    await Promise.all([
      getOtroIngreso(supabase, tenantId, id),
      getTasaVigente(supabase, tenantId),
      getTimezoneNegocio(supabase, tenantId),
      supabase
        .from("mm_config_negocio")
        .select("metodos_pago")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      getSesionAbierta(supabase, tenantId),
      getImpactoCajaGasto(supabase, tenantId, id),
      listCuentasBancarias(supabase, tenantId),
      listCategoriasMovimiento(supabase, tenantId, "otro_ingreso"),
    ]);

  if (!otroIngreso) notFound();

  const metodosPago = parseMetodosPago(configRes.data?.metodos_pago);
  const montoMetodoBloqueado = Boolean(impacto.sesionId) && !impacto.sesionAbierta;
  const actualizarEsteIngreso = actualizarOtroIngreso.bind(null, otroIngreso.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/minimarket/reportes/otros-ingresos"
          className="text-muted-foreground hover:text-heading mb-2 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Otros ingresos
        </Link>
        <h1 className="font-display text-heading text-2xl font-semibold">Editar otro ingreso</h1>
      </header>

      <OtroIngresoForm
        action={actualizarEsteIngreso}
        otroIngreso={otroIngreso}
        tasa={tasa?.valor ?? 1}
        hoy={hoyEnTz(tz)}
        categorias={categorias}
        metodosPago={metodosPago}
        cajaAbierta={Boolean(sesion)}
        cuentasBancarias={cuentasBancarias}
        montoMetodoBloqueado={montoMetodoBloqueado}
      />
    </div>
  );
}
