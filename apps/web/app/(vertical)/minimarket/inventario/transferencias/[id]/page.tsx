import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTransferenciaConItems } from "@/lib/minimarket/data/transferencias";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaHora } from "@/lib/minimarket/date-format";

export const metadata: Metadata = { title: "Detalle de transferencia" };

export default async function TransferenciaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const [transferencia, tz] = await Promise.all([
    getTransferenciaConItems(supabase, tenantId, id),
    getTimezoneNegocio(supabase, tenantId),
  ]);

  if (!transferencia) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/minimarket/inventario/transferencias"
        className="text-muted-foreground hover:text-heading inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        Transferencias
      </Link>

      <header className="space-y-1">
        <h1 className="font-display text-heading text-2xl font-semibold">Transferencia de stock</h1>
        <p className="text-muted-foreground text-sm">
          {fmtFechaHora(transferencia.created_at, tz)}
          {transferencia.usuario_nombre ? ` · Registrada por ${transferencia.usuario_nombre}` : ""}
        </p>
      </header>

      <Card className="flex items-center justify-center gap-4 p-6">
        <div className="text-center">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">Origen</p>
          <p className="text-heading font-medium">{transferencia.sucursal_origen_nombre ?? "—"}</p>
        </div>
        <ArrowRight className="text-muted-foreground size-5 shrink-0" aria-hidden />
        <div className="text-center">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">Destino</p>
          <p className="text-heading font-medium">{transferencia.sucursal_destino_nombre ?? "—"}</p>
        </div>
      </Card>

      {transferencia.notas ? (
        <p className="text-muted-foreground text-sm">
          <span className="text-heading font-medium">Notas: </span>
          {transferencia.notas}
        </p>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <p className="text-heading text-sm font-medium">
            {transferencia.total_items} producto{transferencia.total_items !== 1 ? "s" : ""}
          </p>
          <p className="text-muted-foreground text-sm tabular-nums">
            {transferencia.total_unidades} unidades en total
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {transferencia.items.map((i) => (
                <tr key={i.id}>
                  <td className="text-heading px-4 py-3 font-medium">
                    {i.producto_nombre ?? "Producto eliminado"}
                    {i.producto_codigo ? (
                      <span className="text-muted-foreground ml-2 text-xs font-normal">
                        {i.producto_codigo}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{i.cantidad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
