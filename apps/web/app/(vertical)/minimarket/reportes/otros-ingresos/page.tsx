import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Sparkles } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fmtFechaCorta } from "@/lib/minimarket/date-format";
import { listOtrosIngresos } from "@/lib/minimarket/data/ganancias";
import { METODOS_PAGO } from "@/lib/minimarket/constants";
import { ReportesTabs } from "../reportes-tabs";
import { EliminarOtroIngresoBoton } from "./eliminar-otro-ingreso-boton";

export const metadata: Metadata = { title: "Otros ingresos" };

// mm_otros_ingresos.fecha es `date` puro (calendario, sin hora) — mismo
// criterio que Gastos operativos.
const TZ_FECHA_CALENDARIO = "UTC";

function metodoLabel(metodo: string): string {
  return METODOS_PAGO.find((m) => m.value === metodo)?.label ?? metodo;
}

const METODO_CHIP: Record<string, string> = {
  efectivo_bs: "bg-blue-100 text-blue-800",
  efectivo_usd: "bg-green-100 text-green-800",
  pago_movil: "bg-purple-100 text-purple-800",
  transferencia: "bg-indigo-100 text-indigo-800",
  zelle: "bg-teal-100 text-teal-800",
  tarjeta: "bg-yellow-100 text-yellow-800",
};

export default async function OtrosIngresosPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);
  const otrosIngresos = await listOtrosIngresos(supabase, tenantId);

  const usd = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(v);

  const total = otrosIngresos.reduce((s, i) => s + Number(i.monto_usd), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <ReportesTabs activo="/minimarket/reportes/otros-ingresos" />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">Otros ingresos</h1>
          <p className="text-muted-foreground">
            Dinero que entra sin ser una venta: aporte del dueño, venta de un activo, un reembolso,
            etc. Los recibidos en efectivo entran a Caja; los digitales, a la cuenta bancaria que
            elijas. Se suman aparte de las ventas en Reportes → Ganancias.
          </p>
        </div>
        <Link
          href="/minimarket/reportes/otros-ingresos/nuevo"
          className="bg-accent-500 hover:bg-accent-600 focus-visible:ring-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2"
        >
          <Plus className="size-4" />
          Nuevo ingreso
        </Link>
      </header>

      {otrosIngresos.length === 0 ? (
        <Card className="py-16 text-center">
          <Sparkles className="text-muted-foreground mx-auto mb-3 size-10" />
          <p className="text-heading font-medium">Sin otros ingresos registrados</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Registra aquí el dinero que entra al negocio sin ser una venta.
          </p>
          <Link
            href="/minimarket/reportes/otros-ingresos/nuevo"
            className="bg-accent-500 hover:bg-accent-600 mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white"
          >
            <Plus className="size-4" />
            Nuevo ingreso
          </Link>
        </Card>
      ) : (
        <>
          <Card className="space-y-1 p-5">
            <p className="text-muted-foreground text-sm">Total de otros ingresos</p>
            <p className="text-heading font-display text-2xl font-bold tabular-nums">
              {usd(total)}
            </p>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-border flex items-center justify-between border-b px-4 py-3">
              <p className="text-heading text-sm font-medium">
                {otrosIngresos.length} ingreso{otrosIngresos.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3">Concepto</th>
                    <th className="px-4 py-3">Origen</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3 text-right">Monto</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {otrosIngresos.map((i) => (
                    <tr key={i.id} className="hover:bg-surface-2 transition-colors">
                      <td className="text-heading px-4 py-3 font-medium">{i.descripcion}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            METODO_CHIP[i.metodo_pago] ?? "bg-surface-2 text-heading"
                          }`}
                        >
                          {metodoLabel(i.metodo_pago)}
                        </span>
                      </td>
                      <td className="text-muted-foreground px-4 py-3 tabular-nums">
                        {fmtFechaCorta(i.fecha, TZ_FECHA_CALENDARIO)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-heading font-medium tabular-nums">
                          {usd(Number(i.monto_usd))}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/minimarket/reportes/otros-ingresos/${i.id}/editar`}
                            className="text-muted-foreground hover:text-heading text-xs"
                          >
                            Editar
                          </Link>
                          <EliminarOtroIngresoBoton
                            otroIngresoId={i.id}
                            descripcion={i.descripcion}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
