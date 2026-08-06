import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Landmark, Plus, Tags, Wallet } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaCorta } from "@/lib/minimarket/date-format";
import { listDeudas } from "@/lib/minimarket/data/deudas";
import { EliminarDeudaBoton } from "./eliminar-deuda-boton";
import type { MmDeudaEstado } from "@arkiteq/db";

export const metadata: Metadata = { title: "Deudas" };

// mm_deudas.fecha/vencimiento son columnas `date` (fecha de calendario pura,
// sin hora): se formatean con timeZone "UTC" para redisplay-arlas tal cual,
// NUNCA con la zona horaria del negocio (eso las correría un día, el mismo
// bug que se corrigió en mm_compras.fecha — ver migración 0045).
const TZ_FECHA_CALENDARIO = "UTC";

export default async function DeudasPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);

  const [tz, tasa] = await Promise.all([
    getTimezoneNegocio(supabase, tenantId),
    getTasaVigente(supabase, tenantId),
  ]);
  const deudas = await listDeudas(supabase, tenantId, tz);

  const tasaValor = tasa?.valor ?? 1;
  const usd = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(v);
  const bs = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "VES" }).format(v);

  const pendientes = deudas.filter((d) => d.saldo_usd > 0.001);
  const vencidas = pendientes.filter((d) => d.vencida);
  const totalAdeudado = pendientes.reduce((s, d) => s + d.saldo_usd, 0);

  const ESTADO_BADGE: Record<MmDeudaEstado, { label: string; cls: string }> = {
    pendiente: { label: "Pendiente", cls: "bg-amber-100 text-amber-700" },
    pagada: { label: "Pagada", cls: "bg-green-100 text-green-700" },
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">Deudas</h1>
          <p className="text-muted-foreground">
            Deudas del dueño/negocio (préstamos, servicios, alquiler, etc.) — distinto de las{" "}
            <Link href="/minimarket/compras/por-pagar" className="text-accent-600 hover:underline">
              cuentas por pagar a proveedores
            </Link>
            , que es mercancía recibida pendiente de pago.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/minimarket/deudas/categorias"
            className="border-border bg-surface hover:bg-surface-2 text-heading focus-visible:ring-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
          >
            <Tags className="size-4" />
            Categorías
          </Link>
          <Link
            href="/minimarket/deudas/nueva"
            className="bg-accent-500 hover:bg-accent-600 focus-visible:ring-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2"
          >
            <Plus className="size-4" />
            Nueva deuda
          </Link>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-4">
          <span className="bg-accent-500/12 text-accent-600 inline-flex size-10 items-center justify-center rounded-xl">
            <Wallet className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-muted-foreground text-xs">Total adeudado</p>
            <p className="text-heading font-display text-lg font-semibold tabular-nums">
              {usd(totalAdeudado)}
            </p>
            <p className="text-muted-foreground text-xs tabular-nums">
              {bs(totalAdeudado * tasaValor)}
            </p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <span className="bg-accent-500/12 text-accent-600 inline-flex size-10 items-center justify-center rounded-xl">
            <Landmark className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-muted-foreground text-xs">Deudas pendientes</p>
            <p className="text-heading font-display text-lg font-semibold tabular-nums">
              {pendientes.length}
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

      {deudas.length === 0 ? (
        <Card className="py-16 text-center">
          <Landmark className="text-muted-foreground mx-auto mb-3 size-10" />
          <p className="text-heading font-medium">Sin deudas registradas</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Registra préstamos, servicios u otras deudas del negocio para llevarlas al día.
          </p>
          <Link
            href="/minimarket/deudas/nueva"
            className="bg-accent-500 hover:bg-accent-600 mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white"
          >
            <Plus className="size-4" />
            Nueva deuda
          </Link>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <p className="text-heading text-sm font-medium">
              {deudas.length} deuda{deudas.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Deuda</th>
                  <th className="px-4 py-3">Acreedor</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3">Vencimiento</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {deudas.map((d) => {
                  const badge = ESTADO_BADGE[d.estado] ?? ESTADO_BADGE.pendiente;
                  return (
                    <tr key={d.id} className="hover:bg-surface-2 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/minimarket/deudas/${d.id}`}
                          className="text-accent-600 hover:underline"
                        >
                          <p className="font-medium">{d.descripcion}</p>
                        </Link>
                        <p className="text-muted-foreground text-xs tabular-nums">
                          {fmtFechaCorta(d.fecha, TZ_FECHA_CALENDARIO)}
                        </p>
                      </td>
                      <td className="text-muted-foreground px-4 py-3">{d.acreedor}</td>
                      <td className="text-muted-foreground px-4 py-3">
                        {d.categoria_nombre ?? "Sin categoría"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-heading font-medium tabular-nums">{usd(d.monto_usd)}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p
                          className={`font-medium tabular-nums ${d.saldo_usd > 0 ? "text-danger" : "text-muted-foreground"}`}
                        >
                          {usd(d.saldo_usd)}
                        </p>
                        {d.saldo_usd > 0 ? (
                          <p className="text-muted-foreground text-xs tabular-nums">
                            {bs(d.saldo_usd * tasaValor)}
                          </p>
                        ) : null}
                      </td>
                      <td className="text-muted-foreground px-4 py-3 tabular-nums">
                        {d.vencimiento ? fmtFechaCorta(d.vencimiento, TZ_FECHA_CALENDARIO) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                          {d.vencida ? (
                            <span className="flex items-center gap-0.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                              <AlertTriangle className="size-3" />
                              Vencida
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {d.saldo_usd > 0 ? (
                            <Link
                              href={`/minimarket/deudas/${d.id}/abonar`}
                              className="text-accent-600 text-xs font-medium hover:underline"
                            >
                              Abonar
                            </Link>
                          ) : null}
                          <Link
                            href={`/minimarket/deudas/${d.id}/editar`}
                            className="text-muted-foreground hover:text-heading text-xs"
                          >
                            Editar
                          </Link>
                          <EliminarDeudaBoton deudaId={d.id} descripcion={d.descripcion} />
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
