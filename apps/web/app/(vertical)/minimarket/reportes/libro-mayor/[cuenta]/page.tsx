import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookText } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaHora } from "@/lib/minimarket/date-format";
import { rangoPreset, type RangoFechas } from "@/lib/minimarket/data/reportes";
import { getLibroMayorCuenta } from "@/lib/minimarket/data/libro-contable";
import { NotaLibroContable } from "../../nota-libro-contable";
import { FiltroPeriodoLibro } from "../../filtro-periodo-libro";

interface Props {
  params: Promise<{ cuenta: string }>;
  searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cuenta } = await params;
  return { title: `Libro Mayor — ${decodeURIComponent(cuenta)}` };
}

export default async function LibroMayorCuentaPage({ params, searchParams }: Props) {
  const { cuenta: cuentaSlug } = await params;
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

  const movimientos = await getLibroMayorCuenta(supabase, tenantId, cuentaSlug, rango, tz);
  const cuentaNombre = movimientos[0]?.cuenta ?? nombreCuentaPorSlug(cuentaSlug);
  const totalUsd = movimientos.reduce(
    (s, m) => s + (m.efecto === "entrada" ? m.montoUsd : -m.montoUsd),
    0,
  );
  const totalBs = movimientos.reduce(
    (s, m) => s + (m.efecto === "entrada" ? m.montoBs : -m.montoBs),
    0,
  );

  const usd = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(v);
  const bs = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "VES" }).format(v);

  const orden = [...movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/minimarket/reportes/libro-mayor"
        className="text-muted-foreground hover:text-heading inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        Libro Mayor
      </Link>

      <header className="space-y-1">
        <h1 className="font-display text-heading text-2xl font-semibold">{cuentaNombre}</h1>
        <p className="text-muted-foreground">Detalle de movimientos y saldo del período.</p>
      </header>

      <FiltroPeriodoLibro
        base={`/minimarket/reportes/libro-mayor/${cuentaSlug}`}
        periodo={periodo}
        desde={sp.desde}
        hasta={sp.hasta}
      />

      <Card className="space-y-1 p-5">
        <p className="text-muted-foreground text-sm">Saldo/total del período</p>
        <p
          className={`font-display text-2xl font-bold tabular-nums ${totalUsd < 0 ? "text-red-700" : "text-heading"}`}
        >
          {usd(totalUsd)}
        </p>
        <p className="text-muted-foreground text-sm tabular-nums">≈ {bs(totalBs)}</p>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <p className="text-heading text-sm font-medium">
            {orden.length} movimiento{orden.length !== 1 ? "s" : ""}
          </p>
        </div>
        {orden.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <BookText className="text-muted-foreground mx-auto mb-3 size-10" />
            <p className="text-heading font-medium">Sin movimientos en este período</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Fecha/hora</th>
                  <th className="px-4 py-3">Concepto</th>
                  <th className="px-4 py-3">Origen/destino</th>
                  <th className="px-4 py-3 text-right">Monto USD</th>
                  <th className="px-4 py-3 text-right">Monto Bs</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {orden.map((m) => (
                  <tr key={m.id} className="hover:bg-surface-2 transition-colors">
                    <td className="text-muted-foreground whitespace-nowrap px-4 py-3 tabular-nums">
                      {fmtFechaHora(m.fecha, tz)}
                    </td>
                    <td className="text-heading px-4 py-3">{m.concepto}</td>
                    <td className="text-muted-foreground whitespace-nowrap px-4 py-3">
                      {m.origenDestino}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium tabular-nums ${
                        m.efecto === "entrada" ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {m.efecto === "entrada" ? "+" : "−"}
                      {usd(m.montoUsd)}
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-right tabular-nums">
                      {bs(m.montoBs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <NotaLibroContable />
    </div>
  );
}

const NOMBRES_CUENTA: Record<string, string> = {
  ventas: "Ventas",
  "cuentas-por-cobrar": "Cuentas por Cobrar",
  gastos: "Gastos",
  "otros-ingresos": "Otros Ingresos",
  compras: "Compras",
  "cuentas-por-pagar": "Cuentas por Pagar",
  deudas: "Deudas",
  "saldos-iniciales": "Saldos Iniciales",
  caja: "Caja",
};

function nombreCuentaPorSlug(slug: string): string {
  return NOMBRES_CUENTA[slug] ?? (slug.startsWith("banco-") ? "Banco" : slug);
}
