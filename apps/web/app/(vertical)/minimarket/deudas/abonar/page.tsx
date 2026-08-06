import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Landmark } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaCorta } from "@/lib/minimarket/date-format";
import { listDeudas } from "@/lib/minimarket/data/deudas";

export const metadata: Metadata = { title: "Abonar deudas" };

// Ver page.tsx del listado: fecha/vencimiento son `date` puro, se formatean
// en UTC para no correrlas un día (no llevan hora que convertir a Caracas).
const TZ_FECHA_CALENDARIO = "UTC";

export default async function AbonarDeudasPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);
  const tz = await getTimezoneNegocio(supabase, tenantId);

  const [deudas, tasa] = await Promise.all([
    listDeudas(supabase, tenantId, tz),
    getTasaVigente(supabase, tenantId),
  ]);

  const pendientes = deudas.filter((d) => d.saldo_usd > 0.001);
  const tasaValor = tasa?.valor ?? 1;
  const usd = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(v);
  const bs = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "VES" }).format(v);

  const totalPendiente = pendientes.reduce((s, d) => s + d.saldo_usd, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">Abonar deudas</h1>
          <p className="text-muted-foreground">
            Deudas con saldo pendiente, listas para registrarles un abono.
          </p>
        </div>
        <Link
          href="/minimarket/deudas"
          className="border-border text-heading hover:bg-surface-2 inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors sm:shrink-0"
        >
          ← Mis deudas
        </Link>
      </header>

      {pendientes.length === 0 ? (
        <Card className="py-14 text-center">
          <Landmark className="text-muted-foreground mx-auto mb-3 size-10" />
          <p className="text-heading font-medium">Sin deudas pendientes</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Todas las deudas registradas están saldadas.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-muted-foreground text-xs">Deudas pendientes</p>
              <p className="text-heading font-display mt-1 text-2xl font-bold tabular-nums">
                {pendientes.length}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-muted-foreground text-xs">Total pendiente (USD)</p>
              <p className="font-display mt-1 text-2xl font-bold tabular-nums text-amber-600">
                {usd(totalPendiente)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-muted-foreground text-xs">Equivalente en bolívares</p>
              <p className="text-heading font-display mt-1 text-2xl font-bold tabular-nums">
                {bs(totalPendiente * tasaValor)}
              </p>
            </Card>
          </div>

          <Card className="overflow-hidden p-0">
            <div className="border-border flex items-center gap-2 border-b px-4 py-3">
              <AlertTriangle className="size-4 text-amber-500" />
              <p className="text-heading text-sm font-medium">
                {pendientes.length} deuda{pendientes.length !== 1 ? "s" : ""} pendiente
                {pendientes.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3">Deuda</th>
                    <th className="px-4 py-3">Acreedor</th>
                    <th className="px-4 py-3">Vencimiento</th>
                    <th className="px-4 py-3 text-right">Saldo</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {pendientes.map((d) => (
                    <tr key={d.id} className="hover:bg-surface-2 transition-colors">
                      <td className="text-heading px-4 py-3 font-medium">{d.descripcion}</td>
                      <td className="text-muted-foreground px-4 py-3">{d.acreedor}</td>
                      <td className="px-4 py-3">
                        {d.vencimiento ? (
                          <span
                            className={
                              d.vencida ? "font-medium text-red-600" : "text-muted-foreground"
                            }
                          >
                            {fmtFechaCorta(d.vencimiento, TZ_FECHA_CALENDARIO)}
                            {d.vencida ? " (vencida)" : ""}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-medium tabular-nums text-amber-600">
                          {usd(d.saldo_usd)}
                        </p>
                        <p className="text-muted-foreground text-xs tabular-nums">
                          {bs(d.saldo_usd * tasaValor)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/minimarket/deudas/${d.id}/abonar`}
                          className="text-accent-600 text-xs font-medium hover:underline"
                        >
                          Abonar →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
