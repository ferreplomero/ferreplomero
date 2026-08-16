import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BookText } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaHora } from "@/lib/minimarket/date-format";
import { rangoPreset, type RangoFechas } from "@/lib/minimarket/data/reportes";
import { getLibroDiario } from "@/lib/minimarket/data/libro-contable";
import { ReportesTabs } from "../reportes-tabs";
import { NotaLibroContable } from "../nota-libro-contable";
import { FiltroPeriodoLibro } from "../filtro-periodo-libro";

export const metadata: Metadata = { title: "Libro Diario" };

const CUENTA_CHIP: Record<string, string> = {
  Ventas: "bg-green-100 text-green-800",
  "Cuentas por Cobrar": "bg-blue-100 text-blue-800",
  Gastos: "bg-red-100 text-red-800",
  "Otros Ingresos": "bg-teal-100 text-teal-800",
  Compras: "bg-orange-100 text-orange-800",
  "Cuentas por Pagar": "bg-purple-100 text-purple-800",
  Deudas: "bg-pink-100 text-pink-800",
  "Saldos Iniciales": "bg-indigo-100 text-indigo-800",
  Caja: "bg-yellow-100 text-yellow-800",
};

function chipCuenta(cuenta: string): string {
  if (CUENTA_CHIP[cuenta]) return CUENTA_CHIP[cuenta];
  if (cuenta.startsWith("Banco:")) return "bg-yellow-100 text-yellow-800";
  return "bg-surface-2 text-heading";
}

interface SearchParams {
  periodo?: string;
  desde?: string;
  hasta?: string;
}

export default async function LibroDiarioPage({
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

  const movimientos = await getLibroDiario(supabase, tenantId, rango, tz);

  const usd = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(v);
  const bs = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "VES" }).format(v);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <ReportesTabs activo="/minimarket/reportes/libro-diario" />

      <header className="space-y-1">
        <h1 className="font-display text-heading text-2xl font-semibold">Libro Diario</h1>
        <p className="text-muted-foreground">
          Todos los movimientos del negocio en orden cronológico: fecha/hora, concepto, cuenta
          afectada, origen/destino del dinero y monto en USD y Bs con la tasa usada.
        </p>
      </header>

      <FiltroPeriodoLibro
        base="/minimarket/reportes/libro-diario"
        periodo={periodo}
        desde={sp.desde}
        hasta={sp.hasta}
      />

      <Card className="overflow-hidden p-0">
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <p className="text-heading text-sm font-medium">
            {movimientos.length} movimiento{movimientos.length !== 1 ? "s" : ""}
          </p>
        </div>
        {movimientos.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <BookText className="text-muted-foreground mx-auto mb-3 size-10" />
            <p className="text-heading font-medium">Sin movimientos en este período</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Fecha/hora</th>
                  <th className="px-4 py-3">Concepto</th>
                  <th className="px-4 py-3">Cuenta</th>
                  <th className="px-4 py-3">Origen/destino</th>
                  <th className="px-4 py-3 text-right">Monto USD</th>
                  <th className="px-4 py-3 text-right">Monto Bs</th>
                  <th className="px-4 py-3 text-right">Tasa</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {movimientos.map((m) => (
                  <tr key={m.id} className="hover:bg-surface-2 transition-colors">
                    <td className="text-muted-foreground whitespace-nowrap px-4 py-3 tabular-nums">
                      {fmtFechaHora(m.fecha, tz)}
                    </td>
                    <td className="text-heading px-4 py-3">{m.concepto}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${chipCuenta(m.cuenta)}`}
                      >
                        {m.cuenta}
                      </span>
                    </td>
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
                    <td className="text-muted-foreground px-4 py-3 text-right tabular-nums">
                      {m.tasa > 0 ? m.tasa.toFixed(2) : "—"}
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
