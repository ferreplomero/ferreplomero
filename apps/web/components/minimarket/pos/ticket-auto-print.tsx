"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@arkiteq/ui";

/**
 * Abre el diálogo de impresión a los 200 ms de cargar el ticket (tiempo para
 * que el navegador aplique el `@page` y cargue el logo), con botón manual de
 * respaldo si el navegador bloquea la impresión automática.
 */
export function TicketAutoPrint({ volverHref }: { volverHref: string }) {
  React.useEffect(() => {
    const t = window.setTimeout(() => window.print(), 200);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col gap-2 print:hidden">
      <Button className="w-full" onClick={() => window.print()}>
        <Printer className="size-4" />
        Imprimir ticket
      </Button>
      <Button asChild variant="outline" className="w-full">
        <Link href={volverHref}>
          <ArrowLeft className="size-4" />
          Volver al recibo
        </Link>
      </Button>
    </div>
  );
}
