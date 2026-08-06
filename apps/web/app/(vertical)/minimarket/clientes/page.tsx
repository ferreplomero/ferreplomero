import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  DollarSign,
  TrendingDown,
  Upload,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { listClientes, getResumenCartera } from "@/lib/minimarket/data/clientes";
import { ContactoAcciones } from "@/components/minimarket/contacto-acciones";

export const metadata: Metadata = { title: "Clientes y fiado" };

export default async function ClientesPage() {
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

  const usd = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(v);
  const bs = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "VES" }).format(v);

  const tasaValor = tasa?.valor ?? 1;
  const totalCarteraBs = resumen.totalCarteraUsd * tasaValor;

  const tarjetas = [
    { label: "Clientes activos", valor: String(resumen.totalClientes), Icon: Users },
    { label: "Con deuda abierta", valor: String(resumen.clientesConDeuda), Icon: UserCheck },
    { label: "Morosos (+30 días)", valor: String(resumen.clientesMorosos), Icon: TrendingDown },
    {
      label: "Cartera total (USD)",
      valor: usd(resumen.totalCarteraUsd),
      Icon: DollarSign,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">Clientes y fiado</h1>
          <p className="text-muted-foreground">
            Lleva la libreta de fiado digital. El saldo se calcula del historial de ventas y abonos,
            nunca de un contador editable.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/minimarket/clientes/carga"
            className="border-border bg-surface hover:bg-surface-2 text-heading focus-visible:ring-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
          >
            <Upload className="size-4" />
            Carga masiva
          </Link>
          <Link
            href="/minimarket/clientes/nuevo"
            className="bg-accent-500 hover:bg-accent-600 focus-visible:ring-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2"
          >
            <UserPlus className="size-4" />
            Nuevo cliente
          </Link>
        </div>
      </header>

      {/* Tarjetas resumen */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

      {/* Totales de cartera */}
      {resumen.totalCarteraUsd > 0 ? (
        <Card className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-muted-foreground text-sm">Total cartera por cobrar</span>
          <div className="sm:text-right">
            <p className="text-heading font-display text-xl font-bold tabular-nums">
              {usd(resumen.totalCarteraUsd)}
            </p>
            <p className="text-muted-foreground text-sm tabular-nums">{bs(totalCarteraBs)}</p>
          </div>
        </Card>
      ) : null}

      {/* Listado */}
      {clientes.length === 0 ? (
        <Card className="py-16 text-center">
          <Users className="text-muted-foreground mx-auto mb-3 size-10" />
          <p className="text-heading font-medium">Sin clientes registrados</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Agrega clientes para llevar el control de su fiado.
          </p>
          <Link
            href="/minimarket/clientes/nuevo"
            className="bg-accent-500 hover:bg-accent-600 mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white"
          >
            <UserPlus className="size-4" />
            Nuevo cliente
          </Link>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <p className="text-heading text-sm font-medium">
              {clientes.length} cliente{clientes.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Contacto</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3 text-right">Límite</th>
                  <th className="px-4 py-3">Crédito usado</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {clientes.map((c) => {
                  const pct =
                    c.limite_fiado_usd > 0
                      ? Math.min(100, (c.saldo_usd / c.limite_fiado_usd) * 100)
                      : 0;
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
                      <td className="text-muted-foreground px-4 py-3">
                        <div className="space-y-1.5">
                          <p>{c.whatsapp ?? c.telefono ?? "—"}</p>
                          <ContactoAcciones telefono={c.telefono} whatsapp={c.whatsapp} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p
                          className={`font-medium tabular-nums ${c.saldo_usd > 0 ? "text-danger" : "text-muted-foreground"}`}
                        >
                          {usd(c.saldo_usd)}
                        </p>
                        {c.saldo_usd > 0 ? (
                          <p className="text-muted-foreground text-xs tabular-nums">
                            {bs(c.saldo_usd * tasaValor)}
                          </p>
                        ) : null}
                      </td>
                      <td className="text-muted-foreground px-4 py-3 text-right tabular-nums">
                        {usd(c.limite_fiado_usd)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="bg-surface-2 h-2 w-20 overflow-hidden rounded-full">
                            <div
                              className={`h-full rounded-full ${
                                pct >= 100
                                  ? "bg-red-500"
                                  : pct >= 85
                                    ? "bg-amber-400"
                                    : "bg-green-500"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-muted-foreground text-xs tabular-nums">
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {!c.activo ? (
                            <span className="bg-surface-2 text-heading rounded-full px-2 py-0.5 text-xs">
                              Inactivo
                            </span>
                          ) : null}
                          {c.moroso ? (
                            <span className="flex items-center gap-0.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                              <AlertTriangle className="size-3" />
                              Moroso
                            </span>
                          ) : pct >= 85 && pct < 100 ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                              Al límite
                            </span>
                          ) : null}
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
                          {c.saldo_usd > 0 ? (
                            <Link
                              href={`/minimarket/clientes/${c.id}/abonar`}
                              className="text-muted-foreground hover:text-heading text-xs"
                            >
                              Abonar
                            </Link>
                          ) : null}
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
