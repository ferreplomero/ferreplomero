import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, Printer, Receipt, ShoppingBag } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getRecibosDelDia } from "@/lib/minimarket/data/ventas";
import { METODOS_PAGO } from "@/lib/minimarket/constants";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtHora, hoyEnTz } from "@/lib/minimarket/date-format";

export const metadata: Metadata = { title: "Recibos del día" };

function metodoLabel(metodo: string): string {
  return METODOS_PAGO.find((m) => m.value === metodo)?.label ?? metodo;
}

function badgeInfo(v: {
  estado: "completada" | "anulada";
  fiado_estado: "abierto" | "pagado" | "anulado" | null;
}): { label: string; cls: string } {
  if (v.estado === "anulada") return { label: "Anulada", cls: "bg-red-100 text-red-600" };
  if (v.fiado_estado === "abierto") return { label: "Fiada", cls: "bg-orange-100 text-orange-700" };
  return { label: "Pagada", cls: "bg-green-100 text-green-800" };
}

export default async function RecibosDelDiaPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);
  const tz = await getTimezoneNegocio(supabase, tenantId);
  const recibos = await getRecibosDelDia(supabase, tenantId, tz, hoyEnTz(tz));

  const usd = (n: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(n);
  const bs = (n: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "VES" }).format(n);
  const fmtHoraStr = (s: string) => fmtHora(s, tz);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-heading text-2xl font-semibold">Recibos del día</h1>
        <p className="text-muted-foreground">
          {recibos.length > 0
            ? `${recibos.length} venta${recibos.length !== 1 ? "s" : ""} registrada${recibos.length !== 1 ? "s" : ""} hoy`
            : "Sin ventas registradas hoy"}
        </p>
      </header>

      {recibos.length === 0 ? (
        <Card className="py-16 text-center">
          <Receipt className="text-muted-foreground mx-auto mb-3 size-10" />
          <p className="text-heading font-medium">Sin ventas hoy</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Registra la primera venta del día desde Nueva venta.
          </p>
          <Link
            href="/minimarket/ventas/nueva"
            className="bg-accent-500 hover:bg-accent-600 mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white"
          >
            <ShoppingBag className="size-4" />
            Nueva venta
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {recibos.map((v) => {
            const badge = badgeInfo(v);
            return (
              <Card key={v.id} className="flex items-center gap-4 p-4">
                {/* Hora */}
                <div className="flex shrink-0 flex-col items-center gap-0.5">
                  <Clock className="text-muted-foreground size-4" aria-hidden />
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {fmtHoraStr(v.created_at)}
                  </span>
                </div>

                {/* Info principal */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-heading font-mono text-sm font-medium">
                      {v.numero ?? "Sin nº"}
                    </span>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-muted-foreground truncate text-sm">
                    {v.cliente_nombre ?? "Consumidor final"} ·{" "}
                    {v.metodos.map(metodoLabel).join(" + ")}
                  </p>
                </div>

                {/* Totales */}
                <div className="shrink-0 text-right">
                  <p className="text-heading font-display font-semibold tabular-nums">
                    {usd(v.total_usd)}
                  </p>
                  <p className="text-muted-foreground text-xs tabular-nums">{bs(v.total_bs)}</p>
                </div>

                {/* Acciones */}
                <Link
                  href={`/minimarket/ventas/${v.id}/recibo`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-border text-heading hover:bg-surface-2 inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors"
                  aria-label="Reimprimir recibo"
                >
                  <Printer className="size-4" />
                  <span className="hidden sm:inline">Reimprimir</span>
                </Link>
              </Card>
            );
          })}
        </div>
      )}

      {recibos.length > 0 ? (
        <div className="flex justify-end">
          <Link href="/minimarket/ventas" className="text-accent-600 text-sm hover:underline">
            Ver historial completo →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
