"use client";

import dynamic from "next/dynamic";

/**
 * Carga diferida (ssr:false) del gráfico de ganancias — usa `recharts`, una
 * librería pesada que solo hace falta en el navegador (SVG). Mismo patrón que
 * ventas-chart-cargador.tsx en Tablero.
 */
export const GananciasChart = dynamic(
  () => import("./ganancias-chart").then((m) => m.GananciasChart),
  {
    ssr: false,
    loading: () => <div className="bg-surface-2 h-[200px] animate-pulse rounded-lg" />,
  },
);
