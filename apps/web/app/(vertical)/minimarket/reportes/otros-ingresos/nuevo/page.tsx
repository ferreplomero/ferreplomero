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
import { listCategoriasMovimiento } from "@/lib/minimarket/data/categorias-movimiento";
import { crearOtroIngreso } from "../actions";
import { OtroIngresoForm } from "../otro-ingreso-form";

export const metadata: Metadata = { title: "Nuevo otro ingreso" };

export default async function NuevoOtroIngresoPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const [tasa, tz, configRes, sesion, cuentasBancarias, categorias] = await Promise.all([
    getTasaVigente(supabase, tenantId),
    getTimezoneNegocio(supabase, tenantId),
    supabase
      .from("mm_config_negocio")
      .select("metodos_pago")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    getSesionAbierta(supabase, tenantId),
    listCuentasBancarias(supabase, tenantId),
    listCategoriasMovimiento(supabase, tenantId, "otro_ingreso"),
  ]);
  const metodosPago = parseMetodosPago(configRes.data?.metodos_pago);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/minimarket/reportes/otros-ingresos"
          className="text-muted-foreground hover:text-heading mb-2 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Otros ingresos
        </Link>
        <h1 className="font-display text-heading text-2xl font-semibold">Nuevo otro ingreso</h1>
      </header>

      <OtroIngresoForm
        action={crearOtroIngreso}
        tasa={tasa?.valor ?? 1}
        hoy={hoyEnTz(tz)}
        categorias={categorias}
        metodosPago={metodosPago}
        cajaAbierta={Boolean(sesion)}
        cuentasBancarias={cuentasBancarias}
      />
    </div>
  );
}
