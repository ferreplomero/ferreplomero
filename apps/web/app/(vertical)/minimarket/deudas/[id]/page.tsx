import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, Receipt } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaHora, fmtFechaLarga } from "@/lib/minimarket/date-format";
import { getDeudaConAbonos } from "@/lib/minimarket/data/deudas";
import { METODOS_ABONO } from "@/lib/minimarket/constants";
import { EliminarDeudaBoton } from "../eliminar-deuda-boton";
import type { MmDeudaEstado } from "@arkiteq/db";

// mm_deudas.fecha/vencimiento son `date` (calendario puro): se formatean con
// timeZone "UTC" para no correrlas un día, igual que en la lista (ver page.tsx).
const TZ_FECHA_CALENDARIO = "UTC";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const session = await getSessionContext();
  if (!session?.activeTenant?.id) return { title: "Deuda" };
  const supabase = await createClient();
  const tz = await getTimezoneNegocio(supabase, session.activeTenant.id);
  const deuda = await getDeudaConAbonos(supabase, session.activeTenant.id, id, tz);
  return { title: deuda ? deuda.descripcion : "Deuda" };
}

const ESTADO_BADGE: Record<MmDeudaEstado, { label: string; cls: string }> = {
  pendiente: { label: "Pendiente", cls: "bg-amber-100 text-amber-700" },
  pagada: { label: "Pagada", cls: "bg-green-100 text-green-700" },
};

export default async function DeudaDetallePage({ params }: Props) {
  const { id } = await params;

  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/inicio");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);

  const tz = await getTimezoneNegocio(supabase, tenantId);
  const [deuda, tasa] = await Promise.all([
    getDeudaConAbonos(supabase, tenantId, id, tz),
    getTasaVigente(supabase, tenantId),
  ]);

  if (!deuda) notFound();

  const tasaValor = tasa?.valor ?? 1;
  const usd = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(v);
  const bs = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "VES" }).format(v);

  const badge = ESTADO_BADGE[deuda.estado] ?? ESTADO_BADGE.pendiente;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/minimarket/deudas"
          className="text-muted-foreground hover:text-heading mb-2 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Deudas
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-heading text-2xl font-semibold">
              {deuda.descripcion}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                {badge.label}
              </span>
              {deuda.vencida ? (
                <span className="flex items-center gap-0.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                  <AlertTriangle className="size-3" />
                  Vencida
                </span>
              ) : null}
              <span className="text-muted-foreground text-sm">{deuda.acreedor}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:shrink-0">
            {deuda.saldo_usd > 0 ? (
              <Link
                href={`/minimarket/deudas/${deuda.id}/abonar`}
                className="bg-accent-500 hover:bg-accent-600 inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium text-white transition-colors"
              >
                Abonar
              </Link>
            ) : null}
            <Link
              href={`/minimarket/deudas/${deuda.id}/editar`}
              className="border-border text-heading hover:bg-surface-2 inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-sm transition-colors"
            >
              Editar
            </Link>
            <EliminarDeudaBoton deudaId={deuda.id} descripcion={deuda.descripcion} />
          </div>
        </div>
      </header>

      {/* Info general */}
      <Card className="grid gap-4 p-5 sm:grid-cols-3">
        <div>
          <p className="text-muted-foreground text-xs">Categoría</p>
          <p className="text-heading mt-0.5 font-medium">
            {deuda.categoria_nombre ?? "Sin categoría"}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Fecha</p>
          <p className="text-heading mt-0.5 font-medium tabular-nums">
            {fmtFechaLarga(deuda.fecha, TZ_FECHA_CALENDARIO)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Vencimiento</p>
          <p className="text-heading mt-0.5 font-medium tabular-nums">
            {deuda.vencimiento
              ? fmtFechaLarga(deuda.vencimiento, TZ_FECHA_CALENDARIO)
              : "Sin vencimiento"}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Monto total</p>
          <p className="text-heading mt-0.5 font-medium tabular-nums">{usd(deuda.monto_usd)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Pagado</p>
          <p className="mt-0.5 font-medium tabular-nums text-green-600">{usd(deuda.pagado_usd)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Saldo pendiente</p>
          <p
            className={`mt-0.5 font-medium tabular-nums ${deuda.saldo_usd > 0 ? "text-danger" : "text-green-600"}`}
          >
            {usd(deuda.saldo_usd)}
          </p>
          {deuda.saldo_usd > 0 ? (
            <p className="text-muted-foreground text-xs tabular-nums">
              {bs(deuda.saldo_usd * tasaValor)}
            </p>
          ) : null}
        </div>
        {deuda.notas ? (
          <div className="sm:col-span-3">
            <p className="text-muted-foreground text-xs">Notas</p>
            <p className="text-heading mt-0.5 whitespace-pre-line text-sm">{deuda.notas}</p>
          </div>
        ) : null}
      </Card>

      {/* Historial de abonos */}
      <Card className="overflow-hidden p-0">
        <div className="border-border flex items-center gap-2 border-b px-4 py-3">
          <Receipt className="text-muted-foreground size-4" />
          <p className="text-heading text-sm font-medium">
            {deuda.abonos.length} abono{deuda.abonos.length !== 1 ? "s" : ""} registrado
            {deuda.abonos.length !== 1 ? "s" : ""}
          </p>
        </div>
        {deuda.abonos.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm">
            Aún no se han registrado abonos a esta deuda.
          </p>
        ) : (
          <div className="divide-border divide-y">
            {deuda.abonos.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="text-heading font-medium">
                    {METODOS_ABONO.find((m) => m.value === a.metodo)?.label ?? a.metodo}
                  </p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {fmtFechaHora(a.created_at, tz)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-heading font-medium tabular-nums">
                    {usd(Number(a.monto_usd))}
                  </p>
                  {a.monto_bs ? (
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {bs(Number(a.monto_bs))}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
