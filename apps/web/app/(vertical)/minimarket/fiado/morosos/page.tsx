import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { listClientes } from "@/lib/minimarket/data/clientes";

export const metadata: Metadata = { title: "Morosos" };

const DIAS_MOROSO = 30;

export default async function MorososPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/inicio");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);

  const [clientes, tasa] = await Promise.all([
    listClientes(supabase, tenantId),
    getTasaVigente(supabase, tenantId),
  ]);

  const tasaValor = tasa?.valor ?? 1;
  const usd = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(v);
  const bs = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "VES" }).format(v);

  const morosos = clientes.filter((c) => {
    if (c.saldo_usd <= 0.001) return false;
    if (!c.primer_fiado_abierto_at) return false;
    const dias = Math.floor(
      (Date.now() - new Date(c.primer_fiado_abierto_at).getTime()) / 86_400_000,
    );
    return dias >= DIAS_MOROSO;
  });

  const totalMoroso = morosos.reduce((s, c) => s + c.saldo_usd, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/minimarket/fiado"
          className="text-muted-foreground hover:text-heading mb-2 inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          ← Fiado
        </Link>
        <h1 className="font-display text-heading text-2xl font-semibold">Morosos</h1>
        <p className="text-muted-foreground">
          Clientes con deuda abierta hace más de {DIAS_MOROSO} días.
        </p>
      </header>

      {morosos.length === 0 ? (
        <Card className="py-14 text-center">
          <CheckCircle className="mx-auto mb-3 size-10 text-green-500" />
          <p className="text-heading font-medium">Sin morosos</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Ningún cliente supera los {DIAS_MOROSO} días de deuda.
          </p>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-muted-foreground text-sm">
              {morosos.length} moroso{morosos.length !== 1 ? "s" : ""} — total por cobrar
            </span>
            <div className="sm:text-right">
              <p className="text-danger font-display text-xl font-bold tabular-nums">
                {usd(totalMoroso)}
              </p>
              <p className="text-muted-foreground text-sm tabular-nums">
                {bs(totalMoroso * tasaValor)}
              </p>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] text-sm">
                <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3 text-right">Saldo</th>
                    <th className="px-4 py-3 text-right">Días</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {morosos
                    .sort((a, b) => b.saldo_usd - a.saldo_usd)
                    .map((c) => {
                      const dias = c.primer_fiado_abierto_at
                        ? Math.floor(
                            (Date.now() - new Date(c.primer_fiado_abierto_at).getTime()) /
                              86_400_000,
                          )
                        : 0;
                      return (
                        <tr key={c.id} className="hover:bg-surface-2 transition-colors">
                          <td className="px-4 py-3">
                            <Link
                              href={`/minimarket/clientes/${c.id}`}
                              className="text-accent-600 hover:underline"
                            >
                              <p className="font-medium">{c.nombre}</p>
                              {(c.whatsapp ?? c.telefono) ? (
                                <p className="text-muted-foreground text-xs">
                                  {c.whatsapp ?? c.telefono}
                                </p>
                              ) : null}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="text-danger font-medium tabular-nums">
                              {usd(c.saldo_usd)}
                            </p>
                            <p className="text-muted-foreground text-xs tabular-nums">
                              {bs(c.saldo_usd * tasaValor)}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium tabular-nums text-red-700">
                              {dias} días
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <Link
                                href={`/minimarket/clientes/${c.id}`}
                                className="text-accent-600 text-xs hover:underline"
                              >
                                Ver cuenta
                              </Link>
                              <Link
                                href={`/minimarket/clientes/${c.id}/abonar`}
                                className="text-muted-foreground hover:text-heading text-xs"
                              >
                                Abonar
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
