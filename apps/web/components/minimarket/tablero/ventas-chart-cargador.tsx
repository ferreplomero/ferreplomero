"use client";

import dynamic from "next/dynamic";

/**
 * Carga diferida (ssr:false) del gráfico de ventas — usa `recharts`, una
 * librería pesada que solo hace falta en el navegador (SVG). El Tablero es
 * un Server Component; este wrapper cliente es el punto donde se puede usar
 * `ssr:false` sin perder los props que la página ya resuelve por props.
 */
export const VentasChart = dynamic(() => import("./ventas-chart").then((m) => m.VentasChart), {
  ssr: false,
  loading: () => <div className="bg-surface-2 h-64 animate-pulse rounded-lg" />,
});
