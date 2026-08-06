"use client";

import * as React from "react";
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  WhatsAppIcon,
} from "@arkiteq/ui";
import { normalizarTelefonoWhatsapp } from "@/lib/telefono-wa";
import { construirMensajeSoporte, type ContextoSoporte } from "@/lib/soporte-mensaje";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import "./soporte-whatsapp-boton.css";

/** Verde oficial de WhatsApp (deliberadamente NO el teal de marca, para que el
 * botón se reconozca de inmediato como "esto abre WhatsApp") como clases
 * Tailwind arbitrarias — no es un token del design system. */
const WHATSAPP_BG = "bg-[#25D366] hover:bg-[#20bd5c] focus-visible:ring-[#25D366]";
const WHATSAPP_TEXT = "text-[#25D366]";

export interface SoporteWhatsappBotonProps {
  /** Número de soporte del admin (formato local, ej. "0412-1234567"), o null si no está configurado. */
  numeroSoporte: string | null;
  contexto: ContextoSoporte;
}

/**
 * Botón flotante fijo (esquina inferior derecha) presente en todas las
 * secciones autenticadas: abre un panel para escribir una solicitud y la
 * envía por WhatsApp al número de soporte configurado por el admin
 * (`platform_settings.soporte_whatsapp`, nunca hardcodeado), con el mensaje
 * prellenado con los datos del usuario para que soporte no tenga que
 * preguntar quién escribe.
 *
 * En móvil se posiciona más arriba (`bottom-24`) que en escritorio
 * (`lg:bottom-6`) para no taponar la barra fija de cobro del POS
 * (`fixed inset-x-0 bottom-0`, solo visible por debajo de `lg`) — el mismo
 * punto de quiebre en ambos lugares asegura que nunca coincidan. El z-index
 * (40) queda siempre por debajo de cualquier Dialog (50, overlay de
 * @arkiteq/ui), así que un modal abierto (ej. el de cobro) lo tapa solo, sin
 * lógica adicional.
 */
export function SoporteWhatsappBoton({ numeroSoporte, contexto }: SoporteWhatsappBotonProps) {
  const [open, setOpen] = React.useState(false);
  const [mensaje, setMensaje] = React.useState("");
  const [desvanecido, setDesvanecido] = React.useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  React.useEffect(() => {
    if (reducedMotion) return;
    let timeoutId: number;
    function onScroll() {
      setDesvanecido(true);
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => setDesvanecido(false), 700);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(timeoutId);
    };
  }, [reducedMotion]);

  if (!numeroSoporte) return null;

  function enviar() {
    if (!mensaje.trim() || !numeroSoporte) return;
    const numero = normalizarTelefonoWhatsapp(numeroSoporte);
    const texto = construirMensajeSoporte(contexto, mensaje);
    window.open(
      `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`,
      "_blank",
      "noopener,noreferrer",
    );
    setOpen(false);
    setMensaje("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Escribir a soporte por WhatsApp"
        title="Soporte por WhatsApp"
        className={cn(
          "soporte-wa-boton fixed bottom-24 right-4 z-40 flex size-12 items-center justify-center rounded-full text-white shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 lg:bottom-6 lg:right-6 lg:size-14",
          WHATSAPP_BG,
          desvanecido ? "opacity-45" : "opacity-100",
        )}
      >
        <WhatsAppIcon className="size-6 lg:size-7" aria-hidden />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WhatsAppIcon className={cn("size-5", WHATSAPP_TEXT)} aria-hidden />
              Escribir a soporte
            </DialogTitle>
            <DialogDescription>
              Te llevamos a WhatsApp con tu mensaje y tus datos, para que soporte no tenga que
              preguntarte quién eres.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="soporte-mensaje">Tu solicitud</Label>
            <textarea
              id="soporte-mensaje"
              ref={textareaRef}
              rows={4}
              maxLength={500}
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              placeholder="Cuéntanos en qué te podemos ayudar…"
              className="border-border bg-background focus-visible:ring-ring w-full resize-none rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={enviar}
              disabled={!mensaje.trim()}
              className={cn("gap-2 text-white", WHATSAPP_BG)}
            >
              <WhatsAppIcon className="size-4" aria-hidden />
              Enviar por WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
