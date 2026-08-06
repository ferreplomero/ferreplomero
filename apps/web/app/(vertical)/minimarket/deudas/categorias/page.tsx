import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Tags } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listCategoriasDeuda } from "@/lib/minimarket/data/deudas";
import { CategoriasDeudaCrud } from "./categorias-deuda-crud";

export const metadata: Metadata = { title: "Categorías de deudas" };

export default async function CategoriasDeudaPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/inicio");

  const supabase = await createClient();
  const [categorias, { data: deudas }] = await Promise.all([
    listCategoriasDeuda(supabase, tenantId),
    supabase
      .from("mm_deudas")
      .select("categoria_id")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .not("categoria_id", "is", null),
  ]);

  const countPorCategoria = new Map<string, number>();
  for (const row of deudas ?? []) {
    if (!row.categoria_id) continue;
    countPorCategoria.set(row.categoria_id, (countPorCategoria.get(row.categoria_id) ?? 0) + 1);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">Categorías de deudas</h1>
          <p className="text-muted-foreground">
            Clasifica tus deudas (préstamos, servicios, alquiler, etc.). Se asignan al registrar
            cada deuda.
          </p>
        </div>
        <Link
          href="/minimarket/deudas"
          className="border-border text-heading hover:bg-surface-2 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors"
        >
          ← Deudas
        </Link>
      </header>

      {categorias.length === 0 ? (
        <Card className="py-14 text-center">
          <Tags className="text-muted-foreground mx-auto mb-3 size-10" />
          <p className="text-heading font-medium">Sin categorías</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Crea tu primera categoría para organizar las deudas.
          </p>
        </Card>
      ) : null}

      <CategoriasDeudaCrud
        categorias={categorias}
        countPorCategoria={Object.fromEntries(countPorCategoria)}
      />
    </div>
  );
}
