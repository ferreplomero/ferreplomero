"use client";

import * as React from "react";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@arkiteq/ui";
import { marcarAvisoSaldosVistoAction } from "@/app/(vertical)/minimarket/saldos-iniciales-aviso-actions";

export interface SaldosInicialesModalProps {
  /** true = el servidor determinó que corresponde mostrarlo ahora (ver `MinimarketLayout`). */
  open: boolean;
  /** "nuevo" = tenant creado después de la migración 0106 (aún no pasó por este paso).
   * "existente" = tenant que ya operaba antes — mismo modal, copy distinto. */
  tipo: "nuevo" | "existente";
  nombreNegocio: string;
}

const COPY: Record<
  SaldosInicialesModalProps["tipo"],
  { titulo: string; descripcion: (nombre: string) => React.ReactNode }
> = {
  nuevo: {
    titulo: "Antes de empezar, configura tus medios de pago",
    descripcion: (nombre) => (
      <>
        Para que <span className="text-heading font-medium">{nombre}</span> arranque con cifras
        reales, dinos cómo cobras (efectivo, pago móvil, transferencia, Zelle, tarjeta o Cashea) y
        cuánto dinero tienes ahora en cada uno. Toma menos de un minuto.
      </>
    ),
  },
  existente: {
    titulo: "Agrega el saldo actual de tus cuentas y tu caja",
    descripcion: (nombre) => (
      <>
        Para que los reportes de <span className="text-heading font-medium">{nombre}</span> (Bancos,
        Caja y Finanzas) reflejen la realidad, declara cuánto dinero tienes ahora en cada medio de
        pago que uses. Es información de una sola vez.
      </>
    ),
  },
};

/**
 * Modal centrado y DESCARTABLE que se monta sobre cualquier página del
 * vertical (prop `open` calculado en el servidor, montado en
 * `VerticalShell`) — cerrarlo
 * ("Ahora no", la X, click afuera o Escape) es una salida válida: marca
 * `medios_saldos_aviso_visto_en` y no vuelve a aparecer, sin bloquear el uso
 * del sistema (Regla Crítica #1 — bloqueo suave, no candado). El aviso NO
 * descartable que insiste de verdad vive aparte, en el tablero y en Bancos,
 * hasta que la configuración se complete de verdad.
 */
export function SaldosInicialesModal({ open, tipo, nombreNegocio }: SaldosInicialesModalProps) {
  const [oculto, setOculto] = React.useState(false);
  const copy = COPY[tipo];

  function descartar() {
    if (oculto) return;
    setOculto(true);
    void marcarAvisoSaldosVistoAction();
  }

  return (
    <Dialog
      open={open && !oculto}
      onOpenChange={(next) => {
        if (!next) descartar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <span className="bg-accent-500/10 text-accent-600 mb-2 inline-flex size-12 items-center justify-center rounded-2xl">
            <CreditCard className="size-6" aria-hidden />
          </span>
          <DialogTitle>{copy.titulo}</DialogTitle>
          <DialogDescription>{copy.descripcion(nombreNegocio)}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={descartar}>
            Ahora no
          </Button>
          <Button asChild onClick={descartar}>
            <Link href="/minimarket/configuracion/saldos-iniciales">Configurar ahora</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
