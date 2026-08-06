"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "../lib/cn";

export interface CopyFieldProps {
  label: string;
  value: string;
  className?: string;
}

/** Fila "etiqueta: valor" con botón de copiar al portapapeles y confirmación visual/accesible. */
export function CopyField({ label, value, className }: CopyFieldProps) {
  const [copiado, setCopiado] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(value);
      setCopiado(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles (poco común): no rompe la UI, solo no confirma.
    }
  }

  return (
    <div
      className={cn(
        "border-border bg-surface-2 flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <p className="text-heading truncate text-sm font-medium">{value}</p>
      </div>
      <button
        type="button"
        onClick={copiar}
        aria-label={`Copiar ${label}: ${value}`}
        className={cn(
          "focus-visible:ring-ring inline-flex size-10 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2",
          copiado
            ? "bg-success/15 text-success"
            : "text-muted-foreground hover:bg-surface hover:text-heading",
        )}
      >
        {copiado ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <Copy className="size-4" aria-hidden />
        )}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {copiado ? "Copiado" : ""}
      </span>
    </div>
  );
}
