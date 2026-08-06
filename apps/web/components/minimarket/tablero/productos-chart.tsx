"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Package } from "lucide-react";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

export interface ProductosChartProps {
  data: { nombre: string; ingresoUsd: number }[];
  locale: string;
}

function TooltipProducto({
  active,
  payload,
  locale,
}: {
  active?: boolean;
  payload?: { payload: { nombre: string; ingresoUsd: number } }[];
  locale: string;
}) {
  if (!active || !payload?.length) return null;
  const punto = payload[0]?.payload;
  if (!punto) return null;
  const usd = new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(
    punto.ingresoUsd,
  );
  return (
    <div className="border-border bg-surface max-w-[200px] rounded-lg border px-3 py-2 text-xs shadow-md">
      <p className="text-heading truncate font-medium">{punto.nombre}</p>
      <p className="text-heading font-display font-semibold tabular-nums">{usd}</p>
    </div>
  );
}

export function ProductosChart({ data, locale }: ProductosChartProps) {
  const reducedMotion = usePrefersReducedMotion();

  if (data.length === 0) {
    return (
      <div className="text-muted-foreground flex h-56 flex-col items-center justify-center gap-2 text-sm">
        <Package className="size-8 opacity-40" aria-hidden />
        Aún no hay productos vendidos en este período.
      </div>
    );
  }

  // Recharts pinta de arriba hacia abajo; se invierte para que el #1 quede arriba.
  const datos = [...data].reverse();

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, datos.length * 40)}>
      <BarChart data={datos} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="4 4" />
        <XAxis
          type="number"
          tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) =>
            v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v))
          }
        />
        <YAxis
          type="category"
          dataKey="nombre"
          width={110}
          tick={{ fill: "var(--text-heading)", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
        />
        <Tooltip
          content={<TooltipProducto locale={locale} />}
          cursor={{ fill: "var(--accent-50)" }}
        />
        <Bar
          dataKey="ingresoUsd"
          fill="var(--accent-500)"
          radius={[0, 6, 6, 0]}
          isAnimationActive={!reducedMotion}
          animationDuration={800}
          maxBarSize={22}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
