import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRightLeft, Plus, TriangleAlert } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { sucursalesPermitidas } from "@/lib/minimarket/sucursal-acceso";
import { listTransferencias } from "@/lib/minimarket/data/transferencias";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaHora } from "@/lib/minimarket/date-format";

export const metadata: Metadata = { title: "Transferencias entre sucursales" };

export default async function TransferenciasPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const permitidas = await sucursalesPermitidas(supabase, tenantId, session.user.id);

  if (permitidas.length < 2) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <span className="bg-warning/12 text-warning inline-flex size-12 items-center justify-center rounded-2xl">
            <TriangleAlert className="size-6" aria-hidden />
          </span>
          <p className="text-heading font-medium">No aplica para tu negocio</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Las transferencias sirven para mover stock entre sucursales. Tu negocio tiene una sola
            sucursal (o no tienes acceso a más de una), así que no hay entre qué transferir.
          </p>
        </Card>
      </div>
    );
  }

  const [transferencias, tz] = await Promise.all([
    listTransferencias(supabase, tenantId),
    getTimezoneNegocio(supabase, tenantId),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">
            Transferencias entre sucursales
          </h1>
          <p className="text-muted-foreground">
            Mueve stock de una sucursal a otra. El total del negocio no cambia, solo se
            redistribuye.
          </p>
        </div>
        <Link
          href="/minimarket/inventario/transferencias/nueva"
          className="bg-accent-500 hover:bg-accent-600 focus-visible:ring-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2"
        >
          <Plus className="size-4" />
          Nueva transferencia
        </Link>
      </header>

      {transferencias.length === 0 ? (
        <Card className="py-16 text-center">
          <ArrowRightLeft className="text-muted-foreground mx-auto mb-3 size-10" />
          <p className="text-heading font-medium">Sin transferencias registradas</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Registra tu primera transferencia para mover stock entre sucursales.
          </p>
          <Link
            href="/minimarket/inventario/transferencias/nueva"
            className="bg-accent-500 hover:bg-accent-600 mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white"
          >
            <Plus className="size-4" />
            Nueva transferencia
          </Link>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <p className="text-heading text-sm font-medium">
              {transferencias.length} transferencia{transferencias.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Origen</th>
                  <th className="px-4 py-3">Destino</th>
                  <th className="px-4 py-3">Registrada por</th>
                  <th className="px-4 py-3 text-right">Productos</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {transferencias.map((t) => (
                  <tr key={t.id} className="hover:bg-surface-2 transition-colors">
                    <td className="text-muted-foreground px-4 py-3 tabular-nums">
                      {fmtFechaHora(t.created_at, tz)}
                    </td>
                    <td className="text-heading px-4 py-3 font-medium">
                      {t.sucursal_origen_nombre ?? "—"}
                    </td>
                    <td className="text-heading px-4 py-3 font-medium">
                      {t.sucursal_destino_nombre ?? "—"}
                    </td>
                    <td className="text-muted-foreground px-4 py-3">{t.usuario_nombre ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {t.total_items} ({t.total_unidades} unid.)
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/minimarket/inventario/transferencias/${t.id}`}
                        className="text-accent-600 text-xs hover:underline"
                      >
                        Ver detalle
                      </Link>
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
