import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, History } from "lucide-react";
import { Button, Card } from "@arkiteq/ui";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listMovimientos, type MovimientoConDetalle } from "@/lib/minimarket/data/inventario";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaHora } from "@/lib/minimarket/date-format";

export const metadata: Metadata = { title: "Movimientos" };

const ETIQUETA: Record<MovimientoConDetalle["tipo"], { texto: string; clase: string }> = {
  entrada: { texto: "Entrada", clase: "bg-success/12 text-success" },
  salida: { texto: "Salida", clase: "bg-warning/15 text-warning" },
  merma: { texto: "Merma", clase: "bg-danger/12 text-danger" },
  ajuste: { texto: "Ajuste", clase: "bg-accent-500/12 text-accent-600" },
};

export default async function MovimientosPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const [movimientos, tz] = await Promise.all([
    listMovimientos(supabase, tenantId),
    getTimezoneNegocio(supabase, tenantId),
  ]);
  const fecha = { format: (d: Date) => fmtFechaHora(d.toISOString(), tz) };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/minimarket/inventario">
            <ArrowLeft className="size-4" />
            Inventario
          </Link>
        </Button>
        <header className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">Movimientos</h1>
          <p className="text-muted-foreground">
            Registro inmutable de entradas, salidas, ajustes y mermas. Es la fuente de verdad del
            stock.
          </p>
        </header>
      </div>

      {movimientos.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <span className="bg-accent-500/12 text-accent-600 inline-flex size-12 items-center justify-center rounded-2xl">
            <History className="size-6" aria-hidden />
          </span>
          <p className="text-heading font-medium">Aún no hay movimientos</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Registra entradas desde el inventario para empezar a mover el stock.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          {/* Móvil y tablet: tarjetas. */}
          <ul className="divide-border divide-y lg:hidden">
            {movimientos.map((m) => {
              const etq = ETIQUETA[m.tipo];
              return (
                <li key={m.id} className="space-y-1 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-heading min-w-0 font-medium">{m.producto_nombre}</p>
                    <p
                      className={`shrink-0 whitespace-nowrap font-medium tabular-nums ${m.cantidad < 0 ? "text-danger" : "text-success"}`}
                    >
                      {m.cantidad > 0 ? "+" : ""}
                      {m.cantidad}
                    </p>
                  </div>
                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 font-medium ${etq.clase}`}
                    >
                      {etq.texto}
                    </span>
                    <span className="tabular-nums">{fecha.format(new Date(m.created_at))}</span>
                    <span>{m.sucursal_nombre}</span>
                  </div>
                  {m.motivo ? <p className="text-muted-foreground text-xs">{m.motivo}</p> : null}
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Producto</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 text-right font-medium">Cantidad</th>
                  <th className="px-4 py-3 font-medium">Sucursal</th>
                  <th className="px-4 py-3 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => {
                  const etq = ETIQUETA[m.tipo];
                  return (
                    <tr key={m.id} className="border-border/70 border-b last:border-0">
                      <td className="text-muted-foreground whitespace-nowrap px-4 py-3">
                        {fecha.format(new Date(m.created_at))}
                      </td>
                      <td className="text-heading px-4 py-3">{m.producto_nombre}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${etq.clase}`}
                        >
                          {etq.texto}
                        </span>
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${m.cantidad < 0 ? "text-danger" : "text-success"}`}
                      >
                        {m.cantidad > 0 ? "+" : ""}
                        {m.cantidad}
                      </td>
                      <td className="text-muted-foreground px-4 py-3">{m.sucursal_nombre}</td>
                      <td className="text-muted-foreground px-4 py-3">{m.motivo ?? "—"}</td>
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
