import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { getClienteConSaldo } from "@/lib/minimarket/data/clientes";
import { listCuentasBancarias } from "@/lib/minimarket/data/bancos";
import { AbonoForm } from "../../abono-form";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const session = await getSessionContext();
  if (!session?.activeTenant?.id) return { title: "Registrar abono" };

  const supabase = await createClient();
  const cliente = await getClienteConSaldo(supabase, session.activeTenant.id, id);
  return { title: cliente ? `Abono — ${cliente.nombre}` : "Registrar abono" };
}

export default async function AbonarPage({ params }: Props) {
  const { id } = await params;

  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/inicio");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);

  const [cliente, tasa, configRes, cuentasBancarias] = await Promise.all([
    getClienteConSaldo(supabase, tenantId, id),
    getTasaVigente(supabase, tenantId),
    supabase.from("mm_config_negocio").select("parametros").eq("tenant_id", tenantId).maybeSingle(),
    listCuentasBancarias(supabase, tenantId),
  ]);

  if (!cliente) notFound();

  // Mismo criterio que ventas/nueva/page.tsx: el IGTF solo se aplica si el
  // negocio lo tiene activo en su configuración.
  const parametros = (configRes.data?.parametros as Record<string, unknown>) ?? {};
  const igtfActivo = parametros.igtf_activo !== false;

  if (cliente.saldo_usd <= 0) {
    redirect(`/minimarket/clientes/${id}`);
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <header className="space-y-1">
        <Link
          href={`/minimarket/clientes/${id}`}
          className="text-muted-foreground hover:text-heading mb-2 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          {cliente.nombre}
        </Link>
        <h1 className="font-display text-heading text-2xl font-semibold">Registrar abono</h1>
        <p className="text-muted-foreground text-sm">
          El abono se aplica al fiado más antiguo primero (método FIFO).
        </p>
      </header>

      {!tasa ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Debes registrar la tasa del día antes de registrar un abono en bolívares.{" "}
          <Link href="/minimarket/tasa" className="underline">
            Ir a Tasa
          </Link>
        </div>
      ) : null}

      <AbonoForm
        clienteId={cliente.id}
        clienteNombre={cliente.nombre}
        saldoUsd={cliente.saldo_usd}
        tasa={tasa?.valor ?? 1}
        locale={country.locale}
        tenantId={tenantId}
        usuarioId={session.user.id}
        igtfActivo={igtfActivo}
        cuentasBancarias={cuentasBancarias.filter((c) => c.activa)}
      />
    </div>
  );
}
