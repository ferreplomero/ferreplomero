"use client";

import dynamic from "next/dynamic";

/**
 * Carga diferida (ssr:false) del formulario de movimiento de inventario —
 * solo se muestra dentro de un Dialog cerrado por defecto, mismo criterio
 * que crear-cliente-modal-cargador.tsx en POS.
 */
export const MovimientoForm = dynamic(
  () => import("./movimiento-form").then((m) => m.MovimientoForm),
  { ssr: false },
);
