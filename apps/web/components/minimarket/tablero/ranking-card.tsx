import * as React from "react";
import Link from "next/link";

export interface RankingCardRow {
  key: string;
  /** Texto principal de la fila (nombre de producto/cliente). */
  titulo: string;
  /** Texto secundario opcional (ej. "12 unidades", "3 compras"). */
  subtitulo?: string;
  /** Valor a la derecha, ya formateado. */
  valor: string;
  /** Segundo valor a la derecha, más pequeño (ej. equivalente en Bs). */
  valorSecundario?: string;
  /** Tono del valor principal — "danger" para deudas/alertas, por ejemplo. */
  tono?: "default" | "danger" | "warning";
}

interface RankingCardProps {
  titulo: string;
  icono: React.ReactNode;
  filas: RankingCardRow[];
  href: string;
  hrefLabel?: string;
  vacioTexto: string;
  animationDelay?: number;
}

/** Tarjeta de "top 5" reutilizable para las secciones de resumen del Tablero. */
export function RankingCard({
  titulo,
  icono,
  filas,
  href,
  hrefLabel = "Ver todo",
  vacioTexto,
  animationDelay = 0,
}: RankingCardProps) {
  return (
    <article
      className="bg-surface border-border animate-fade-up flex h-full flex-col rounded-xl border p-5 motion-reduce:animate-none"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span className="bg-accent-500/10 text-accent-600 inline-flex size-8 shrink-0 items-center justify-center rounded-lg">
          {icono}
        </span>
        <h3 className="text-heading text-sm font-semibold">{titulo}</h3>
      </div>

      {filas.length === 0 ? (
        <p className="text-muted-foreground flex flex-1 items-center justify-center py-6 text-center text-sm">
          {vacioTexto}
        </p>
      ) : (
        <ul className="flex-1 space-y-2.5">
          {filas.map((f, i) => (
            <li key={f.key} className="flex items-center gap-3">
              <span className="text-muted-foreground w-4 shrink-0 text-xs font-medium tabular-nums">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-heading truncate text-sm font-medium">{f.titulo}</p>
                {f.subtitulo ? (
                  <p className="text-muted-foreground truncate text-xs">{f.subtitulo}</p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={`text-sm font-semibold tabular-nums ${
                    f.tono === "danger"
                      ? "text-danger"
                      : f.tono === "warning"
                        ? "text-warning"
                        : "text-heading"
                  }`}
                >
                  {f.valor}
                </p>
                {f.valorSecundario ? (
                  <p className="text-muted-foreground text-xs tabular-nums">{f.valorSecundario}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Link
        href={href}
        className="text-accent-600 hover:text-accent-700 mt-4 inline-flex items-center gap-1 text-xs font-medium"
      >
        {hrefLabel} →
      </Link>
    </article>
  );
}
