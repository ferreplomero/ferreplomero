"use client";

import * as React from "react";
import { AlertCircle, Camera } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@arkiteq/ui";

interface TomarFotoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Blob crudo de la cámara (SIN comprimir todavía — eso lo hace quien la reciba). */
  onCapturar: (blob: Blob) => void;
}

/**
 * Modal de cámara para fotografiar el producto: en móvil pide la cámara
 * TRASERA (`facingMode: "environment"`, ideal para fotografiar algo frente a
 * uno), en desktop cae a la webcam disponible. Mismo patrón de
 * `getUserMedia` que el escáner de código de barras del POS
 * (`pos-cliente.tsx`), pero capturando un frame a canvas en vez de detectar
 * un código.
 */
export function TomarFotoDialog({ open, onOpenChange, onCapturar }: TomarFotoDialogProps) {
  const [error, setError] = React.useState<string | null>(null);
  const [listo, setListo] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setListo(false);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Tu navegador no admite tomar fotos con la cámara. Puedes subir una imagen desde el dispositivo.",
      );
      return;
    }

    let activo = true;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } } })
      .then((stream) => {
        if (!activo) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setListo(true);
        }
      })
      .catch((err: DOMException) => {
        if (!activo) return;
        setError(
          err.name === "NotAllowedError"
            ? "No diste permiso para usar la cámara. Actívalo en los ajustes del navegador, o sube una imagen desde el dispositivo."
            : "No se pudo acceder a ninguna cámara. Puedes subir una imagen desde el dispositivo.",
        );
      });

    return () => {
      activo = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open]);

  function capturar() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          onCapturar(blob);
          onOpenChange(false);
        }
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Tomar foto del producto</DialogTitle>
          <DialogDescription>Encuadra el producto y toca &quot;Capturar&quot;.</DialogDescription>
        </DialogHeader>

        {error ? (
          <p
            role="alert"
            className="bg-danger/10 text-danger flex items-start gap-2 rounded-md px-3 py-2.5 text-sm"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : (
          <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="size-full object-cover"
              aria-label="Vista de la cámara para tomar la foto del producto"
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {!error ? (
            <Button onClick={capturar} disabled={!listo}>
              <Camera className="size-4" />
              Capturar
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
