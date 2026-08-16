import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listCategoriasMovimiento } from "@/lib/minimarket/data/categorias-movimiento";
import { ReportesTabs } from "../reportes-tabs";
import { CategoriasMovimientoCrud } from "./categorias-movimiento-crud";

export const metadata: Metadata = { title: "Categorías" };

function contarPorCategoria(rows: { categoria_id: string }[]): Record<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.categoria_id, (map.get(row.categoria_id) ?? 0) + 1);
  return Object.fromEntries(map);
}

export default async function CategoriasPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const [categoriasGasto, categoriasOtroIngreso, { data: gastos }, { data: otrosIngresos }] =
    await Promise.all([
      listCategoriasMovimiento(supabase, tenantId, "gasto"),
      listCategoriasMovimiento(supabase, tenantId, "otro_ingreso"),
      supabase
        .from("mm_gastos_operativos")
        .select("categoria_id")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null),
      supabase
        .from("mm_otros_ingresos")
        .select("categoria_id")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null),
    ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <ReportesTabs activo="/minimarket/reportes/categorias" />

      <header className="space-y-1">
        <h1 className="font-display text-heading text-2xl font-semibold">Categorías</h1>
        <p className="text-muted-foreground">
          Organiza los Gastos operativos y Otros ingresos por categoría — se reflejan en el Libro
          Diario y el Libro Mayor. Puramente organizativo: no altera montos ni el Estado de
          Resultados.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-heading font-medium">Categorías de gastos operativos</h2>
        <CategoriasMovimientoCrud
          tipo="gasto"
          categorias={categoriasGasto}
          countPorCategoria={contarPorCategoria(gastos ?? [])}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-heading font-medium">Categorías de otros ingresos</h2>
        <CategoriasMovimientoCrud
          tipo="otro_ingreso"
          categorias={categoriasOtroIngreso}
          countPorCategoria={contarPorCategoria(otrosIngresos ?? [])}
        />
      </section>
    </div>
  );
}
