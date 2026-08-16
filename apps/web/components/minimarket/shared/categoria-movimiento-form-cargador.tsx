"use client";

import dynamic from "next/dynamic";

/**
 * Carga diferida (ssr:false) del formulario de categoría de gasto/otro-
 * ingreso — solo se muestra dentro de un Dialog cerrado por defecto, mismo
 * criterio que categoria-form-cargador.tsx (Inventario).
 */
export const CategoriaMovimientoForm = dynamic(
  () => import("./categoria-movimiento-form").then((m) => m.CategoriaMovimientoForm),
  { ssr: false },
);
