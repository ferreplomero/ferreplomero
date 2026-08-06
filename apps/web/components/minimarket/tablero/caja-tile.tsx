import Link from "next/link";
import { Wallet } from "lucide-react";

interface CajaTileProps {
  abierta: boolean;
  esperadoUsd: number;
  esperadoBs: number;
  locale: string;
  animationDelay?: number;
}

/**
 * Tarjeta de efectivo en caja — a diferencia de `MetricaCard`, aquí el monto
 * en Bs es un saldo REAL propio (derivado del fondo inicial + movimientos en
 * cada moneda), no un equivalente calculado con la tasa del día.
 */
export function CajaTile({
  abierta,
  esperadoUsd,
  esperadoBs,
  locale,
  animationDelay = 0,
}: CajaTileProps) {
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

  return (
    <Link
      href="/minimarket/caja"
      className="animate-fade-up group motion-reduce:animate-none"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <article className="bg-surface border-border group-hover:border-accent-300 h-full rounded-xl border p-5 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md">
        <div className="mb-4">
          <span className="bg-accent-500/10 text-accent-600 inline-flex size-10 items-center justify-center rounded-xl">
            <Wallet className="size-5" aria-hidden />
          </span>
        </div>
        <div className="space-y-0.5">
          <p className="text-muted-foreground text-xs font-medium tracking-wide">
            Efectivo en caja
          </p>
          {abierta ? (
            <>
              <p className="text-heading font-display text-2xl font-bold tabular-nums leading-none">
                {fmtUsd(esperadoUsd)}
              </p>
              <p className="text-muted-foreground text-sm font-medium tabular-nums">
                {fmtBs(esperadoBs)}
              </p>
              <p className="text-success pt-0.5 text-xs">Turno abierto</p>
            </>
          ) : (
            <>
              <p className="text-heading font-display text-2xl font-bold leading-none">—</p>
              <p className="text-warning pt-0.5 text-xs">Sin turno abierto</p>
            </>
          )}
        </div>
      </article>
    </Link>
  );
}
