import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";

interface TasaTableroProps {
  tasa: { valor: number; fuente: string; fecha: string } | null;
  animationDelay?: number;
  locale: string;
}

function tiempoDesde(fechaStr: string): string {
  const diffMs = Date.now() - new Date(fechaStr).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 2) return "hace un momento";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} día${Math.floor(hrs / 24) !== 1 ? "s" : ""}`;
}

// `tasa.fuente` es el origen de la fila (mm_tasa_fuente: auto/manual), no la
// fuente configurada (bcv/euro) — esta solo distingue esas dos posibilidades.
const FUENTE_LABEL: Record<string, string> = {
  manual: "Personalizado / Digital",
  auto: "Automática",
};

export function TasaTablero({ tasa, animationDelay = 0, locale }: TasaTableroProps) {
  const fmtBs = (v: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "VES",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);

  return (
    <div
      className="animate-fade-up motion-reduce:animate-none"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <div className="bg-surface border-border rounded-xl border p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="bg-accent-500/10 text-accent-600 inline-flex size-12 shrink-0 items-center justify-center rounded-xl">
              <RefreshCw className="size-6" aria-hidden />
            </span>
            <div>
              <p className="text-muted-foreground text-xs font-medium">Tasa del día</p>
              {tasa ? (
                <>
                  <p className="font-display text-heading text-2xl font-bold tabular-nums">
                    {fmtBs(tasa.valor)}{" "}
                    <span className="text-muted-foreground text-base font-normal">/ USD</span>
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    Fuente: {FUENTE_LABEL[tasa.fuente] ?? tasa.fuente}
                    {" · "}
                    {tiempoDesde(tasa.fecha)}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-display text-heading text-2xl font-bold">
                    Sin tasa registrada
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    Registra la tasa del día para cobrar en bolívares.
                  </p>
                </>
              )}
            </div>
          </div>
          <Link
            href="/minimarket/tasa"
            className="bg-accent-500 hover:bg-accent-600 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            {tasa ? "Actualizar tasa" : "Registrar tasa"}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
