"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";
import { NodeGraphBackdrop } from "@arkiteq/ui";
import { BrandLogo } from "@/components/brand-logo";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import "./bienvenida-splash.css";

export interface BienvenidaOnboardingCompletoProps {
  nombreUsuario: string;
  nombreNegocio: string;
  /**
   * Ruta destino del botón. Se navega con un `<a href>` normal (navegación
   * DURA, recarga completa) y NUNCA con el router de Next: justo antes de
   * este momento, esa misma ruta le respondía al layout del vertical con un
   * `redirect()` a este asistente (faltaban los datos que se acaban de
   * guardar) — si esa respuesta llegó a cachearse en el Router Cache del
   * cliente, una navegación blanda (`router.push`) podía servirla de vuelta y
   * el usuario nunca salía de esta pantalla o quedaba con la pantalla en
   * negro. Mismo bug ya documentado y resuelto con `hardRedirect` en
   * `ConfettiSuccessModal` (ver `components/catalog/confetti-success-modal.tsx`).
   */
  destino: string;
}

/**
 * Pantalla de bienvenida a pantalla completa que cubre el momento entre
 * terminar el asistente de datos iniciales del negocio y entrar al
 * escritorio — mismo fondo premium (`bienvenida-splash.css`) que la
 * bienvenida de reingreso, pero sin autocierre: el usuario confirma con el
 * botón, que además garantiza (navegación dura) que el escritorio cargue
 * bien la primera vez.
 */
export function BienvenidaOnboardingCompleto({
  nombreUsuario,
  nombreNegocio,
  destino,
}: BienvenidaOnboardingCompletoProps) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div
      role="status"
      aria-live="polite"
      className="bienvenida-fondo fixed inset-0 z-[100] flex flex-col items-center justify-center gap-7 overflow-hidden px-6 text-center"
    >
      <NodeGraphBackdrop
        animated={!reducedMotion}
        className="opacity-70 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
      />

      <div className="bienvenida-contenido relative flex flex-col items-center gap-7">
        <BrandLogo className="h-9 w-auto sm:h-11" priority />
        <div>
          <p className="font-display text-balance text-2xl font-semibold text-white sm:text-4xl">
            ¡Bienvenido, {nombreUsuario}!
          </p>
          <p className="mx-auto mt-2 max-w-sm text-balance text-sm text-white/70 sm:text-base">
            Tu negocio <span className="font-semibold text-white">{nombreNegocio}</span> ya está
            listo.
          </p>
        </div>
        <a
          href={destino}
          className="focus-visible:ring-ring text-ink-900 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        >
          Ir a mi escritorio
          <ArrowRight className="size-4" aria-hidden />
        </a>
      </div>
    </div>
  );
}
