import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeftRight } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  getTodasLasTasas,
  getTipoPreferido,
  listTasasRecientes,
  TIPO_TASA_LABEL,
} from "@/lib/minimarket/exchange-rate";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaHora } from "@/lib/minimarket/date-format";
import { TasasPanel } from "@/components/minimarket/tasa/tasas-panel";

export const metadata: Metadata = { title: "Tasa de cambio" };

const HORAS_ALERTA = 20; // más de 20 h sin actualizar → aviso

export default async function TasaPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const [tasas, fuentePreferida, historial, tz] = await Promise.all([
    getTodasLasTasas(supabase, tenantId),
    getTipoPreferido(supabase, tenantId),
    listTasasRecientes(supabase, tenantId),
    getTimezoneNegocio(supabase, tenantId),
  ]);

  const vigente = tasas[fuentePreferida];

  // Horas desde la última actualización DE LA TASA PREFERIDA (la que usa todo el sistema).
  const horasDesde = vigente
    ? Math.floor((Date.now() - new Date(vigente.created_at).getTime()) / 3_600_000)
    : null;
  const tasaDesactualizada = horasDesde !== null && horasDesde >= HORAS_ALERTA;

  const fecha = { format: (d: Date) => fmtFechaHora(d.toISOString(), tz) };
  const num = new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-heading text-2xl font-semibold">Tasa de cambio</h1>
        <p className="text-muted-foreground">
          Cada tarjeta guarda su propio valor — a mano o sincronizando con el BCV — sin afectar a
          las demás. &quot;Hacer predeterminada&quot; es un paso aparte: elige cuál de las 3 usa el
          POS por defecto. Cada venta puede además cobrarse con otra tasa puntual desde el diálogo
          de cobro.
        </p>
      </header>

      {/* Aviso tasa desactualizada */}
      {tasaDesactualizada ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            La tasa preseleccionada ({TIPO_TASA_LABEL[fuentePreferida]}) lleva{" "}
            <strong>{horasDesde} horas</strong> sin actualizarse. Los precios en Bs podrían estar
            desajustados. Actualízala antes de abrir el POS.
          </span>
        </div>
      ) : null}

      <Card className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="bg-accent-500/12 text-accent-600 inline-flex size-11 items-center justify-center rounded-xl">
            <ArrowLeftRight className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-muted-foreground text-xs">
              Tasa vigente ({TIPO_TASA_LABEL[fuentePreferida]})
            </p>
            <p className="text-heading font-display text-xl font-semibold tabular-nums">
              {vigente ? `Bs. ${num.format(vigente.valor)} / USD` : "Sin tasa registrada"}
            </p>
            {vigente ? (
              <p className="text-muted-foreground text-xs">
                Actualizada: {fecha.format(new Date(vigente.created_at))}
              </p>
            ) : null}
          </div>
        </div>
      </Card>

      <TasasPanel
        tasas={tasas}
        fuentePreferida={fuentePreferida}
        tenantId={tenantId}
        usuarioId={session.user.id}
      />

      {historial.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <div className="border-border text-heading flex items-center justify-between border-b px-4 py-3 text-sm font-medium">
            Historial
            <Link
              href="/minimarket/tasa/historial"
              className="text-accent-600 text-xs font-normal hover:underline"
            >
              Ver todo →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Fecha</th>
                  <th className="px-4 py-2.5 text-right font-medium">Valor</th>
                  <th className="px-4 py-2.5 font-medium">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {historial.slice(0, 10).map((t) => (
                  <tr key={t.id} className="border-border/70 border-b last:border-0">
                    <td className="text-muted-foreground px-4 py-2.5">
                      {fecha.format(new Date(t.created_at))}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      Bs. {num.format(t.valor)}
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5">{TIPO_TASA_LABEL[t.tipo]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
