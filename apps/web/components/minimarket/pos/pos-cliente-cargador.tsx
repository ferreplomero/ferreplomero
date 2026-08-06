"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

/**
 * Carga diferida (ssr:false) del formulario de venta — es el componente más
 * pesado del vertical: usa `@powersync/react` (cola de escritura offline) y
 * el detector de código de barras. La página que lo usa (`ventas/nueva`) es
 * un Server Component que ya trae los datos por props; este wrapper cliente
 * es el punto donde se puede usar `ssr:false` (no está permitido directo en
 * un Server Component) sin perder esos datos — `next/dynamic` los reenvía
 * igual.
 */
export const PosCliente = dynamic(() => import("./pos-cliente").then((m) => m.PosCliente), {
  ssr: false,
  loading: () => (
    <div className="text-muted-foreground flex min-h-[50vh] flex-col items-center justify-center gap-3 text-sm">
      <Loader2 className="size-6 animate-spin" aria-hidden />
      Cargando el punto de venta…
    </div>
  ),
});
