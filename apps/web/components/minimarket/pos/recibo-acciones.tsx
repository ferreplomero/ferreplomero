"use client";

import Link from "next/link";
import { Printer, ShoppingCart } from "lucide-react";
import { Button } from "@arkiteq/ui";

/**
 * Acciones del recibo: nueva venta e imprimir. Se ocultan al imprimir.
 *
 * "Nueva venta" es la acción principal (el cajero casi siempre va a vender de
 * nuevo apenas cobra) y por eso va primero, a todo el ancho y con el botón
 * más grande: un solo toque lleva DIRECTO a `/minimarket/ventas/nueva` (antes
 * llevaba a `/minimarket`, el tablero — un paso de más antes de poder vender
 * otra vez). El carrito llega limpio solo porque `pos-cliente.tsx` ya vacía el
 * carrito ANTES de navegar al recibo tras confirmar la venta.
 */
export function ReciboAcciones() {
  return (
    <div className="flex flex-col gap-2 print:hidden">
      <Button asChild size="lg" className="w-full">
        <Link href="/minimarket/ventas/nueva">
          <ShoppingCart className="size-5" />
          Nueva venta
        </Link>
      </Button>
      <Button variant="outline" className="w-full" onClick={() => window.print()}>
        <Printer className="size-4" />
        Imprimir
      </Button>
    </div>
  );
}
