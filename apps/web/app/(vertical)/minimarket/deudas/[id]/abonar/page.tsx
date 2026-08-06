import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { getDeudaConAbonos } from "@/lib/minimarket/data/deudas";
import { parseMetodosPago } from "@/lib/minimarket/metodos-pago";
import { getSesionAbierta } from "@/lib/minimarket/data/caja";
import { listCuentasBancarias } from "@/lib/minimarket/data/bancos";
import { AbonoDeudaForm } from "../../abono-deuda-form";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const session = await getSessionContext();
  if (!session?.activeTenant?.id) return { title: "Registrar abono" };
  const supabase = await createClient();
  const tz = await getTimezoneNegocio(supabase, session.activeTenant.id);
  const deuda = await getDeudaConAbonos(supabase, session.activeTenant.id, id, tz);
  return { title: deuda ? `Abono — ${deuda.descripcion}` : "Registrar abono" };
}

export default async function AbonarDeudaPage({ params }: Props) {
  const { id } = await params;

  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/inicio");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);
  const tz = await getTimezoneNegocio(supabase, tenantId);

  const [deuda, tasa, configRes, sesion, cuentasBancarias] = await Promise.all([
    getDeudaConAbonos(supabase, tenantId, id, tz),
    getTasaVigente(supabase, tenantId),
    supabase
      .from("mm_config_negocio")
      .select("metodos_pago")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    getSesionAbierta(supabase, tenantId),
    listCuentasBancarias(supabase, tenantId),
  ]);
  const metodosPago = parseMetodosPago(configRes.data?.metodos_pago);

  if (!deuda) notFound();
  if (deuda.saldo_usd <= 0) redirect(`/minimarket/deudas/${id}`);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <header className="space-y-1">
        <Link
          href={`/minimarket/deudas/${id}`}
          className="text-muted-foreground hover:text-heading mb-2 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          {deuda.descripcion}
        </Link>
        <h1 className="font-display text-heading text-2xl font-semibold">Registrar abono</h1>
      </header>

      {!tasa ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Debes registrar la tasa del día antes de registrar un abono en bolívares.{" "}
          <Link href="/minimarket/tasa" className="underline">
            Ir a Tasa
          </Link>
        </div>
      ) : null}

      <AbonoDeudaForm
        deudaId={deuda.id}
        descripcion={deuda.descripcion}
        acreedor={deuda.acreedor}
        saldoUsd={deuda.saldo_usd}
        tasa={tasa?.valor ?? 1}
        locale={country.locale}
        metodosPago={metodosPago}
        cajaAbierta={Boolean(sesion)}
        cuentasBancarias={cuentasBancarias}
      />
    </div>
  );
}
