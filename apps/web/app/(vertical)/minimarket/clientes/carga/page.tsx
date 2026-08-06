import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@arkiteq/ui";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { CargaFiadoCliente } from "@/components/minimarket/clientes/carga-fiado-cliente";

export const metadata: Metadata = { title: "Carga masiva de fiados" };

export default async function CargaMasivaFiadosPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/inicio");

  const supabase = await createClient();
  const tasa = await getTasaVigente(supabase, tenantId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/minimarket/clientes">
            <ArrowLeft className="size-4" />
            Clientes
          </Link>
        </Button>
        <header className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">
            Carga masiva de fiados
          </h1>
          <p className="text-muted-foreground">
            Descarga la plantilla, llena los clientes que te deben y súbela para registrarlos todos
            de una vez.
          </p>
        </header>
      </div>

      <CargaFiadoCliente tasaNegocio={tasa?.valor ?? null} />
    </div>
  );
}
