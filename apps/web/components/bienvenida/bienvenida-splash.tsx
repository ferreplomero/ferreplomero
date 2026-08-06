"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { cn, NodeGraphBackdrop } from "@arkiteq/ui";
import { BrandLogo } from "@/components/brand-logo";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import "./bienvenida-splash.css";

const STORAGE_KEY = "arkiteq_ultima_actividad";
/** Umbral de "hace mucho que no entra": 4 horas sin actividad registrada en
 * este dispositivo. Por debajo de este umbral (recargó la página, volvió
 * hace pocos minutos, sigue trabajando) NO se muestra — en la práctica cubre
 * "primer ingreso del día" sin necesitar comparar el día de calendario (que
 * daría falsos positivos justo después de medianoche). */
const UMBRAL_INACTIVIDAD_MS = 4 * 60 * 60 * 1000;
/** Cada cuánto se refresca el marcador mientras la pestaña sigue abierta, para
 * que una sesión de trabajo larga (varias horas seguidas) nunca dispare la
 * bienvenida en un reload posterior a mitad de una operación. */
const INTERVALO_REFRESCO_MS = 5 * 60 * 1000;
const DURACION_AUTO_MS = 2800;

function marcarActividadAhora() {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // localStorage puede fallar en navegación privada — sin persistencia la
    // bienvenida simplemente se mostrará más seguido, no es crítico.
  }
}

function actividadReciente(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const ultima = raw ? Number(raw) : null;
    return (
      ultima !== null && Number.isFinite(ultima) && Date.now() - ultima < UMBRAL_INACTIVIDAD_MS
    );
  } catch {
    return false;
  }
}

export interface BienvenidaSplashProps {
  nombre: string;
  saludo: string;
  /**
   * Ruta a la que redirigir tras la bienvenida (ej. "/admin" o "/minimarket"),
   * ya resuelta en el servidor por `resolveEntryDestination()`. `null`/
   * `undefined` = esta pantalla ya ES el destino final, no hay que navegar a
   * ningún otro lado (solo el saludo cosmético).
   */
  destino?: string | null;
}

/**
 * Pantalla breve de bienvenida (saludo + nombre, fondo premium de marca) que
 * se muestra SOLO cuando no hay registro de actividad reciente en este
 * dispositivo — nunca en cada navegación o recarga. Se monta una única vez
 * por carga completa del shell (no en cada cambio de ruta dentro de la SPA),
 * así que el chequeo corre una sola vez por apertura de la app.
 *
 * Si recibe `destino`, además gobierna la "redirección inteligente": con
 * actividad reciente navega de inmediato sin mostrar nada; sin actividad
 * reciente, muestra la bienvenida y navega al cerrarse (automático o con el
 * botón "Entrar").
 */
export function BienvenidaSplash({ nombre, saludo, destino }: BienvenidaSplashProps) {
  const [visible, setVisible] = React.useState(false);
  const [saliendo, setSaliendo] = React.useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const pathname = usePathname();

  // Navegación DURA a propósito (no router.replace): una navegación blanda hacia
  // un layout de vertical `force-dynamic` que además redirige internamente (ej.
  // CondominioLayout -> /condominio/bienvenida cuando el tenant no tiene
  // condominios) deja al router de Next en un bucle infinito de refetch
  // (`fetchMissingDynamicData`) que nunca pinta contenido — pantalla negra
  // permanente reproducida en local. La carga dura evita ese mecanismo por
  // completo, igual que `hardRedirect` en ConfettiSuccessModal.
  const irADestino = React.useCallback(() => {
    if (destino && destino !== pathname) window.location.href = destino;
  }, [destino, pathname]);

  const cerrar = React.useCallback(() => {
    setSaliendo(true);
    window.setTimeout(
      () => {
        setVisible(false);
        irADestino();
      },
      reducedMotion ? 0 : 320,
    );
  }, [reducedMotion, irADestino]);

  React.useEffect(() => {
    const haceMucho = !actividadReciente();
    marcarActividadAhora();

    if (haceMucho) {
      setVisible(true);
    } else {
      irADestino();
    }
    // Se evalúa una sola vez al montar (una apertura del shell = un chequeo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refuerzo: `destino` puede volverse disponible DESPUÉS del montaje (ej. se
  // activó un producto mientras el usuario seguía en el mismo shell `(app)` ya
  // montado — un `redirect()` de Server Action llega como navegación blanda
  // sobre este mismo árbol, no remonta el componente). Sin este efecto, el
  // chequeo de arriba (que ya corrió con `destino` en null) nunca se repite y
  // la pantalla queda negra hasta refrescar a mano — bug real reproducido en
  // vivo. Se ignora el primer render (ya lo cubre el efecto de montaje) y solo
  // reacciona a que `destino` CAMBIE de valor más adelante.
  const primerRenderDestino = React.useRef(true);
  React.useEffect(() => {
    if (primerRenderDestino.current) {
      primerRenderDestino.current = false;
      return;
    }
    if (!destino || destino === pathname) return;
    irADestino();
    // Reacciona solo a cambios de `destino` en sí (no a `pathname`, que
    // cambiaría en cada navegación normal y dispararía el chequeo de nuevo
    // sin necesidad) ni a `irADestino` (misma identidad salvo que cambien
    // `destino`/`pathname`, ya cubiertos).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destino]);

  // Actividad continua: mientras la pestaña siga abierta, refresca el
  // marcador — evita que una operación larga dispare la bienvenida al
  // recargar en medio de un turno de trabajo.
  React.useEffect(() => {
    const id = window.setInterval(marcarActividadAhora, INTERVALO_REFRESCO_MS);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    if (!visible || saliendo) return;
    const id = window.setTimeout(cerrar, DURACION_AUTO_MS);
    return () => window.clearTimeout(id);
  }, [visible, saliendo, cerrar]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "bienvenida-fondo fixed inset-0 z-[100] flex flex-col items-center justify-center gap-7 overflow-hidden px-6 text-center",
        saliendo && "bienvenida-saliendo pointer-events-none",
      )}
    >
      <NodeGraphBackdrop
        animated={!reducedMotion}
        className="opacity-70 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
      />

      <div className="bienvenida-contenido relative flex flex-col items-center gap-7">
        <BrandLogo className="h-9 w-auto sm:h-11" priority />
        <div>
          <p className="font-display text-balance text-2xl font-semibold text-white sm:text-4xl">
            {saludo}
            {nombre ? `, ${nombre}` : ""}
          </p>
          <p className="mt-2 text-sm text-white/60 sm:text-base">
            Bienvenido de vuelta a Arkiteq Data
          </p>
        </div>
        <button
          type="button"
          onClick={cerrar}
          className="focus-visible:ring-ring inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        >
          Entrar
          <ArrowRight className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
