import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Store } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listPedidos } from "@/lib/minimarket/pedidos/panel";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaHora } from "@/lib/minimarket/date-format";
import { PedidosLista } from "./pedidos-lista";

export const metadata: Metadata = { title: "Pedidos" };

export default async function PedidosPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const [pedidos, tz] = await Promise.all([
    listPedidos(supabase, tenantId),
    getTimezoneNegocio(supabase, tenantId),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">Pedidos</h1>
          <p className="text-muted-foreground">
            Pedidos de tu catálogo en línea. No tocan inventario ni dinero hasta que verificas el
            pago o los cobras: ahí se registran como una venta normal.
          </p>
        </div>
        <Link
          href="/minimarket/pedidos/mi-catalogo"
          className="border-border hover:bg-surface-2 inline-flex shrink-0 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium"
        >
          <Store className="size-4" />
          Mi catálogo
        </Link>
      </header>
      <PedidosLista
        pedidos={pedidos.map((p) => ({ ...p, fechaTexto: fmtFechaHora(p.fecha, tz) }))}
      />
    </div>
  );
}
