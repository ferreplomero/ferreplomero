import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Layers } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listProductos, listSucursales, listMovimientos } from "@/lib/minimarket/data/inventario";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaHora } from "@/lib/minimarket/date-format";
import { AjusteForm } from "./ajuste-form";

export const metadata: Metadata = { title: "Ajustes de inventario" };

const TIPO_LABEL: Record<string, { label: string; cls: string }> = {
  entrada: { label: "Entrada", cls: "bg-green-100 text-green-700" },
  salida: { label: "Salida", cls: "bg-orange-100 text-orange-700" },
  ajuste: { label: "Ajuste", cls: "bg-blue-100 text-blue-700" },
  merma: { label: "Merma", cls: "bg-red-100 text-red-700" },
};

export default async function AjustesPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();

  const [productos, sucursales, movimientos, tz] = await Promise.all([
    listProductos(supabase, tenantId),
    listSucursales(supabase, tenantId),
    listMovimientos(supabase, tenantId, { tipos: ["ajuste", "merma"], limit: 50 }),
    getTimezoneNegocio(supabase, tenantId),
  ]);

  const activos = productos.filter((p) => p.activo);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">Ajustes y mermas</h1>
          <p className="text-muted-foreground">
            Correcciones de stock e inventario dañado o perdido. Cada registro es append-only y
            queda en el historial de movimientos.
          </p>
        </div>
        <Link
          href="/minimarket/inventario/movimientos"
          className="border-border text-heading hover:bg-surface-2 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors"
        >
          Ver todos los movimientos
        </Link>
      </header>

      <AjusteForm
        productos={activos}
        sucursales={sucursales}
        tenantId={tenantId}
        usuarioId={session.user.id}
      />

      <Card className="overflow-hidden p-0">
        <div className="border-border flex items-center gap-2 border-b px-4 py-3">
          <Layers className="text-muted-foreground size-4" />
          <p className="text-heading text-sm font-medium">Últimos 50 ajustes y mermas</p>
        </div>
        {movimientos.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm">
            Sin ajustes registrados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3 text-right">Cantidad</th>
                  <th className="px-4 py-3">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {movimientos.map((m) => {
                  const badge = TIPO_LABEL[m.tipo] ?? {
                    label: m.tipo,
                    cls: "bg-surface-2 text-heading",
                  };
                  return (
                    <tr key={m.id} className="hover:bg-surface-2 transition-colors">
                      <td className="text-muted-foreground px-4 py-3 tabular-nums">
                        {fmtFechaHora(m.created_at, tz)}
                      </td>
                      <td className="text-heading px-4 py-3 font-medium">
                        {m.producto_nombre ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-medium tabular-nums ${m.cantidad < 0 ? "text-danger" : "text-green-700"}`}
                      >
                        {m.cantidad > 0 ? "+" : ""}
                        {m.cantidad}
                      </td>
                      <td className="text-muted-foreground px-4 py-3">{m.motivo ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
