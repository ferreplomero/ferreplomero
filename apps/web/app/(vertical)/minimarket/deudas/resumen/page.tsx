import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CalendarClock, Wallet } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaCorta, hoyEnTz } from "@/lib/minimarket/date-format";
import { listDeudas, resumenDeDeudas } from "@/lib/minimarket/data/deudas";
import { DeudasPorCategoriaChart } from "@/components/minimarket/deudas/deudas-por-categoria-chart";

export const metadata: Metadata = { title: "Resumen de deudas" };

// mm_deudas.vencimiento es `date` puro: se formatea en UTC para no correrla
// un día (ver nota en deudas/page.tsx).
const TZ_FECHA_CALENDARIO = "UTC";
const DIAS_PROXIMO_VENCIMIENTO = 7;

export default async function ResumenDeudasPage() {
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
  const resumen = resumenDeDeudas(deudas);

  const tasaValor = tasa?.valor ?? 1;
  const usd = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(v);
  const bs = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "VES" }).format(v);

  const hoy = hoyEnTz(tz);
  const limite = new Date(`${hoy}T00:00:00.000Z`);
  limite.setUTCDate(limite.getUTCDate() + DIAS_PROXIMO_VENCIMIENTO);
  const limiteStr = limite.toISOString().slice(0, 10);

  const pendientes = deudas.filter((d) => d.saldo_usd > 0.001);
  const vencidas = pendientes.filter((d) => d.vencida);
  const proximasAVencer = pendientes.filter(
    (d) => !d.vencida && d.vencimiento && d.vencimiento >= hoy && d.vencimiento <= limiteStr,
  );

  const chartData = resumen.porCategoria.map((c) => ({
    categoriaNombre: c.categoriaNombre,
    saldoUsd: c.saldoUsd,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">Resumen de deudas</h1>
          <p className="text-muted-foreground">
            Vista general de los pasivos del dueño/negocio: cuánto se debe, por categoría y qué está
            por vencer.
          </p>
        </div>
        <Link
          href="/minimarket/deudas"
          className="border-border text-heading hover:bg-surface-2 inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors sm:shrink-0"
        >
          ← Mis deudas
        </Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-4">
          <span className="bg-accent-500/12 text-accent-600 inline-flex size-10 items-center justify-center rounded-xl">
            <Wallet className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-muted-foreground text-xs">Total adeudado</p>
            <p className="text-heading font-display text-lg font-semibold tabular-nums">
              {usd(resumen.totalAdeudadoUsd)}
            </p>
            <p className="text-muted-foreground text-xs tabular-nums">
              {bs(resumen.totalAdeudadoUsd * tasaValor)}
            </p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <span className="bg-amber-500/12 inline-flex size-10 items-center justify-center rounded-xl text-amber-600">
            <CalendarClock className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-muted-foreground text-xs">Próximas a vencer (7 días)</p>
            <p className="font-display text-lg font-semibold tabular-nums text-amber-600">
              {proximasAVencer.length}
            </p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <span className="bg-red-500/12 inline-flex size-10 items-center justify-center rounded-xl text-red-600">
            <AlertTriangle className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-muted-foreground text-xs">Vencidas</p>
            <p className="font-display text-lg font-semibold tabular-nums text-red-600">
              {vencidas.length}
            </p>
          </div>
        </Card>
      </section>

      <Card className="space-y-4 p-5">
        <h2 className="text-heading font-medium">Deudas por categoría</h2>
        <DeudasPorCategoriaChart data={chartData} locale={country.locale} />
        {resumen.porCategoria.length > 0 ? (
          <div className="divide-border divide-y border-t">
            {resumen.porCategoria.map((c) => (
              <div
                key={c.categoriaId ?? "sin-categoria"}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="text-heading">{c.categoriaNombre}</span>
                <div className="text-right">
                  <p className="text-heading font-medium tabular-nums">{usd(c.saldoUsd)}</p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {bs(c.saldoUsd * tasaValor)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      {vencidas.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-3">
            <AlertTriangle className="size-4 text-red-600" />
            <p className="text-sm font-medium text-red-700">
              {vencidas.length} deuda{vencidas.length !== 1 ? "s" : ""} vencida
              {vencidas.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="divide-border divide-y">
            {vencidas.map((d) => (
              <Link
                key={d.id}
                href={`/minimarket/deudas/${d.id}`}
                className="hover:bg-surface-2 flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-heading truncate font-medium">{d.descripcion}</p>
                  <p className="text-muted-foreground text-xs">
                    {d.acreedor} · venció el{" "}
                    {fmtFechaCorta(d.vencimiento as string, TZ_FECHA_CALENDARIO)}
                  </p>
                </div>
                <p className="shrink-0 font-medium tabular-nums text-red-600">{usd(d.saldo_usd)}</p>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      {proximasAVencer.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3">
            <CalendarClock className="size-4 text-amber-600" />
            <p className="text-sm font-medium text-amber-700">
              {proximasAVencer.length} deuda{proximasAVencer.length !== 1 ? "s" : ""} por vencer en
              los próximos {DIAS_PROXIMO_VENCIMIENTO} días
            </p>
          </div>
          <div className="divide-border divide-y">
            {proximasAVencer.map((d) => (
              <Link
                key={d.id}
                href={`/minimarket/deudas/${d.id}`}
                className="hover:bg-surface-2 flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-heading truncate font-medium">{d.descripcion}</p>
                  <p className="text-muted-foreground text-xs">
                    {d.acreedor} · vence el{" "}
                    {fmtFechaCorta(d.vencimiento as string, TZ_FECHA_CALENDARIO)}
                  </p>
                </div>
                <p className="text-heading shrink-0 font-medium tabular-nums">{usd(d.saldo_usd)}</p>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
