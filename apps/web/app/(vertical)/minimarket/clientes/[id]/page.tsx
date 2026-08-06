import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { getClienteConSaldo, getEstadoCuenta } from "@/lib/minimarket/data/clientes";
import { listMovimientosCredito } from "@/lib/minimarket/data/creditos";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { EstadoCuentaCliente } from "../estado-cuenta-cliente";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const session = await getSessionContext();
  if (!session?.activeTenant?.id) return { title: "Cliente" };

  const supabase = await createClient();
  const cliente = await getClienteConSaldo(supabase, session.activeTenant.id, id);
  return { title: cliente ? `${cliente.nombre} — Cuenta` : "Cliente" };
}

export default async function EstadoCuentaPage({ params }: Props) {
  const { id } = await params;

  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);

  const [cliente, timeline, tasa, tz, movimientosCredito] = await Promise.all([
    getClienteConSaldo(supabase, tenantId, id),
    getEstadoCuenta(supabase, tenantId, id),
    getTasaVigente(supabase, tenantId),
    getTimezoneNegocio(supabase, tenantId),
    listMovimientosCredito(supabase, tenantId, id),
  ]);

  if (!cliente) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/minimarket/clientes"
          className="text-muted-foreground hover:text-heading mb-2 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Clientes y fiado
        </Link>
        <h1 className="font-display text-heading text-2xl font-semibold">{cliente.nombre}</h1>
        <p className="text-muted-foreground text-sm">
          Estado de cuenta y historial de movimientos.
        </p>
      </header>

      <EstadoCuentaCliente
        cliente={cliente}
        timeline={timeline}
        tasa={tasa?.valor ?? 1}
        locale={country.locale}
        tz={tz}
        movimientosCredito={movimientosCredito}
      />
    </div>
  );
}
