import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listTasasRecientes, TIPO_TASA_LABEL } from "@/lib/minimarket/exchange-rate";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaHora } from "@/lib/minimarket/date-format";

export const metadata: Metadata = { title: "Historial de tasa" };

export default async function HistorialTasaPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const [historial, tz] = await Promise.all([
    listTasasRecientes(supabase, tenantId, 200),
    getTimezoneNegocio(supabase, tenantId),
  ]);

  const num = new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const fecha = { format: (d: Date) => fmtFechaHora(d.toISOString(), tz) };

  const porFecha = new Map<string, typeof historial>();
  for (const t of historial) {
    const d = t.fecha;
    const arr = porFecha.get(d) ?? [];
    arr.push(t);
    porFecha.set(d, arr);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/minimarket/tasa"
          className="text-muted-foreground hover:text-heading mb-2 inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Tasa de cambio
        </Link>
        <h1 className="font-display text-heading text-2xl font-semibold">Historial de tasas</h1>
        <p className="text-muted-foreground">
          Registro append-only — cada tasa queda archivada. Los últimos 200 registros.
        </p>
      </header>

      {historial.length === 0 ? (
        <Card className="py-14 text-center">
          <p className="text-heading font-medium">Sin registros</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Registra la primera tasa del día en la pantalla de Tasa de cambio.
          </p>
          <Link
            href="/minimarket/tasa"
            className="bg-accent-500 hover:bg-accent-600 mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white"
          >
            Ir a tasa actual
          </Link>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <p className="text-heading text-sm font-medium">{historial.length} registros</p>
            <Link href="/minimarket/tasa" className="text-accent-600 text-xs hover:underline">
              Actualizar tasa →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Fecha y hora</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Origen</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {historial.map((t) => (
                  <tr key={t.id} className="hover:bg-surface-2 transition-colors">
                    <td className="text-muted-foreground px-4 py-3 tabular-nums">
                      {fecha.format(new Date(t.created_at))}
                    </td>
                    <td className="text-heading px-4 py-3 text-right font-medium tabular-nums">
                      Bs. {num.format(t.valor)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          t.tipo === "bcv"
                            ? "bg-blue-100 text-blue-700"
                            : t.tipo === "euro"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {TIPO_TASA_LABEL[t.tipo]}
                      </span>
                    </td>
                    <td className="text-muted-foreground px-4 py-3">
                      {t.fuente === "manual" ? "Manual" : "Automático"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
