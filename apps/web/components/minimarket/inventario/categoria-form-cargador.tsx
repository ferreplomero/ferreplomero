"use client";

import dynamic from "next/dynamic";

/**
 * Carga diferida (ssr:false) del formulario de categoría — solo se muestra
 * dentro de un Dialog cerrado por defecto, mismo criterio que
 * crear-cliente-modal-cargador.tsx en POS.
 */
export const CategoriaForm = dynamic(
  () => import("./categoria-form").then((m) => m.CategoriaForm),
  { ssr: false },
);
