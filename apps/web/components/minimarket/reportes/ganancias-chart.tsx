"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

export interface GananciasChartProps {
  ingresosUsd: number;
  costoMercanciaUsd: number;
  gastosTotalUsd: number;
  gananciaNetaUsd: number;
  locale: string;
}

interface Punto {
  nombre: string;
  valor: number;
  color: string;
}

function TooltipGanancias({
  active,
  payload,
  locale,
}: {
  active?: boolean;
  payload?: { payload: Punto }[];
  locale: string;
}) {
  if (!active || !payload?.length) return null;
  const punto = payload[0]?.payload;
  if (!punto) return null;
  const usd = new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(
    punto.valor,
  );
  return (
    <div className="border-border bg-surface max-w-[200px] rounded-lg border px-3 py-2 text-xs shadow-md">
      <p className="text-heading truncate font-medium">{punto.nombre}</p>
      <p className="text-heading font-display font-semibold tabular-nums">{usd}</p>
    </div>
  );
}

export function GananciasChart({
  ingresosUsd,
  costoMercanciaUsd,
  gastosTotalUsd,
  gananciaNetaUsd,
  locale,
}: GananciasChartProps) {
  const reducedMotion = usePrefersReducedMotion();

  const datos: Punto[] = [
    { nombre: "Ingresos", valor: ingresosUsd, color: "var(--accent-500)" },
    { nombre: "Costo mercancía", valor: costoMercanciaUsd, color: "#d97706" },
    { nombre: "Gastos", valor: gastosTotalUsd, color: "#dc2626" },
    {
      nombre: "Ganancia neta",
      valor: gananciaNetaUsd,
      color: gananciaNetaUsd >= 0 ? "#16a34a" : "#dc2626",
    },
  ];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={datos} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 0 }}>
        <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="4 4" />
        <XAxis
          type="number"
          tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) =>
            Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v))
          }
        />
        <YAxis
          type="category"
          dataKey="nombre"
          width={100}
          tick={{ fill: "var(--text-heading)", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          content={<TooltipGanancias locale={locale} />}
          cursor={{ fill: "var(--accent-50)" }}
        />
        <Bar
          dataKey="valor"
          radius={[0, 6, 6, 0]}
          isAnimationActive={!reducedMotion}
          animationDuration={800}
          maxBarSize={28}
        >
          {datos.map((d) => (
            <Cell key={d.nombre} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
