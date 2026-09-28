"use client";

import * as React from "react";
import { Input, Label, cn } from "@arkiteq/ui";
import { formatMaskedAmount, parseMaskedInput } from "@/lib/minimarket/currency-mask";
import { obtenerTasaParaFecha } from "@/app/(vertical)/minimarket/reportes/tasa-fecha-action";

const formatoUsd = (v: number) =>
  new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD" }).format(v);
const formatoBs = (v: number) =>
  new Intl.NumberFormat("es-VE", { style: "currency", currency: "VES" }).format(v);

interface CampoMontoNativoProps {
  id: string;
  name: string;
  label: React.ReactNode;
  /** Moneda NATIVA fija del método elegido (USD para efectivo_usd/Zelle, Bs
   * para el resto) — el monto se teclea EXACTO en esa moneda, sin toggle ni
   * conversión de ida y vuelta (CLAUDE.md punto 6). */
  moneda: "USD" | "VES";
  value: string;
  onChange: (v: string) => void;
  /** Fecha elegida para el movimiento — dispara la consulta de la tasa de
   * ESE día (histórica si no es hoy) para mostrar el equivalente real. */
  fecha: string;
  hoy: string;
  /** Tasa vigente ya conocida por el servidor al cargar la página — evita un
   * round-trip cuando la fecha es hoy. */
  tasaHoy: number | null;
  required?: boolean;
  className?: string;
}

/**
 * Campo de monto en la moneda NATIVA del método de pago elegido (a
 * diferencia de `CampoMontoDual`, no hay toggle: la moneda la fija el método,
 * así el valor tecleado queda exacto en Caja/Bancos). Debajo se muestra un
 * equivalente de REFERENCIA en la otra moneda, con la tasa de la fecha
 * elegida (histórica si es una fecha pasada) — nunca se usa para reconvertir
 * el monto que se guarda, solo es informativo para el usuario.
 */
export function CampoMontoNativo({
  id,
  name,
  label,
  moneda,
  value,
  onChange,
  fecha,
  hoy,
  tasaHoy,
  required,
  className,
}: CampoMontoNativoProps) {
  const esHoy = fecha >= hoy;
  const [tasaFecha, setTasaFecha] = React.useState<{ valor: number; fuente: string } | null>(
    esHoy && tasaHoy ? { valor: tasaHoy, fuente: "" } : null,
  );
  const [cargandoTasa, setCargandoTasa] = React.useState(false);

  React.useEffect(() => {
    if (esHoy) {
      setTasaFecha(tasaHoy ? { valor: tasaHoy, fuente: "" } : null);
      return;
    }
    let cancelado = false;
    setCargandoTasa(true);
    obtenerTasaParaFecha(fecha)
      .then((res) => {
        if (!cancelado) setTasaFecha(res);
      })
      .finally(() => {
        if (!cancelado) setCargandoTasa(false);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, esHoy]);

  const numValor = Number(value);
  const tieneValor = value !== "" && Number.isFinite(numValor) && numValor > 0;
  const equivalente =
    tieneValor && tasaFecha
      ? moneda === "USD"
        ? `≈ ${formatoBs(numValor * tasaFecha.valor)}`
        : `≈ ${formatoUsd(numValor / tasaFecha.valor)}`
      : null;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <input type="hidden" name={name} value={value || "0"} />
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        value={formatMaskedAmount(value)}
        onChange={(e) => onChange(parseMaskedInput(e.target.value))}
        placeholder="0,00"
        className={cn("text-right tabular-nums", className)}
        required={required}
      />
      {!esHoy ? (
        <p className="text-muted-foreground text-xs">
          {cargandoTasa
            ? "Buscando la tasa de esa fecha…"
            : tasaFecha
              ? `Tasa de esa fecha: ${tasaFecha.valor.toFixed(2)} Bs/USD${tasaFecha.fuente ? ` (${tasaFecha.fuente})` : ""}.`
              : "No hay tasa registrada para esa fecha."}
        </p>
      ) : null}
      {equivalente ? (
        <p className="text-muted-foreground text-xs tabular-nums">{equivalente}</p>
      ) : null}
    </div>
  );
}
