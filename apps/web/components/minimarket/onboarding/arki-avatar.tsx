"use client";

import * as React from "react";
import Image from "next/image";
import { Sparkles } from "lucide-react";
import { cn } from "@arkiteq/ui";

/**
 * Ruta donde debe colocarse la imagen real de Arki (PNG/WEBP, fondo
 * transparente, personaje de cuerpo completo) — directo en
 * `apps/web/public/arki.png`. Mientras el archivo no exista, `onError` cae
 * al ícono de respaldo — no hace falta ningún cambio de código cuando se
 * agregue/reemplace la imagen.
 */
export const ARKI_AVATAR_SRC = "/arki.png";

const TAMANOS = {
  // Sección resaltada: miniatura mediana, junto al texto.
  sm: "h-16 w-16 sm:h-20 sm:w-20",
  // Bienvenida/cierre: cuerpo completo, protagonista de la tarjeta central.
  lg: "h-28 w-28 sm:h-36 sm:w-36",
} as const;

export function ArkiAvatar({ className, size = "lg" }: { className?: string; size?: "sm" | "lg" }) {
  const [error, setError] = React.useState(false);

  if (error) {
    return (
      <span
        className={cn(
          "bg-accent-50 text-accent-600 inline-flex shrink-0 items-center justify-center rounded-2xl",
          TAMANOS[size],
          className,
        )}
      >
        <Sparkles className={size === "lg" ? "size-10" : "size-6"} aria-hidden />
      </span>
    );
  }

  return (
    <span className={cn("relative inline-block shrink-0", TAMANOS[size], className)}>
      <Image
        src={ARKI_AVATAR_SRC}
        alt="Arki, tu asesora virtual"
        fill
        sizes="(max-width: 640px) 8rem, 9rem"
        className="object-contain object-bottom"
        priority={size === "lg"}
        onError={() => setError(true)}
      />
    </span>
  );
}
