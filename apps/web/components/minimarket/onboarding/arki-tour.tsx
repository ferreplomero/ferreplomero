"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import "./arki-tour.css";
import { Button, Card, cn } from "@arkiteq/ui";
import { MINIMARKET_NAV } from "@/lib/minimarket/nav";
import { moduloPermitido, type ContextoPermisos } from "@/lib/minimarket/permisos";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { marcarOnboardingMinimarket } from "@/app/(vertical)/minimarket/onboarding-actions";
import { ARKI_TOUR_STEPS } from "./arki-tour-steps";
import { ArkiAvatar } from "./arki-avatar";

export interface ArkiTourProps {
  /** true = onboarding pendiente en el servidor: autoinicia el tour al montar. */
  mostrarInicial: boolean;
  permisos: ContextoPermisos | null;
  drawerOpen: boolean;
  onSetDrawerOpen: (open: boolean) => void;
}

/** Breakpoint `lg` de Tailwind: por debajo, el menú vive en el drawer móvil. */
const MOBILE_BREAKPOINT = 1024;
/** Margen mínimo respecto al borde del viewport al reubicar la tarjeta. */
const MARGEN_VIEWPORT = 12;

/**
 * Devuelve el nav-link visible para este `tourId` — el desktop (`<aside>`) y
 * el drawer móvil comparten el mismo `data-tour`, pero solo uno está visible
 * (`offsetParent`) según el viewport y si el drawer está abierto.
 */
function elementoVisibleTour(tourId: string): Element {
  const candidatos = document.querySelectorAll(`[data-tour="nav-${tourId}"]`);
  for (const el of candidatos) {
    if ((el as HTMLElement).offsetParent !== null) return el;
  }
  return candidatos[0] ?? document.body;
}

function esperarFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/**
 * Red de seguridad de posicionamiento: Driver.js ya intenta ubicar la
 * tarjeta sin tapar el resaltado, pero para elementos cerca de un borde
 * (p. ej. "Caja" más abajo en el menú) el cálculo puede dejarla cortada. Se
 * lee la posición YA calculada y, si se sale del viewport, se reubica con
 * top/left absolutos — nunca se salta la lógica de Driver.js, solo se
 * corrige cuando de verdad se desborda. No aplica en móvil: ahí la tarjeta
 * queda anclada abajo por CSS (`!important`), que siempre gana.
 */
function ajustarPopoverAlViewport(wrapper: HTMLElement) {
  const rect = wrapper.getBoundingClientRect();
  const maxTop = window.innerHeight - rect.height - MARGEN_VIEWPORT;
  const maxLeft = window.innerWidth - rect.width - MARGEN_VIEWPORT;
  const top = Math.min(Math.max(rect.top, MARGEN_VIEWPORT), Math.max(MARGEN_VIEWPORT, maxTop));
  const left = Math.min(Math.max(rect.left, MARGEN_VIEWPORT), Math.max(MARGEN_VIEWPORT, maxLeft));

  if (Math.abs(top - rect.top) > 0.5 || Math.abs(left - rect.left) > 0.5) {
    wrapper.style.top = `${top}px`;
    wrapper.style.left = `${left}px`;
    wrapper.style.right = "auto";
    wrapper.style.bottom = "auto";
  }
}

export function ArkiTour({ mostrarInicial, permisos, drawerOpen, onSetDrawerOpen }: ArkiTourProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reducedMotion = usePrefersReducedMotion();

  // Solo se resaltan los módulos a los que el rol operativo del usuario tiene
  // acceso (mismo filtro que el propio menú, `lib/minimarket/permisos.ts`) —
  // un cajero nunca ve pasos de Inventario/Tasa/Reportes, por ejemplo.
  const pasos = React.useMemo(() => {
    const idsPermitidos = new Set(
      MINIMARKET_NAV.filter((item) => item.tourId && moduloPermitido(item.href, permisos)).map(
        (item) => item.tourId,
      ),
    );
    return ARKI_TOUR_STEPS.filter((paso) => !paso.tourId || idsPermitidos.has(paso.tourId));
  }, [permisos]);

  const driverRef = React.useRef<Driver | null>(null);
  const drawerOpenRef = React.useRef(drawerOpen);
  drawerOpenRef.current = drawerOpen;
  const pathnameRef = React.useRef(pathname);
  pathnameRef.current = pathname;

  const [activo, setActivo] = React.useState(false);
  const [pasoActivo, setPasoActivo] = React.useState(0);
  const [portalNode, setPortalNode] = React.useState<HTMLElement | null>(null);

  const cerrarTour = React.useCallback(
    (completado: boolean) => {
      driverRef.current?.destroy();
      driverRef.current = null;
      setActivo(false);
      setPortalNode(null);
      onSetDrawerOpen(false);
      void marcarOnboardingMinimarket(completado);
    },
    [onSetDrawerOpen],
  );

  /** Abre/cierra el drawer móvil según haga falta y resalta el paso con driver.js. */
  const resaltarPaso = React.useCallback(
    async (indice: number) => {
      const driverObj = driverRef.current;
      const paso = pasos[indice];
      if (!driverObj || !paso) return;

      const esMovil = window.innerWidth < MOBILE_BREAKPOINT;
      if (paso.tourId && esMovil && !drawerOpenRef.current) {
        onSetDrawerOpen(true);
        await esperarFrame();
      } else if (!paso.tourId && drawerOpenRef.current) {
        onSetDrawerOpen(false);
        await esperarFrame();
      }

      setPasoActivo(indice);
      driverObj.drive(indice);
    },
    [pasos, onSetDrawerOpen],
  );

  /**
   * Avanza/retrocede a un paso. Si ese paso tiene su propia sección (`href`),
   * Arki navega ahí (el usuario no abre nada manualmente) — pero SIN esperar
   * a que la página termine de cargar sus datos: el resaltado del menú no
   * depende de eso, así que se muestra de inmediato y la navegación real
   * ocurre en paralelo. Esperar la carga completa se sentía lento, sobre
   * todo en pasos cuya página consulta Supabase.
   */
  const irAPaso = React.useCallback(
    (indice: number) => {
      const paso = pasos[indice];
      if (!paso) return;

      if (paso.href && paso.href !== pathnameRef.current) {
        router.push(paso.href);
      }

      void resaltarPaso(indice);
    },
    [pasos, router, resaltarPaso],
  );

  const iniciar = React.useCallback(() => {
    if (pasos.length === 0) return;
    driverRef.current?.destroy();

    // Precarga las rutas del tour para que, cuando de verdad se navegue, el
    // contenido ya esté listo o casi — la sensación de "instantáneo" no
    // depende únicamente de no esperar la navegación (arriba), sino también
    // de que esa navegación en segundo plano sea rápida.
    for (const paso of pasos) {
      if (paso.href) router.prefetch(paso.href);
    }

    const driverObj = driver({
      animate: !reducedMotion,
      duration: 220,
      smoothScroll: true,
      allowClose: false,
      allowKeyboardControl: false,
      overlayColor: "#16252B",
      overlayOpacity: 0.55,
      stagePadding: 6,
      stageRadius: 12,
      popoverClass: "arki-popover",
      popoverOffset: 16,
      steps: pasos.map((paso) => {
        const { tourId } = paso;
        return {
          element: tourId ? () => elementoVisibleTour(tourId) : undefined,
          // Secciones: el menú vive a la izquierda, así que se prefiere la
          // tarjeta a la DERECHA del resaltado, centrada verticalmente con
          // él — nunca encima. `onHighlighted` de abajo la reubica si aun
          // así se sale del viewport (p. ej. ítems cerca del borde inferior).
          popover: tourId ? { side: "right", align: "center" } : {},
        };
      }),
      onPopoverRender: (popover, opts) => {
        const idx = opts.state.activeIndex ?? 0;
        const centrado = !pasos[idx]?.tourId;
        popover.wrapper.style.setProperty("--arki-popover-ancho", centrado ? "27rem" : "21rem");
        setPortalNode(popover.wrapper);
      },
      onHighlighted: (_element, _step, opts) => {
        const wrapper = opts.state.popover?.wrapper;
        if (wrapper) ajustarPopoverAlViewport(wrapper);
      },
    });

    driverRef.current = driverObj;
    setActivo(true);
    setPasoActivo(0);
    driverObj.drive(0);
  }, [pasos, reducedMotion, router]);

  // Autoinicio la primera vez que corresponde (marca del servidor). OJO: NO
  // usa un array de deps vacío — el layout del vertical mantiene montado
  // este mismo componente al navegar de /minimarket/bienvenida a /minimarket
  // (comparten layout), así que `mostrarInicial` llega en `false` mientras el
  // usuario completa la bienvenida y solo pasa a `true` DESPUÉS, ya en el
  // tablero (ver MinimarketLayout). El ref evita re-disparar el tour en cada
  // re-render posterior donde `mostrarInicial` se mantenga en `true`.
  const autoiniciadoRef = React.useRef(false);
  React.useEffect(() => {
    if (mostrarInicial && !autoiniciadoRef.current) {
      autoiniciadoRef.current = true;
      iniciar();
    }
  }, [mostrarInicial, iniciar]);

  // Limpieza al desmontar de verdad (cambio de vertical, cierre de sesión).
  React.useEffect(() => {
    return () => {
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, []);

  // Reinicio manual: "Ver tutorial de nuevo" en Configuración enlaza a
  // `/minimarket?tour=1`. Se limpia el query param de inmediato para que un
  // refresh posterior no vuelva a disparar el tour.
  React.useEffect(() => {
    if (searchParams.get("tour") !== "1") return;
    const params = new URLSearchParams(searchParams);
    params.delete("tour");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    iniciar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Si cambia el tamaño del viewport (rotación de pantalla, redimensionar la
  // ventana) mientras hay un paso activo, se vuelve a comprobar que la
  // tarjeta siga completamente visible.
  React.useEffect(() => {
    if (!portalNode) return;
    const onResize = () => ajustarPopoverAlViewport(portalNode);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [portalNode]);

  if (!activo || !portalNode) return null;

  const paso = pasos[pasoActivo];
  if (!paso) return null;

  const esPrimero = pasoActivo === 0;
  const esUltimo = pasoActivo === pasos.length - 1;
  const esCentrado = !paso.tourId;

  return createPortal(
    <Card
      key={pasoActivo}
      className={cn("theme-minimarket w-full shadow-xl", !reducedMotion && "arki-card-enter")}
    >
      <div
        className={cn(
          "flex gap-4 p-5",
          esCentrado
            ? "flex-col items-center pb-3 text-center sm:flex-row sm:text-left"
            : "items-start pb-4",
        )}
      >
        <ArkiAvatar
          size={esCentrado ? "lg" : "sm"}
          className={esPrimero && !reducedMotion ? "arki-avatar-intro" : undefined}
        />
        <div className="min-w-0 flex-1 pt-0.5">
          <p
            className={cn(
              "text-heading font-display font-semibold leading-tight",
              esCentrado ? "text-xl" : "text-base",
            )}
          >
            {paso.titulo}
          </p>
          <p
            className={cn(
              "text-muted-foreground mt-1.5 leading-snug",
              esCentrado ? "text-sm sm:text-base" : "text-sm",
            )}
          >
            {paso.texto}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5 pb-4" aria-hidden>
        {pasos.map((_, i) => (
          <span
            key={i}
            className={cn(
              "size-1.5 rounded-full transition-colors",
              i === pasoActivo ? "bg-accent-500" : "bg-border",
            )}
          />
        ))}
      </div>

      <div className="border-border flex items-center justify-between gap-2 border-t px-5 py-3">
        <Button variant="ghost" size="sm" onClick={() => cerrarTour(true)}>
          Saltar tour
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={esPrimero}
            onClick={() => irAPaso(pasoActivo - 1)}
          >
            Anterior
          </Button>
          <Button onClick={() => (esUltimo ? cerrarTour(true) : irAPaso(pasoActivo + 1))}>
            {esUltimo ? "¡Empezar!" : "Siguiente"}
          </Button>
        </div>
      </div>
    </Card>,
    portalNode,
  );
}
