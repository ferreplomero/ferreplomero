"use client";

import dynamic from "next/dynamic";

/**
 * Carga diferida (ssr:false) del donut de métodos de pago — usa `recharts`,
 * una librería pesada que solo hace falta en el navegador (SVG). El Tablero
 * es un Server Component; este wrapper cliente es el punto donde se puede
 * usar `ssr:false` sin perder los props que la página ya resuelve por props.
 */
export const MetodoPagoChart = dynamic(
  () => import("./metodo-pago-chart").then((m) => m.MetodoPagoChart),
  {
    ssr: false,
    loading: () => <div className="bg-surface-2 h-56 animate-pulse rounded-lg" />,
  },
);
