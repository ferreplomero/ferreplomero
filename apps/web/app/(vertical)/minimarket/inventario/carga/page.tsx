import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@arkiteq/ui";
import { CargaCliente } from "@/components/minimarket/inventario/carga-cliente";

export const metadata: Metadata = { title: "Carga masiva" };

/** Margen extra sobre el default de la plataforma para `cargaMasivaLote`: cada
 * lote ya está pensado para resolverse en segundos (inserts batch, ver
 * actions.ts), esto es solo colchón de seguridad. */
export const maxDuration = 30;

export default function CargaMasivaPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/minimarket/inventario">
            <ArrowLeft className="size-4" />
            Inventario
          </Link>
        </Button>
        <header className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">Carga masiva</h1>
          <p className="text-muted-foreground">
            Descarga la plantilla, llena tus productos y súbela para crear muchos a la vez.
          </p>
        </header>
      </div>

      <CargaCliente />
    </div>
  );
}
