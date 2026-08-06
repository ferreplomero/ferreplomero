"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

interface MetricaCardProps {
  label: string;
  /** Valor numérico principal a animar (USD o conteo). */
  valor: number;
  /** Tasa Bs/USD — si se pasa, muestra el equivalente en Bs animado. */
  tasa?: number;
  /** Texto secundario estático (ticket promedio, margen %, etc.). */
  sub?: string;
  /** Icono ya renderizado desde el Server Component (ReactNode, no referencia de función). */
  iconEl: React.ReactNode;
  href: string;
  /** "usd" formatea con $ y 2 decimales; "entero" muestra el número redondeado. */
  formato?: "usd" | "entero";
  animationDelay?: number;
  locale: string;
}

function useContador(target: number, delay = 0) {
  const [valor, setValor] = useState(0);

  useEffect(() => {
    let raf: number;
    const DURATION = 700;
    const timer = setTimeout(() => {
      if (target === 0) {
        setValor(0);
        return;
      }
      const start = performance.now();
      function tick(now: number) {
        const t = Math.min((now - start) / DURATION, 1);
        const eased = 1 - (1 - t) ** 3;
        setValor(target * eased);
        if (t < 1) raf = requestAnimationFrame(tick);
        else setValor(target);
      }
      raf = requestAnimationFrame(tick);
    }, delay);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [target, delay]);

  return valor;
}

export function MetricaCard({
  label,
  valor,
  tasa,
  sub,
  iconEl,
  href,
  formato = "usd",
  animationDelay = 0,
  locale,
}: MetricaCardProps) {
  const animado = useContador(valor, animationDelay);

  const fmtUsd = (v: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);

  const fmtBs = (v: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "VES",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);

  const displayPrimario = formato === "entero" ? String(Math.round(animado)) : fmtUsd(animado);

  const displayBs = tasa !== undefined ? fmtBs(animado * tasa) : null;

  return (
    <Link
      href={href}
      className="animate-fade-up group motion-reduce:animate-none"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <article className="bg-surface border-border group-hover:border-accent-300 h-full rounded-xl border p-5 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md">
        <div className="mb-4">
          <span className="bg-accent-500/10 text-accent-600 inline-flex size-10 items-center justify-center rounded-xl">
            {iconEl}
          </span>
        </div>
        <div className="space-y-0.5">
          <p className="text-muted-foreground text-xs font-medium tracking-wide">{label}</p>
          <p className="text-heading font-display text-2xl font-bold tabular-nums leading-none">
            {displayPrimario}
          </p>
          {displayBs ? (
            <p className="text-muted-foreground text-sm font-medium tabular-nums">{displayBs}</p>
          ) : null}
          {sub ? <p className="text-muted-foreground pt-0.5 text-xs">{sub}</p> : null}
        </div>
      </article>
    </Link>
  );
}
