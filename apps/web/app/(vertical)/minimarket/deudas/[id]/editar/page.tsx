import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { hoyEnTz } from "@/lib/minimarket/date-format";
import { getDeudaConAbonos, listCategoriasDeuda } from "@/lib/minimarket/data/deudas";
import { actualizarDeuda } from "../../actions";
import { DeudaForm } from "../../deuda-form";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const session = await getSessionContext();
  if (!session?.activeTenant?.id) return { title: "Editar deuda" };
  const supabase = await createClient();
  const tz = await getTimezoneNegocio(supabase, session.activeTenant.id);
  const deuda = await getDeudaConAbonos(supabase, session.activeTenant.id, id, tz);
  return { title: deuda ? `Editar — ${deuda.descripcion}` : "Editar deuda" };
}

export default async function EditarDeudaPage({ params }: Props) {
  const { id } = await params;

  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const tz = await getTimezoneNegocio(supabase, tenantId);

  const [deuda, categorias, tasa] = await Promise.all([
    getDeudaConAbonos(supabase, tenantId, id, tz),
    listCategoriasDeuda(supabase, tenantId),
    getTasaVigente(supabase, tenantId),
  ]);

  if (!deuda) notFound();

  const actualizarEstaDeuda = actualizarDeuda.bind(null, deuda.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <Link
          href={`/minimarket/deudas/${deuda.id}`}
          className="text-muted-foreground hover:text-heading mb-2 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          {deuda.descripcion}
        </Link>
        <h1 className="font-display text-heading text-2xl font-semibold">Editar deuda</h1>
      </header>

      <DeudaForm
        action={actualizarEstaDeuda}
        deuda={deuda}
        categorias={categorias}
        tasa={tasa?.valor ?? 1}
        hoy={hoyEnTz(tz)}
      />
    </div>
  );
}
