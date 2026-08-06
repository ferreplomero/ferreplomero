"use client";

import dynamic from "next/dynamic";

/**
 * Carga diferida (ssr:false) del modal "Crear cliente" del POS — no bloquea
 * el bundle inicial de Ventas; se abre solo bajo demanda. El modal está
 * oculto vía `open={false}` mientras no se use, así que un `loading: null`
 * no cambia nada visible (mismo criterio que los *-cargador de charts).
 */
export const CrearClienteModal = dynamic(
  () => import("./crear-cliente-modal").then((m) => m.CrearClienteModal),
  { ssr: false },
);

export type { ClienteCreadoPos } from "./crear-cliente-modal";
