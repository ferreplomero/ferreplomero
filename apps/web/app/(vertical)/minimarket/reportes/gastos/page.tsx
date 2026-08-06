import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Receipt } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fmtFechaCorta } from "@/lib/minimarket/date-format";
import { listGastosOperativos, GASTO_CATEGORIA_LABEL } from "@/lib/minimarket/data/ganancias";
import { METODOS_PAGO } from "@/lib/minimarket/constants";
import { ReportesTabs } from "../reportes-tabs";
import { EliminarGastoBoton } from "./eliminar-gasto-boton";

export const metadata: Metadata = { title: "Gastos operativos" };

// mm_gastos_operativos.fecha es `date` puro (calendario, sin hora): se
// formatea en UTC para no correrla un día (mismo criterio que Deudas).
const TZ_FECHA_CALENDARIO = "UTC";

function metodoLabel(metodo: string | null): string {
  if (!metodo) return "Sin especificar";
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

export default async function GastosOperativosPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/inicio");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);
  const gastos = await listGastosOperativos(supabase, tenantId);

  const usd = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(v);

  const porOrigenMap = new Map<string, number>();
  for (const g of gastos) {
    const key = g.metodo_pago ?? "sin_especificar";
    porOrigenMap.set(key, (porOrigenMap.get(key) ?? 0) + Number(g.monto_usd));
  }
  const porOrigen = [...porOrigenMap.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <ReportesTabs activo="/minimarket/reportes/gastos" />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">Gastos operativos</h1>
          <p className="text-muted-foreground">
            Alquiler, sueldos, servicios y demás gastos reales del negocio. Los pagados en efectivo
            descuentan la caja automáticamente; los digitales descuentan la cuenta bancaria que
            elijas. Se restan en Reportes → Ganancias.
          </p>
        </div>
        <Link
          href="/minimarket/reportes/gastos/nuevo"
          className="bg-accent-500 hover:bg-accent-600 focus-visible:ring-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2"
        >
          <Plus className="size-4" />
          Nuevo gasto
        </Link>
      </header>

      {gastos.length === 0 ? (
        <Card className="py-16 text-center">
          <Receipt className="text-muted-foreground mx-auto mb-3 size-10" />
          <p className="text-heading font-medium">Sin gastos registrados</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Registra tus gastos fijos para que la ganancia neta de tu negocio sea real.
          </p>
          <Link
            href="/minimarket/reportes/gastos/nuevo"
            className="bg-accent-500 hover:bg-accent-600 mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white"
          >
            <Plus className="size-4" />
            Nuevo gasto
          </Link>
        </Card>
      ) : (
        <>
          <Card className="space-y-3 p-5">
            <p className="text-heading text-sm font-semibold">Gastos por origen</p>
            <div className="flex flex-wrap gap-4">
              {porOrigen.map(([metodo, total]) => (
                <div key={metodo} className="min-w-[9rem]">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      METODO_CHIP[metodo] ?? "bg-surface-2 text-heading"
                    }`}
                  >
                    {metodoLabel(metodo === "sin_especificar" ? null : metodo)}
                  </span>
                  <p className="text-heading font-display mt-1 text-lg font-bold tabular-nums">
                    {usd(total)}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-border flex items-center justify-between border-b px-4 py-3">
              <p className="text-heading text-sm font-medium">
                {gastos.length} gasto{gastos.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3">Gasto</th>
                    <th className="px-4 py-3">Categoría</th>
                    <th className="px-4 py-3">Origen</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3 text-right">Monto</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {gastos.map((g) => (
                    <tr key={g.id} className="hover:bg-surface-2 transition-colors">
                      <td className="text-heading px-4 py-3 font-medium">{g.descripcion}</td>
                      <td className="text-muted-foreground px-4 py-3">
                        {GASTO_CATEGORIA_LABEL[g.categoria]}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            METODO_CHIP[g.metodo_pago ?? ""] ?? "bg-surface-2 text-heading"
                          }`}
                        >
                          {metodoLabel(g.metodo_pago)}
                        </span>
                      </td>
                      <td className="text-muted-foreground px-4 py-3 tabular-nums">
                        {fmtFechaCorta(g.fecha, TZ_FECHA_CALENDARIO)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-heading font-medium tabular-nums">
                          {usd(Number(g.monto_usd))}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/minimarket/reportes/gastos/${g.id}/editar`}
                            className="text-muted-foreground hover:text-heading text-xs"
                          >
                            Editar
                          </Link>
                          <EliminarGastoBoton gastoId={g.id} descripcion={g.descripcion} />
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
