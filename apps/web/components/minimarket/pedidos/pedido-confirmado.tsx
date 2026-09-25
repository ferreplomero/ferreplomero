"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { Button, WhatsAppIcon } from "@arkiteq/ui";

/**
 * Cabecera de "¡Pedido recibido!" (confeti una sola vez) + botón para avisar
 * al negocio por WhatsApp con el resumen del pedido.
 */
export function PedidoConfirmado({
  nuevo,
  numero,
  telefonoNegocio,
  mensajeWhatsapp,
}: {
  nuevo: boolean;
  numero: string;
  /** Ya normalizado para wa.me (58…), o null si la sucursal no tiene teléfono. */
  telefonoNegocio: string | null;
  mensajeWhatsapp: string;
}) {
  React.useEffect(() => {
    if (!nuevo) return;
    import("canvas-confetti")
      .then(({ default: confetti }) =>
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.3 },
          disableForReducedMotion: true,
        }),
      )
      .catch(() => undefined);
  }, [nuevo]);

  return (
    <div className="space-y-3 text-center">
      {nuevo ? (
        <div className="space-y-1">
          <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
          <h1 className="text-heading text-xl font-semibold">¡Pedido recibido!</h1>
          <p className="text-muted-foreground text-sm">
            Tu número de pedido es <span className="text-heading font-semibold">{numero}</span>.
            Guarda este enlace para consultar su estado.
          </p>
        </div>
      ) : (
        <h1 className="text-heading text-xl font-semibold">Pedido {numero}</h1>
      )}
      {telefonoNegocio ? (
        <Button asChild className="w-full bg-[#25D366] text-white hover:bg-[#1ebe5b]">
          <a
            href={`https://wa.me/${telefonoNegocio}?text=${encodeURIComponent(mensajeWhatsapp)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <WhatsAppIcon className="size-4" />
            Avisar al negocio por WhatsApp
          </a>
        </Button>
      ) : null}
    </div>
  );
}
