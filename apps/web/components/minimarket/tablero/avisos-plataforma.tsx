"use client";

import * as React from "react";
import { AlertTriangle, ChevronRight, Info, Megaphone, Sparkles, Wrench, X } from "lucide-react";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@arkiteq/ui";
import type { PlatformAvisoTipo } from "@arkiteq/db";
import type { AvisoVigente } from "@/lib/minimarket/data/avisos";
import { descartarAvisoPlataformaAction } from "@/app/(vertical)/minimarket/avisos-plataforma-actions";

interface Props {
  avisos: AvisoVigente[];
  animationDelay?: number;
}

const TIPO_ESTILO: Record<
  PlatformAvisoTipo,
  {
    icon: React.ReactNode;
    card: string;
    iconWrap: string;
    titulo: string;
    mensaje: string;
    verMas: string;
  }
> = {
  informativo: {
    icon: <Info className="size-5" aria-hidden />,
    card: "border-blue-200 bg-blue-50 border-l-blue-500 dark:border-blue-900/60 dark:bg-blue-950/40 dark:border-l-blue-400",
    iconWrap: "bg-blue-600 text-white dark:bg-blue-500 dark:text-blue-950",
    titulo: "text-blue-950 dark:text-blue-50",
    mensaje: "text-blue-800 dark:text-blue-200",
    verMas: "text-blue-700 dark:text-blue-300",
  },
  mejora: {
    icon: <Sparkles className="size-5" aria-hidden />,
    card: "border-emerald-200 bg-emerald-50 border-l-emerald-500 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:border-l-emerald-400",
    iconWrap: "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950",
    titulo: "text-emerald-950 dark:text-emerald-50",
    mensaje: "text-emerald-800 dark:text-emerald-200",
    verMas: "text-emerald-700 dark:text-emerald-300",
  },
  mantenimiento: {
    icon: <Wrench className="size-5" aria-hidden />,
    card: "border-amber-200 bg-amber-50 border-l-amber-500 dark:border-amber-900/60 dark:bg-amber-950/40 dark:border-l-amber-400",
    iconWrap: "bg-amber-600 text-white dark:bg-amber-500 dark:text-amber-950",
    titulo: "text-amber-950 dark:text-amber-50",
    mensaje: "text-amber-900 dark:text-amber-200",
    verMas: "text-amber-800 dark:text-amber-300",
  },
  importante: {
    icon: <AlertTriangle className="size-5" aria-hidden />,
    card: "border-red-200 bg-red-50 border-l-red-500 dark:border-red-900/60 dark:bg-red-950/40 dark:border-l-red-400",
    iconWrap: "bg-red-600 text-white dark:bg-red-500 dark:text-red-950",
    titulo: "text-red-950 dark:text-red-50",
    mensaje: "text-red-800 dark:text-red-200",
    verMas: "text-red-700 dark:text-red-300",
  },
};

function AvisoCard({ aviso, onDescartado }: { aviso: AvisoVigente; onDescartado: () => void }) {
  const [detalleAbierto, setDetalleAbierto] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const estilo = TIPO_ESTILO[aviso.tipo];

  function descartar() {
    if (pending) return;
    setPending(true);
    onDescartado();
    void descartarAvisoPlataformaAction(aviso.id);
  }

  return (
    <div
      className={`relative flex gap-3 rounded-xl border border-l-4 p-4 pr-10 shadow-sm transition-shadow duration-200 hover:shadow-md ${estilo.card}`}
    >
      <button
        type="button"
        onClick={descartar}
        aria-label="Descartar aviso"
        disabled={pending}
        className="absolute right-2 top-2 rounded-md p-1.5 text-black/40 transition-colors hover:bg-black/5 hover:text-black/70 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white/80"
      >
        <X className="size-4" />
      </button>

      <span
        className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl shadow-sm sm:size-11 ${estilo.iconWrap}`}
      >
        {estilo.icon}
      </span>

      <div className="min-w-0 flex-1">
        <p className={`text-sm font-bold sm:text-base ${estilo.titulo}`}>{aviso.titulo}</p>
        <p className={`mt-0.5 text-sm leading-snug ${estilo.mensaje}`}>{aviso.mensajeCorto}</p>
        <button
          type="button"
          onClick={() => setDetalleAbierto(true)}
          className={`mt-1.5 inline-flex items-center gap-0.5 text-xs font-bold hover:underline hover:underline-offset-2 ${estilo.verMas}`}
        >
          Ver más
          <ChevronRight className="size-3.5" aria-hidden />
        </button>
      </div>

      <Dialog open={detalleAbierto} onOpenChange={setDetalleAbierto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="text-accent-600 size-5" aria-hidden />
              {aviso.titulo}
            </DialogTitle>
          </DialogHeader>
          <p className="text-heading whitespace-pre-line text-sm leading-relaxed">
            {aviso.contenido}
          </p>
          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setDetalleAbierto(false)}>
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Avisos importantes publicados por el admin (panel /admin/avisos, tabla
 * `platform_avisos`) — no confundir con `AvisosBienvenida` (tips de
 * onboarding, otra tabla, otro flujo). El padre ya resuelve qué avisos están
 * activos, vigentes y no descartados (`listAvisosVigentes`); este componente
 * solo los muestra y gestiona el descarte optimista (oculta de inmediato,
 * igual criterio que `AvisosBienvenida`).
 */
export function AvisosPlataforma({ avisos, animationDelay = 0 }: Props) {
  const [ocultos, setOcultos] = React.useState<Set<string>>(new Set());

  const visibles = avisos.filter((a) => !ocultos.has(a.id));
  if (visibles.length === 0) return null;

  return (
    <div
      className="animate-fade-up space-y-2 motion-reduce:animate-none"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      {visibles.map((aviso) => (
        <AvisoCard
          key={aviso.id}
          aviso={aviso}
          onDescartado={() =>
            setOcultos((prev) => {
              const next = new Set(prev);
              next.add(aviso.id);
              return next;
            })
          }
        />
      ))}
    </div>
  );
}
