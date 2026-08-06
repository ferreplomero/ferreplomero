"use client";

import * as React from "react";
import { Input, Label, cn } from "@arkiteq/ui";
import { formatMaskedAmount, parseMaskedInput } from "@/lib/minimarket/currency-mask";

type Moneda = "USD" | "VES";

const dosDecimales = (n: number) => (Math.round(n * 100) / 100).toString();

const formatoUsd = (v: number) =>
  new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD" }).format(v);
const formatoBs = (v: number) =>
  new Intl.NumberFormat("es-VE", { style: "currency", currency: "VES" }).format(v);

interface CampoMontoDualProps {
  id: string;
  /** Etiqueta visible. Se omite en modo `compact` (para filas de tabla). */
  label?: React.ReactNode;
  /** Nombre del campo oculto que lleva el valor real en USD al FormData. */
  name: string;
  /** Valor canónico en USD, formato limpio ("1234.56" o ""). El sistema SIEMPRE guarda en USD. */
  valorUsd: string;
  onChangeUsd: (usd: string) => void;
  /** Tasa BCV vigente (USD -> Bs). Si es `null`, el toggle a Bs se deshabilita. */
  tasa: number | null;
  required?: boolean;
  placeholder?: string;
  ariaInvalid?: boolean;
  ariaDescribedby?: string;
  className?: string;
  /** Layout reducido para filas de tabla/lista (sin etiqueta ni línea de equivalencia aparte). */
  compact?: boolean;
}

/**
 * Campo de monto con selector USD/Bs: el usuario escribe en la moneda que
 * prefiera y ve el equivalente en la otra debajo, pero el valor que viaja al
 * formulario (`name`, via input oculto) SIEMPRE es el equivalente en USD —
 * la base del sistema (CLAUDE.md: "Moneda, impuestos... nunca incrustados en
 * la lógica de negocio").
 *
 * El texto mostrado se deriva de `valorUsd` en cada render, EXCEPTO mientras
 * el usuario escribe en modo Bs: ahí se preserva el texto tal cual lo tecleó
 * (via `ultimoUsdEmitidoRef`) para no pelear con el redondeo a centavos en
 * cada tecla (convertir Bs->USD->Bs de vuelta puede mover el último dígito).
 * Un cambio EXTERNO de `valorUsd` (ej. el margen de producto recalculando el
 * precio de venta) sí se refleja de inmediato, incluso en modo Bs.
 */
export function CampoMontoDual({
  id,
  label,
  name,
  valorUsd,
  onChangeUsd,
  tasa,
  required,
  placeholder = "0,00",
  ariaInvalid,
  ariaDescribedby,
  className,
  compact,
}: CampoMontoDualProps) {
  const [moneda, setMoneda] = React.useState<Moneda>("USD");
  const [textoCrudo, setTextoCrudo] = React.useState(valorUsd);
  const ultimoUsdEmitidoRef = React.useRef(valorUsd);

  React.useEffect(() => {
    if (valorUsd === ultimoUsdEmitidoRef.current) return;
    ultimoUsdEmitidoRef.current = valorUsd;
    setTextoCrudo(
      moneda === "USD" ? valorUsd : tasa && valorUsd ? dosDecimales(Number(valorUsd) * tasa) : "",
    );
    // Solo reacciona a cambios EXTERNOS de valorUsd; moneda/tasa se leen al vuelo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorUsd]);

  function cambiarMoneda(nueva: Moneda) {
    if (nueva === moneda) return;
    setTextoCrudo(
      nueva === "USD" ? valorUsd : tasa && valorUsd ? dosDecimales(Number(valorUsd) * tasa) : "",
    );
    setMoneda(nueva);
  }

  function onInput(raw: string) {
    const limpio = parseMaskedInput(raw);
    setTextoCrudo(limpio);
    const nuevoUsd =
      moneda === "USD"
        ? limpio
        : tasa && tasa > 0 && limpio
          ? dosDecimales(Number(limpio) / tasa)
          : "";
    ultimoUsdEmitidoRef.current = nuevoUsd;
    onChangeUsd(nuevoUsd);
  }

  const numUsd = Number(valorUsd);
  const tieneValor = valorUsd !== "" && Number.isFinite(numUsd) && numUsd > 0;
  const equivalente =
    tieneValor && tasa
      ? moneda === "USD"
        ? `≈ ${formatoBs(numUsd * tasa)}`
        : `≈ ${formatoUsd(numUsd)}`
      : null;

  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <div className="flex items-center justify-between gap-2">
        {label ? <Label htmlFor={id}>{label}</Label> : <span />}
        <div
          role="group"
          aria-label="Moneda de este monto"
          className="border-border bg-surface-2/60 inline-flex shrink-0 rounded-md border p-0.5 text-[11px] font-medium"
        >
          <button
            type="button"
            onClick={() => cambiarMoneda("USD")}
            aria-pressed={moneda === "USD"}
            className={cn(
              "rounded px-2 py-0.5 transition-colors",
              moneda === "USD"
                ? "bg-accent-500 text-white"
                : "text-muted-foreground hover:text-heading",
            )}
          >
            USD
          </button>
          <button
            type="button"
            onClick={() => cambiarMoneda("VES")}
            disabled={!tasa}
            aria-pressed={moneda === "VES"}
            title={tasa ? undefined : "Sin tasa registrada"}
            className={cn(
              "rounded px-2 py-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              moneda === "VES"
                ? "bg-accent-500 text-white"
                : "text-muted-foreground hover:text-heading",
            )}
          >
            Bs
          </button>
        </div>
      </div>

      <input type="hidden" name={name} value={valorUsd || "0"} />
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        value={formatMaskedAmount(textoCrudo)}
        onChange={(e) => onInput(e.target.value)}
        placeholder={placeholder}
        className={cn("text-right tabular-nums", className)}
        required={required}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedby}
      />

      {equivalente ? (
        <p className="text-muted-foreground text-xs tabular-nums">{equivalente}</p>
      ) : !tasa && !compact ? (
        <p className="text-muted-foreground text-xs">
          Sin tasa registrada — no se puede convertir a Bs.
        </p>
      ) : null}
    </div>
  );
}
