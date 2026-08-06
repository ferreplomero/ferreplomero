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
import { getGastoOperativo } from "@/lib/minimarket/data/ganancias";
import { getImpactoCajaGasto, getSesionAbierta } from "@/lib/minimarket/data/caja";
import { listCuentasBancarias } from "@/lib/minimarket/data/bancos";
import { actualizarGastoOperativo } from "../../actions";
import { GastoForm } from "../../gasto-form";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const session = await getSessionContext();
  if (!session?.activeTenant?.id) return { title: "Editar gasto" };
  const supabase = await createClient();
  const gasto = await getGastoOperativo(supabase, session.activeTenant.id, id);
  return { title: gasto ? `Editar — ${gasto.descripcion}` : "Editar gasto" };
}

export default async function EditarGastoPage({ params }: Props) {
  const { id } = await params;

  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();

  const [gasto, tasa, tz, configRes, sesion, impacto, cuentasBancarias] = await Promise.all([
    getGastoOperativo(supabase, tenantId, id),
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
  ]);

  if (!gasto) notFound();

  const metodosPago = parseMetodosPago(configRes.data?.metodos_pago);
  const montoMetodoBloqueado = Boolean(impacto.sesionId) && !impacto.sesionAbierta;
  const actualizarEsteGasto = actualizarGastoOperativo.bind(null, gasto.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/minimarket/reportes/gastos"
          className="text-muted-foreground hover:text-heading mb-2 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Gastos operativos
        </Link>
        <h1 className="font-display text-heading text-2xl font-semibold">Editar gasto</h1>
      </header>

      <GastoForm
        action={actualizarEsteGasto}
        gasto={gasto}
        tasa={tasa?.valor ?? 1}
        hoy={hoyEnTz(tz)}
        metodosPago={metodosPago}
        cajaAbierta={Boolean(sesion)}
        cuentasBancarias={cuentasBancarias}
        montoMetodoBloqueado={montoMetodoBloqueado}
      />
    </div>
  );
}
