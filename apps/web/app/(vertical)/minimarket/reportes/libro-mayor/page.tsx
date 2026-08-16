import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Landmark } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { rangoPreset, type RangoFechas } from "@/lib/minimarket/data/reportes";
import { getLibroMayor } from "@/lib/minimarket/data/libro-contable";
import { ReportesTabs } from "../reportes-tabs";
import { NotaLibroContable } from "../nota-libro-contable";
import { FiltroPeriodoLibro } from "../filtro-periodo-libro";

export const metadata: Metadata = { title: "Libro Mayor" };

interface SearchParams {
  periodo?: string;
  desde?: string;
  hasta?: string;
}

function queryString(sp: SearchParams, periodo: string): string {
  if (sp.desde && sp.hasta) return `?desde=${sp.desde}&hasta=${sp.hasta}`;
  return `?periodo=${periodo}`;
}

export default async function LibroMayorPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);
  const tz = await getTimezoneNegocio(supabase, tenantId);

  const periodo = (sp.periodo ?? "mes") as "hoy" | "semana" | "mes" | "mes-anterior";
  const rango: RangoFechas =
    sp.desde && sp.hasta ? { desde: sp.desde, hasta: sp.hasta } : rangoPreset(periodo, tz);

  const cuentas = await getLibroMayor(supabase, tenantId, rango, tz);
  const qs = queryString(sp, periodo);

  const usd = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(v);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <ReportesTabs activo="/minimarket/reportes/libro-mayor" />

      <header className="space-y-1">
        <h1 className="font-display text-heading text-2xl font-semibold">Libro Mayor</h1>
        <p className="text-muted-foreground">
          Los mismos movimientos del Libro Diario, agrupados por cuenta (Banco, Caja, Ventas,
          Cuentas por cobrar, Gastos, Otros ingresos, etc.). Entra a cada cuenta para ver su
          detalle.
        </p>
      </header>

      <FiltroPeriodoLibro
        base="/minimarket/reportes/libro-mayor"
        periodo={periodo}
        desde={sp.desde}
        hasta={sp.hasta}
      />

      {cuentas.length === 0 ? (
        <Card className="py-16 text-center">
          <Landmark className="text-muted-foreground mx-auto mb-3 size-10" />
          <p className="text-heading font-medium">Sin movimientos en este período</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {cuentas.map((c) => (
            <Link key={c.cuentaSlug} href={`/minimarket/reportes/libro-mayor/${c.cuentaSlug}${qs}`}>
              <Card className="hover:border-accent-400 space-y-1 p-5 transition-colors">
                <p className="text-heading text-sm font-semibold">{c.cuenta}</p>
                <p
                  className={`font-display text-xl font-bold tabular-nums ${
                    c.totalUsd < 0 ? "text-red-700" : "text-heading"
                  }`}
                >
                  {usd(c.totalUsd)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {c.numMovimientos} movimiento{c.numMovimientos !== 1 ? "s" : ""}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <NotaLibroContable />
    </div>
  );
}
