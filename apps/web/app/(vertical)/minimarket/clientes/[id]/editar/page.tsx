import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getClienteConSaldo } from "@/lib/minimarket/data/clientes";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { ClienteForm } from "../../cliente-form";
import { actualizarCliente } from "../../actions";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const session = await getSessionContext();
  if (!session?.activeTenant?.id) return { title: "Editar cliente" };

  const supabase = await createClient();
  const cliente = await getClienteConSaldo(supabase, session.activeTenant.id, id);
  return { title: cliente ? `Editar — ${cliente.nombre}` : "Editar cliente" };
}

export default async function EditarClientePage({ params }: Props) {
  const { id } = await params;

  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const [cliente, tasa] = await Promise.all([
    getClienteConSaldo(supabase, tenantId, id),
    getTasaVigente(supabase, tenantId),
  ]);
  if (!cliente) notFound();

  const boundAction = actualizarCliente.bind(null, id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <Link
          href={`/minimarket/clientes/${id}`}
          className="text-muted-foreground hover:text-heading mb-2 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          {cliente.nombre}
        </Link>
        <h1 className="font-display text-heading text-2xl font-semibold">Editar cliente</h1>
      </header>

      <ClienteForm
        action={boundAction}
        cliente={cliente}
        tenantId={tenantId}
        tasa={tasa ? tasa.valor : null}
      />
    </div>
  );
}
