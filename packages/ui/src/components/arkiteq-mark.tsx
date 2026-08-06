import * as React from "react";
import { cn } from "../lib/cn";

export interface ArkiteqMarkProps extends React.SVGProps<SVGSVGElement> {
  /** Muestra el isotipo junto al nombre "Arkiteq Data". */
  withWordmark?: boolean;
}

/**
 * Isotipo de Arkiteq Data: un nodo central conectado a tres satélites,
 * evocando arquitectura de datos / grafo. Hereda el color vía `currentColor`.
 */
function ArkiteqMark({ withWordmark = false, className, ...props }: ArkiteqMarkProps) {
  if (withWordmark) {
    return (
      <span className={cn("inline-flex items-center gap-2.5", className)}>
        <ArkiteqMark className="text-brand-500 size-7" {...props} />
        <span className="font-display text-heading text-lg font-semibold tracking-tight">
          Arkiteq<span className="text-brand-500"> Data</span>
        </span>
      </span>
    );
  }

  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Arkiteq Data"
      className={cn("text-brand-500", className)}
      {...props}
    >
      <path
        d="M16 6.5 7 26h4.2l1.7-4h6.2l1.7 4H25L16 6.5Zm-1.7 12L16 14l1.7 4.5h-3.4Z"
        fill="currentColor"
      />
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.55">
        <path d="M16 6.5 6 11" />
        <path d="M16 6.5 26 11" />
      </g>
      <g fill="currentColor">
        <circle cx="6" cy="11" r="2.1" />
        <circle cx="26" cy="11" r="2.1" />
        <circle cx="16" cy="6.5" r="2.4" />
      </g>
    </svg>
  );
}

export { ArkiteqMark };
