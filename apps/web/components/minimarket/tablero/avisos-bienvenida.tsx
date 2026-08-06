"use client";

import * as React from "react";
import Link from "next/link";
import { CreditCard, Percent, Wallet, X } from "lucide-react";
import {
  descartarAvisoAction,
  type TipoAvisoBienvenida,
} from "@/app/(vertical)/minimarket/actions";

interface Props {
  mostrarCaja: boolean;
  mostrarFiscal: boolean;
  mostrarPagos: boolean;
  animationDelay?: number;
}

interface AvisoCardProps {
  tipo: TipoAvisoBienvenida;
  icon: React.ReactNode;
  titulo: string;
  texto: string;
  ctaLabel: string;
  ctaHref: string;
  mostrarIgnorar: boolean;
  onDescartado: () => void;
}

function AvisoCard({
  tipo,
  icon,
  titulo,
  texto,
  ctaLabel,
  ctaHref,
  mostrarIgnorar,
  onDescartado,
}: AvisoCardProps) {
  const [pending, setPending] = React.useState(false);

  function descartar() {
    if (pending) return;
    setPending(true);
    onDescartado();
    void descartarAvisoAction(tipo);
  }

  return (
    <div className="border-border bg-surface relative flex flex-col gap-3 rounded-xl border p-4 pr-10 sm:flex-row sm:items-center">
      <button
        type="button"
        onClick={descartar}
        aria-label="Descartar aviso"
        disabled={pending}
        className="text-muted-foreground hover:text-heading hover:bg-surface-2 absolute right-2 top-2 rounded-md p-1.5 transition-colors"
      >
        <X className="size-4" />
      </button>

      <span className="bg-accent-500/10 text-accent-600 inline-flex size-10 shrink-0 items-center justify-center rounded-xl">
        {icon}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-heading text-sm font-medium">{titulo}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">{texto}</p>
      </div>

      <div className="flex shrink-0 items-center gap-3 pt-1 sm:pt-0">
        {mostrarIgnorar ? (
          <button
            type="button"
            onClick={descartar}
            disabled={pending}
            className="text-muted-foreground hover:text-heading text-xs font-medium transition-colors"
          >
            Ignorar
          </button>
        ) : null}
        <Link
          href={ctaHref}
          className="bg-accent-500 hover:bg-accent-600 shrink-0 rounded-lg px-3.5 py-2 text-center text-xs font-semibold text-white transition-colors"
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}

/**
 * Avisos de bienvenida del tablero: guía, no bloquea. Cada uno se puede
 * atender (CTA) o descartar (X / "Ignorar") — una vez descartado se oculta
 * de inmediato (optimista) y queda marcado en `mm_config_negocio` para no
 * volver a molestar en próximos ingresos (`descartarAvisoAction`). El padre
 * decide SI corresponde mostrar cada uno (permiso de módulo + estado real
 * del negocio), este componente solo los renderiza y gestiona su descarte.
 */
export function AvisosBienvenida({
  mostrarCaja,
  mostrarFiscal,
  mostrarPagos,
  animationDelay = 0,
}: Props) {
  const [ocultos, setOcultos] = React.useState<Set<TipoAvisoBienvenida>>(new Set());

  function ocultar(tipo: TipoAvisoBienvenida) {
    setOcultos((prev) => {
      const next = new Set(prev);
      next.add(tipo);
      return next;
    });
  }

  const verCaja = mostrarCaja && !ocultos.has("caja");
  const verFiscal = mostrarFiscal && !ocultos.has("fiscal");
  const verPagos = mostrarPagos && !ocultos.has("pagos");

  if (!verCaja && !verFiscal && !verPagos) return null;

  return (
    <div
      className="animate-fade-up space-y-2 motion-reduce:animate-none"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      {verCaja ? (
        <AvisoCard
          tipo="caja"
          icon={<Wallet className="size-5" aria-hidden />}
          titulo="Tu caja se abrió con $0,00 y Bs 0,00"
          texto="Si inicias el día con efectivo en caja, agrégalo aquí para que el arqueo cuadre."
          ctaLabel="Agregar monto"
          ctaHref="/minimarket/caja"
          mostrarIgnorar={false}
          onDescartado={() => ocultar("caja")}
        />
      ) : null}

      {verFiscal ? (
        <AvisoCard
          tipo="fiscal"
          icon={<Percent className="size-5" aria-hidden />}
          titulo="Tus impuestos (IVA e IGTF) están desactivados"
          texto="Si tu negocio los cobra, actívalos aquí. Si no, puedes ignorar este aviso."
          ctaLabel="Configurar"
          ctaHref="/minimarket/configuracion"
          mostrarIgnorar
          onDescartado={() => ocultar("fiscal")}
        />
      ) : null}

      {verPagos ? (
        <AvisoCard
          tipo="pagos"
          icon={<CreditCard className="size-5" aria-hidden />}
          titulo="Agrega tus medios de pago"
          texto="Pago móvil, transferencia o Zelle: comparte tus datos con los clientes al cobrar."
          ctaLabel="Agregar medios de pago"
          ctaHref="/minimarket/configuracion"
          mostrarIgnorar
          onDescartado={() => ocultar("pagos")}
        />
      ) : null}
    </div>
  );
}
