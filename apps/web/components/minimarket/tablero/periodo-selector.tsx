"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarRange } from "lucide-react";

export type PeriodoValue = "hoy" | "semana" | "mes";

interface PeriodoSelectorProps {
  basePath: string;
  periodoActivo: PeriodoValue;
  personalizado: boolean;
  desde: string;
  hasta: string;
}

const PERIODOS: { value: PeriodoValue; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mes" },
];

const PILDORA_BASE =
  "rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const PILDORA_ACTIVA = "bg-accent-500 text-white";
const PILDORA_INACTIVA = "border-border text-muted-foreground hover:bg-surface-2 border";

export function PeriodoSelector({
  basePath,
  periodoActivo,
  personalizado,
  desde,
  hasta,
}: PeriodoSelectorProps) {
  const [mostrarRango, setMostrarRango] = React.useState(personalizado);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PERIODOS.map((p) => {
        const activo = !personalizado && periodoActivo === p.value;
        return (
          <Link
            key={p.value}
            href={`${basePath}?periodo=${p.value}`}
            onClick={() => setMostrarRango(false)}
            aria-current={activo ? "true" : undefined}
            className={`${PILDORA_BASE} ${activo ? PILDORA_ACTIVA : PILDORA_INACTIVA}`}
          >
            {p.label}
          </Link>
        );
      })}

      <button
        type="button"
        onClick={() => setMostrarRango((v) => !v)}
        aria-expanded={mostrarRango}
        className={`${PILDORA_BASE} inline-flex items-center gap-1.5 ${
          personalizado ? PILDORA_ACTIVA : PILDORA_INACTIVA
        }`}
      >
        <CalendarRange className="size-3.5" aria-hidden />
        Rango personalizado
      </button>

      {mostrarRango ? (
        <form
          method="GET"
          action={basePath}
          className="flex flex-wrap items-center gap-2 rounded-full"
        >
          <label className="sr-only" htmlFor="periodo-desde">
            Desde
          </label>
          <input
            id="periodo-desde"
            type="date"
            name="desde"
            defaultValue={desde}
            required
            className="border-border bg-background text-heading focus-visible:ring-ring h-9 rounded-md border px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2"
          />
          <span className="text-muted-foreground text-sm" aria-hidden>
            →
          </span>
          <label className="sr-only" htmlFor="periodo-hasta">
            Hasta
          </label>
          <input
            id="periodo-hasta"
            type="date"
            name="hasta"
            defaultValue={hasta}
            required
            className="border-border bg-background text-heading focus-visible:ring-ring h-9 rounded-md border px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2"
          />
          <button
            type="submit"
            className="bg-accent-500 hover:bg-accent-600 focus-visible:ring-ring h-9 rounded-md px-3 text-sm font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2"
          >
            Aplicar
          </button>
        </form>
      ) : null}
    </div>
  );
}
