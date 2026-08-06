import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Tag } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listCategorias } from "@/lib/minimarket/data/inventario";
import { CategoriasCrud } from "./categorias-crud";

export const metadata: Metadata = { title: "Categorías" };

export default async function CategoriasPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/inicio");

  const supabase = await createClient();
  const categorias = await listCategorias(supabase, tenantId);

  const { data: cuentas } = await supabase
    .from("mm_productos")
    .select("categoria_id")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .not("categoria_id", "is", null);

  const countPorCategoria = new Map<string, number>();
  for (const row of cuentas ?? []) {
    if (!row.categoria_id) continue;
    countPorCategoria.set(row.categoria_id, (countPorCategoria.get(row.categoria_id) ?? 0) + 1);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">Categorías</h1>
          <p className="text-muted-foreground">
            Organiza los productos por categoría. Las categorías se asignan en la ficha de cada
            producto.
          </p>
        </div>
        <Link
          href="/minimarket/inventario"
          className="border-border text-heading hover:bg-surface-2 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors"
        >
          ← Inventario
        </Link>
      </header>

      {categorias.length === 0 ? (
        <Card className="py-14 text-center">
          <Tag className="text-muted-foreground mx-auto mb-3 size-10" />
          <p className="text-heading font-medium">Sin categorías</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Crea tu primera categoría para organizar los productos.
          </p>
        </Card>
      ) : null}

      <CategoriasCrud
        categorias={categorias}
        countPorCategoria={Object.fromEntries(countPorCategoria)}
        tenantId={tenantId}
      />
    </div>
  );
}
