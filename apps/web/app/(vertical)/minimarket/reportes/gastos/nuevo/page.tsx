import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { hoyEnTz } from "@/lib/minimarket/date-format";
import { parseMetodosPago } from "@/lib/minimarket/metodos-pago";
import { getSesionAbierta } from "@/lib/minimarket/data/caja";
import { listCuentasBancarias } from "@/lib/minimarket/data/bancos";
import { crearGastoOperativo } from "../actions";
import { GastoForm } from "../gasto-form";

export const metadata: Metadata = { title: "Nuevo gasto" };

export default async function NuevoGastoPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const [tasa, tz, configRes, sesion, cuentasBancarias] = await Promise.all([
    getTasaVigente(supabase, tenantId),
    getTimezoneNegocio(supabase, tenantId),
    supabase
      .from("mm_config_negocio")
      .select("metodos_pago")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    getSesionAbierta(supabase, tenantId),
    listCuentasBancarias(supabase, tenantId),
  ]);
  const metodosPago = parseMetodosPago(configRes.data?.metodos_pago);

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
        <h1 className="font-display text-heading text-2xl font-semibold">Nuevo gasto</h1>
      </header>

      <GastoForm
        action={crearGastoOperativo}
        tasa={tasa?.valor ?? 1}
        hoy={hoyEnTz(tz)}
        metodosPago={metodosPago}
        cajaAbierta={Boolean(sesion)}
        cuentasBancarias={cuentasBancarias}
      />
    </div>
  );
}
