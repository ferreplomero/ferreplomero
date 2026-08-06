import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CreditCard, DollarSign, TrendingDown, Upload } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { listClientes, getResumenCartera } from "@/lib/minimarket/data/clientes";

export const metadata: Metadata = { title: "Fiado — Cuentas por cobrar" };

const DIAS_MOROSO = 30;

export default async function FiadoPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);

  const [clientes, resumen, tasa] = await Promise.all([
    listClientes(supabase, tenantId),
    getResumenCartera(supabase, tenantId),
    getTasaVigente(supabase, tenantId),
  ]);

  const tasaValor = tasa?.valor ?? 1;
  const usd = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(v);
  const bs = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "VES" }).format(v);

  const conDeuda = clientes.filter((c) => c.saldo_usd > 0.001);

  const tarjetas = [
    { label: "Con deuda abierta", valor: String(resumen.clientesConDeuda), Icon: CreditCard },
    { label: "Morosos (+30 días)", valor: String(resumen.clientesMorosos), Icon: TrendingDown },
    { label: "Cartera total USD", valor: usd(resumen.totalCarteraUsd), Icon: DollarSign },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">Fiado</h1>
          <p className="text-muted-foreground">
            Cuentas por cobrar. El saldo se calcula del historial de ventas y abonos — nunca de un
            contador editable.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/minimarket/clientes/carga"
            className="border-border text-heading hover:bg-surface-2 inline-flex shrink-0 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors"
          >
            <Upload className="size-4" />
            Carga masiva
          </Link>
          <Link
            href="/minimarket/fiado/morosos"
            className="border-border text-heading hover:bg-surface-2 inline-flex shrink-0 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors"
          >
            <AlertTriangle className="size-4" />
            Morosos
          </Link>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        {tarjetas.map(({ label, valor, Icon }) => (
          <Card key={label} className="flex items-center gap-3 p-4">
            <span className="bg-accent-500/12 text-accent-600 inline-flex size-10 items-center justify-center rounded-xl">
              <Icon className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-muted-foreground text-xs">{label}</p>
              <p className="text-heading font-display text-lg font-semibold tabular-nums">
                {valor}
              </p>
            </div>
          </Card>
        ))}
      </section>

      {resumen.totalCarteraUsd > 0 ? (
        <Card className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-muted-foreground text-sm">Total cartera por cobrar</span>
          <div className="sm:text-right">
            <p className="text-heading font-display text-xl font-bold tabular-nums">
              {usd(resumen.totalCarteraUsd)}
            </p>
            <p className="text-muted-foreground text-sm tabular-nums">
              {bs(resumen.totalCarteraUsd * tasaValor)}
            </p>
          </div>
        </Card>
      ) : null}

      {conDeuda.length === 0 ? (
        <Card className="py-14 text-center">
          <CreditCard className="text-muted-foreground mx-auto mb-3 size-10" />
          <p className="text-heading font-medium">Sin cuentas por cobrar</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Todos los clientes están al día. ¡Excelente!
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <p className="text-heading text-sm font-medium">
              {conDeuda.length} cliente{conDeuda.length !== 1 ? "s" : ""} con deuda
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3 text-right">Límite</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {conDeuda
                  .sort((a, b) => b.saldo_usd - a.saldo_usd)
                  .map((c) => {
                    const pct =
                      c.limite_fiado_usd > 0
                        ? Math.min(100, (c.saldo_usd / c.limite_fiado_usd) * 100)
                        : 0;
                    const diasSinPagar = c.primer_fiado_abierto_at
                      ? Math.floor(
                          (Date.now() - new Date(c.primer_fiado_abierto_at).getTime()) / 86_400_000,
                        )
                      : 0;
                    const moroso = diasSinPagar >= DIAS_MOROSO;
                    return (
                      <tr key={c.id} className="hover:bg-surface-2 transition-colors">
                        <td className="px-4 py-3">
                          <Link
                            href={`/minimarket/clientes/${c.id}`}
                            className="text-accent-600 hover:underline"
                          >
                            <p className="font-medium">{c.nombre}</p>
                            {c.cedula ? (
                              <p className="text-muted-foreground text-xs">{c.cedula}</p>
                            ) : null}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="text-danger font-medium tabular-nums">{usd(c.saldo_usd)}</p>
                          <p className="text-muted-foreground text-xs tabular-nums">
                            {bs(c.saldo_usd * tasaValor)}
                          </p>
                        </td>
                        <td className="text-muted-foreground px-4 py-3 text-right tabular-nums">
                          {usd(c.limite_fiado_usd)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {moroso ? (
                              <span className="flex items-center gap-0.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                                <AlertTriangle className="size-3" />
                                Moroso
                              </span>
                            ) : pct >= 85 ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                                Al límite
                              </span>
                            ) : (
                              <span className="bg-surface-2 text-heading rounded-full px-2 py-0.5 text-xs">
                                Al día
                              </span>
                            )}
                          </div>
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
      )}
    </div>
  );
}
