"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

export interface VentasChartProps {
  data: { fecha: string; totalUsd: number }[];
  locale: string;
}

function fmtDiaCorto(fecha: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${fecha}T00:00:00Z`));
}

function TooltipVentas({
  active,
  payload,
  locale,
}: {
  active?: boolean;
  payload?: { payload: { fecha: string; totalUsd: number } }[];
  locale: string;
}) {
  if (!active || !payload?.length) return null;
  const punto = payload[0]?.payload;
  if (!punto) return null;
  const usd = new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(
    punto.totalUsd,
  );
  return (
    <div className="border-border bg-surface rounded-lg border px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground">{fmtDiaCorto(punto.fecha, locale)}</p>
      <p className="text-heading font-display font-semibold tabular-nums">{usd}</p>
    </div>
  );
}

export function VentasChart({ data, locale }: VentasChartProps) {
  const reducedMotion = usePrefersReducedMotion();

  if (data.length === 0) {
    return (
      <div className="text-muted-foreground flex h-64 flex-col items-center justify-center gap-2 text-sm">
        <TrendingUp className="size-8 opacity-40" aria-hidden />
        Aún no hay ventas en este período.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="ventasFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-500)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--accent-500)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
        <XAxis
          dataKey="fecha"
          tickFormatter={(v: string) => fmtDiaCorto(v, locale)}
          tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={40}
          tickFormatter={(v: number) =>
            v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v))
          }
        />
        <Tooltip
          content={<TooltipVentas locale={locale} />}
          cursor={{ stroke: "var(--accent-400)" }}
        />
        <Area
          type="monotone"
          dataKey="totalUsd"
          stroke="var(--accent-500)"
          strokeWidth={2}
          fill="url(#ventasFill)"
          isAnimationActive={!reducedMotion}
          animationDuration={800}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
