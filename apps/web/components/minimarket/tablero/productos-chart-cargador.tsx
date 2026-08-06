"use client";

import dynamic from "next/dynamic";

/**
 * Carga diferida (ssr:false) del gráfico de productos más vendidos — usa
 * `recharts`, una librería pesada que solo hace falta en el navegador (SVG).
 * El Tablero es un Server Component; este wrapper cliente es el punto donde
 * se puede usar `ssr:false` sin perder los props que la página ya resuelve
 * por props.
 */
export const ProductosChart = dynamic(
  () => import("./productos-chart").then((m) => m.ProductosChart),
  {
    ssr: false,
    loading: () => <div className="bg-surface-2 h-56 animate-pulse rounded-lg" />,
  },
);
