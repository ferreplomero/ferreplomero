import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listCuentasBancarias } from "@/lib/minimarket/data/bancos";
import { getSesionAbierta } from "@/lib/minimarket/data/caja";
import { getSucursalActiva } from "@/lib/minimarket/sucursal-acceso";
import { getResumenSaldosIniciales } from "@/lib/minimarket/data/saldos-iniciales";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { SaldosInicialesForm } from "./saldos-iniciales-form";

export const metadata: Metadata = { title: "Medios de pago y saldo inicial" };

export default async function SaldosInicialesPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);
  const { activa: sucursalActiva } = await getSucursalActiva(supabase, tenantId, session.user.id);

  const [configRes, cuentas, sesionCaja, tasa] = await Promise.all([
    supabase
      .from("mm_config_negocio")
      .select("medios_saldos_completados_en")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    listCuentasBancarias(supabase, tenantId),
    sucursalActiva
      ? getSesionAbierta(supabase, tenantId, sucursalActiva.id)
      : Promise.resolve(null),
    getTasaVigente(supabase, tenantId),
  ]);

  const config = configRes.data;
  const yaCompletado = Boolean(config?.medios_saldos_completados_en);

  if (yaCompletado) {
    const resumen = await getResumenSaldosIniciales(supabase, tenantId);
    const usd = (v: number) =>
      new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(v);
    const bs = (v: number) =>
      new Intl.NumberFormat(country.locale, { style: "currency", currency: "VES" }).format(v);

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">
            Medios de pago y saldo inicial
          </h1>
          <p className="text-muted-foreground">
            Ya configuraste esto para tu negocio. Puedes seguir agregando medios de pago o cuentas
            nuevas desde Configuración y Bancos cuando quieras.
          </p>
        </header>
        <Card className="flex items-start gap-3 p-5">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" aria-hidden />
          <div className="space-y-1">
            <p className="text-heading text-sm font-semibold">Configuración completada</p>
            <p className="text-muted-foreground text-sm">
              Capital inicial declarado hasta ahora:{" "}
              <span className="text-heading font-medium tabular-nums">{usd(resumen.totalUsd)}</span>{" "}
              <span className="text-heading font-medium tabular-nums">{bs(resumen.totalBs)}</span>
            </p>
          </div>
        </Card>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/minimarket/configuracion" className="text-accent-600 hover:underline">
            Ir a Configuración →
          </Link>
          <Link href="/minimarket/bancos" className="text-accent-600 hover:underline">
            Ir a Bancos →
          </Link>
          <Link href="/minimarket/caja" className="text-accent-600 hover:underline">
            Ir a Caja →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-heading text-2xl font-semibold">
          Medios de pago y saldo inicial
        </h1>
        <p className="text-muted-foreground">
          Elige cómo cobra tu negocio y cuánto dinero tienes AHORA en cada uno — así tus reportes de
          caja, bancos y Finanzas parten de cifras reales. No es obligatorio tener saldo en todos:
          basta con que uses al menos un medio de pago.
        </p>
      </header>

      <SaldosInicialesForm
        cuentas={cuentas}
        cajaAbierta={Boolean(sesionCaja)}
        tasaVigente={tasa?.valor ?? null}
      />
    </div>
  );
}
