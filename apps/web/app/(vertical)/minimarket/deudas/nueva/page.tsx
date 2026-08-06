import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { hoyEnTz } from "@/lib/minimarket/date-format";
import { listCategoriasDeuda } from "@/lib/minimarket/data/deudas";
import { crearDeuda } from "../actions";
import { DeudaForm } from "../deuda-form";

export const metadata: Metadata = { title: "Nueva deuda" };

export default async function NuevaDeudaPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();

  const [categorias, tasa, tz] = await Promise.all([
    listCategoriasDeuda(supabase, tenantId),
    getTasaVigente(supabase, tenantId),
    getTimezoneNegocio(supabase, tenantId),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/minimarket/deudas"
          className="text-muted-foreground hover:text-heading mb-2 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Deudas
        </Link>
        <h1 className="font-display text-heading text-2xl font-semibold">Nueva deuda</h1>
        <p className="text-muted-foreground text-sm">
          Préstamos, servicios, alquiler u otras deudas del dueño/negocio — distinto de las cuentas
          por pagar a proveedores.
        </p>
      </header>

      <DeudaForm
        action={crearDeuda}
        categorias={categorias}
        tasa={tasa?.valor ?? 1}
        hoy={hoyEnTz(tz)}
      />
    </div>
  );
}
