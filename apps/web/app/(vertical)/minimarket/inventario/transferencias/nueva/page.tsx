import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listProductos } from "@/lib/minimarket/data/inventario";
import { sucursalesPermitidas, esCatalogoIrrestricto } from "@/lib/minimarket/sucursal-acceso";
import { TransferenciaForm } from "../transferencia-form";

export const metadata: Metadata = { title: "Nueva transferencia" };

export default async function NuevaTransferenciaPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const sucursales = await sucursalesPermitidas(supabase, tenantId, session.user.id);

  // Sin al menos 2 sucursales permitidas no hay entre qué transferir — mismo
  // criterio que la página de historial.
  if (sucursales.length < 2) {
    redirect("/minimarket/inventario/transferencias");
  }

  const irrestricto = await esCatalogoIrrestricto(supabase, tenantId, session.user.id);
  const productos = await listProductos(supabase, tenantId, sucursales, irrestricto);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/minimarket/inventario/transferencias"
          className="text-muted-foreground hover:text-heading mb-2 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Transferencias
        </Link>
        <h1 className="font-display text-heading text-2xl font-semibold">Nueva transferencia</h1>
        <p className="text-muted-foreground text-sm">
          Mueve stock de una sucursal a otra. El total del negocio no cambia, solo se redistribuye.
        </p>
      </header>

      <TransferenciaForm
        productos={productos.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          codigo: p.codigo,
          imagen_url: p.imagen_url,
          stockPorSucursal: p.stockPorSucursal.map((s) => ({
            sucursal_id: s.sucursal_id,
            stock_actual: s.stock_actual,
          })),
        }))}
        sucursales={sucursales}
        tenantId={tenantId}
        usuarioId={session.user.id}
      />
    </div>
  );
}
