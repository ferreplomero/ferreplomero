"use client";

import * as React from "react";
import { Button, Input, WhatsAppIcon } from "@arkiteq/ui";
import { normalizarTelefonoWhatsapp } from "@/lib/telefono-wa";

interface Props {
  /** Link público de solo lectura del presupuesto (sin sesión). */
  link: string;
  clienteNombre: string | null;
  /** WhatsApp/teléfono del cliente, sin normalizar. */
  numeroRegistrado: string | null;
  negocioNombre: string;
  totalUsd: number;
  totalBs: number;
  validezHasta: string;
}

const usd = (n: number) =>
  new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD" }).format(n);
const bs = (n: number) =>
  new Intl.NumberFormat("es-VE", { style: "currency", currency: "VES" }).format(n);

/**
 * Botón "Enviar presupuesto por WhatsApp" — mismo patrón que
 * `ReciboWhatsappBoton` (ver `components/minimarket/pos/recibo-whatsapp-boton.tsx`):
 * abre `wa.me` con el mensaje prellenado, sin API de WhatsApp Business.
 */
export function PresupuestoWhatsappBoton({
  link,
  clienteNombre,
  numeroRegistrado,
  negocioNombre,
  totalUsd,
  totalBs,
  validezHasta,
}: Props) {
  const [abierto, setAbierto] = React.useState(false);
  const [otroNumero, setOtroNumero] = React.useState(!numeroRegistrado);
  const [numeroPersonalizado, setNumeroPersonalizado] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  function enviar() {
    const numero = normalizarTelefonoWhatsapp(
      otroNumero ? numeroPersonalizado : (numeroRegistrado ?? ""),
    );
    if (!numero) {
      setError("Ingresa un número de WhatsApp válido para enviar el presupuesto.");
      return;
    }
    setError(null);

    const mensaje = [
      `¡Hola${clienteNombre ? ` ${clienteNombre}` : ""}! Aquí tienes tu presupuesto de ${negocioNombre}.`,
      `Total: ${usd(totalUsd)} (${bs(totalBs)}). Válido hasta ${validezHasta}.`,
      `Puedes verlo aquí: ${link}`,
    ].join(" ");

    window.open(
      `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`,
      "_blank",
      "noopener,noreferrer",
    );
    setAbierto(false);
  }

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        className="border-success/40 text-success hover:bg-success/10 w-full gap-2"
        onClick={() => setAbierto((v) => !v)}
      >
        <WhatsAppIcon className="size-4" aria-hidden />
        Enviar por WhatsApp
      </Button>

      {abierto ? (
        <div className="border-success/30 bg-success/5 mt-2 space-y-2 rounded-lg border p-3">
          {numeroRegistrado ? (
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={otroNumero}
                onChange={(e) => setOtroNumero(e.target.checked)}
                className="accent-success size-3.5"
              />
              Enviar a otro número
            </label>
          ) : (
            <p className="text-muted-foreground text-xs">
              Este cliente no tiene WhatsApp registrado. Ingresa un número para enviarle el
              presupuesto.
            </p>
          )}

          {otroNumero ? (
            <Input
              type="tel"
              inputMode="tel"
              placeholder="ej. 0412-1234567"
              value={numeroPersonalizado}
              onChange={(e) => setNumeroPersonalizado(e.target.value)}
              className="text-sm"
              aria-label="Número de WhatsApp"
            />
          ) : (
            <p className="text-muted-foreground text-xs">
              Se enviará al WhatsApp de {clienteNombre ?? "este cliente"} ({numeroRegistrado}).
            </p>
          )}

          {error ? <p className="text-danger text-xs">{error}</p> : null}

          <Button type="button" size="sm" className="w-full gap-1.5" onClick={enviar}>
            <WhatsAppIcon className="size-3.5" aria-hidden />
            Enviar por WhatsApp
          </Button>
        </div>
      ) : null}
    </div>
  );
}
