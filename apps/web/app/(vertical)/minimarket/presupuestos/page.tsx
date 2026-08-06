import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileSpreadsheet, Plus } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listPresupuestos, type FiltrosPresupuesto } from "@/lib/minimarket/data/presupuestos";
import { listClientes } from "@/lib/minimarket/data/clientes";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaCorta } from "@/lib/minimarket/date-format";

export const metadata: Metadata = { title: "Presupuestos" };

const ESTADO_BADGE: Record<string, { label: string; cls: string }> = {
  pendiente: { label: "Pendiente", cls: "bg-amber-100 text-amber-700" },
  vencido: { label: "Vencido", cls: "bg-red-100 text-red-600" },
  convertido: { label: "Convertido", cls: "bg-green-100 text-green-700" },
  rechazado: { label: "Rechazado", cls: "bg-surface-2 text-heading" },
};

function estadoVisible(p: { estado: string; vencido: boolean }): string {
  return p.vencido ? "vencido" : p.estado;
}

function badgeDe(estado: string): { label: string; cls: string } {
  return ESTADO_BADGE[estado] ?? { label: "Pendiente", cls: "bg-amber-100 text-amber-700" };
}

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PresupuestosPage({ searchParams }: Props) {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/inicio");

  const params = await searchParams;
  const estadoParam = typeof params.estado === "string" ? params.estado : "";
  const clienteParam = typeof params.cliente_id === "string" ? params.cliente_id : "";
  const desdeParam = typeof params.desde === "string" ? params.desde : "";
  const hastaParam = typeof params.hasta === "string" ? params.hasta : "";

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);
  const tz = await getTimezoneNegocio(supabase, tenantId);

  const filtros: FiltrosPresupuesto = {
    estado: (estadoParam as FiltrosPresupuesto["estado"]) || undefined,
    clienteId: clienteParam || undefined,
    desde: desdeParam || undefined,
    hasta: hastaParam || undefined,
  };

  const [presupuestos, clientes] = await Promise.all([
    listPresupuestos(supabase, tenantId, tz, filtros),
    listClientes(supabase, tenantId),
  ]);

  const usd = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(v);
  const bs = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "VES" }).format(v);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">Presupuestos</h1>
          <p className="text-muted-foreground">
            Cotiza con precios editables. Mientras están pendientes no tocan inventario ni dinero —
            solo al convertirse en venta.
          </p>
        </div>
        <Link
          href="/minimarket/presupuestos/nueva"
          className="bg-accent-500 hover:bg-accent-600 focus-visible:ring-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2"
        >
          <Plus className="size-4" />
          Nuevo presupuesto
        </Link>
      </header>

      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs" htmlFor="estado">
              Estado
            </label>
            <select
              id="estado"
              name="estado"
              defaultValue={estadoParam}
              className="border-border bg-background h-10 w-full rounded-md border px-3 text-sm"
            >
              <option value="">Todos</option>
              <option value="pendiente">Pendiente</option>
              <option value="vencido">Vencido</option>
              <option value="convertido">Convertido</option>
              <option value="rechazado">Rechazado</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs" htmlFor="cliente_id">
              Cliente
            </label>
            <select
              id="cliente_id"
              name="cliente_id"
              defaultValue={clienteParam}
              className="border-border bg-background h-10 w-full rounded-md border px-3 text-sm"
            >
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs" htmlFor="desde">
              Desde
            </label>
            <input
              id="desde"
              type="date"
              name="desde"
              defaultValue={desdeParam}
              className="border-border bg-background h-10 w-full rounded-md border px-3 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs" htmlFor="hasta">
              Hasta
            </label>
            <input
              id="hasta"
              type="date"
              name="hasta"
              defaultValue={hastaParam}
              className="border-border bg-background h-10 w-full rounded-md border px-3 text-sm"
            />
          </div>
          <div className="sm:col-span-4">
            <button
              type="submit"
              className="border-border text-heading hover:bg-surface-2 inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition-colors"
            >
              Filtrar
            </button>
          </div>
        </form>
      </Card>

      {presupuestos.length === 0 ? (
        <Card className="py-16 text-center">
          <FileSpreadsheet className="text-muted-foreground mx-auto mb-3 size-10" />
          <p className="text-heading font-medium">Sin presupuestos</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Crea tu primer presupuesto para cotizar a un cliente.
          </p>
          <Link
            href="/minimarket/presupuestos/nueva"
            className="bg-accent-500 hover:bg-accent-600 mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white"
          >
            <Plus className="size-4" />
            Nuevo presupuesto
          </Link>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <p className="text-heading text-sm font-medium">
              {presupuestos.length} presupuesto{presupuestos.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Número</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Emisión</th>
                  <th className="px-4 py-3">Válido hasta</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {presupuestos.map((p) => {
                  const badge = badgeDe(estadoVisible(p));
                  return (
                    <tr key={p.id} className="hover:bg-surface-2 transition-colors">
                      <td className="text-heading px-4 py-3 font-medium">{p.numero}</td>
                      <td className="px-4 py-3">{p.clienteNombre ?? "Cliente ocasional"}</td>
                      <td className="text-muted-foreground px-4 py-3 tabular-nums">
                        {fmtFechaCorta(p.fechaEmision, tz)}
                      </td>
                      <td className="text-muted-foreground px-4 py-3 tabular-nums">
                        {fmtFechaCorta(p.validezHasta, tz)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-heading font-medium tabular-nums">{usd(p.totalUsd)}</p>
                        <p className="text-muted-foreground text-xs tabular-nums">
                          {bs(p.totalBs)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/minimarket/presupuestos/${p.id}`}
                          className="text-accent-600 text-xs hover:underline"
                        >
                          Ver detalle
                        </Link>
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
