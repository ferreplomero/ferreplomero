"use client";

import { Printer } from "lucide-react";
import { Button } from "@arkiteq/ui";

/** Botón "Imprimir" del recibo público (sin sesión) — se oculta al imprimir. */
export function ImprimirBoton() {
  return (
    <div className="flex justify-center print:hidden">
      <Button variant="outline" onClick={() => window.print()}>
        <Printer className="size-4" />
        Imprimir
      </Button>
    </div>
  );
}
