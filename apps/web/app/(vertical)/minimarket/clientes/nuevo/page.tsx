import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { ClienteForm } from "../cliente-form";
import { crearCliente } from "../actions";

export const metadata: Metadata = { title: "Nuevo cliente" };

export default async function NuevoClientePage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const tasa = await getTasaVigente(supabase, tenantId);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/minimarket/clientes"
          className="text-muted-foreground hover:text-heading mb-2 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Clientes y fiado
        </Link>
        <h1 className="font-display text-heading text-2xl font-semibold">Nuevo cliente</h1>
        <p className="text-muted-foreground">
          Registra al cliente para asignarle fiado y llevar su estado de cuenta.
        </p>
      </header>

      <ClienteForm action={crearCliente} tenantId={tenantId} tasa={tasa ? tasa.valor : null} />
    </div>
  );
}
