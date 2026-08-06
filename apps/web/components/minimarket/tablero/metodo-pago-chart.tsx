"use client";

import * as React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Wallet } from "lucide-react";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

export interface MetodoPagoChartProps {
  data: { metodo: string; label: string; valorUsd: number }[];
  locale: string;
}

/** Paleta categórica derivada de los tokens del design system (consistente claro/oscuro). */
const PALETA = [
  "var(--accent-500)",
  "var(--brand-500)",
  "var(--success)",
  "var(--warning)",
  "var(--danger)",
  "var(--accent-600)",
  "var(--brand-600)",
];

function TooltipMetodo({
  active,
  payload,
  locale,
  totalUsd,
}: {
  active?: boolean;
  payload?: { payload: { label: string; valorUsd: number } }[];
  locale: string;
  totalUsd: number;
}) {
  if (!active || !payload?.length) return null;
  const punto = payload[0]?.payload;
  if (!punto) return null;
  const usd = new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(
    punto.valorUsd,
  );
  const pct = totalUsd > 0 ? ((punto.valorUsd / totalUsd) * 100).toFixed(1) : "0";
  return (
    <div className="border-border bg-surface rounded-lg border px-3 py-2 text-xs shadow-md">
      <p className="text-heading font-medium">{punto.label}</p>
      <p className="text-heading font-display font-semibold tabular-nums">{usd}</p>
      <p className="text-muted-foreground">{pct}% del período</p>
    </div>
  );
}

export function MetodoPagoChart({ data, locale }: MetodoPagoChartProps) {
  const reducedMotion = usePrefersReducedMotion();
  const totalUsd = data.reduce((s, d) => s + d.valorUsd, 0);

  if (data.length === 0 || totalUsd <= 0) {
    return (
      <div className="text-muted-foreground flex h-56 flex-col items-center justify-center gap-2 text-sm">
        <Wallet className="size-8 opacity-40" aria-hidden />
        Aún no hay pagos registrados en este período.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <ResponsiveContainer width="100%" height={200} className="sm:max-w-[200px]">
        <PieChart>
          <Pie
            data={data}
            dataKey="valorUsd"
            nameKey="label"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
            isAnimationActive={!reducedMotion}
            animationDuration={800}
          >
            {data.map((d, i) => (
              <Cell key={d.metodo} fill={PALETA[i % PALETA.length]} stroke="var(--surface)" />
            ))}
          </Pie>
          <Tooltip content={<TooltipMetodo locale={locale} totalUsd={totalUsd} />} />
        </PieChart>
      </ResponsiveContainer>

      <ul className="min-w-0 flex-1 space-y-2">
        {data.map((d, i) => {
          const pct = totalUsd > 0 ? (d.valorUsd / totalUsd) * 100 : 0;
          return (
            <li key={d.metodo} className="flex items-center gap-2 text-sm">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: PALETA[i % PALETA.length] }}
                aria-hidden
              />
              <span className="text-heading min-w-0 flex-1 truncate">{d.label}</span>
              <span className="text-muted-foreground shrink-0 tabular-nums">{pct.toFixed(0)}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
