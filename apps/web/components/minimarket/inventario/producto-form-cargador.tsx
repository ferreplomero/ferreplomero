"use client";

import dynamic from "next/dynamic";

/**
 * Carga diferida (ssr:false) del formulario de producto — solo se muestra
 * dentro de un Dialog cerrado por defecto, mismo criterio que
 * crear-cliente-modal-cargador.tsx en POS.
 */
export const ProductoForm = dynamic(() => import("./producto-form").then((m) => m.ProductoForm), {
  ssr: false,
});
