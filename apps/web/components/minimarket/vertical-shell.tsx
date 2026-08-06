"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Menu, Store, X } from "lucide-react";
import { Button, ThemeToggle, cn } from "@arkiteq/ui";
import { BienvenidaSplash } from "@/components/bienvenida/bienvenida-splash";
import { CerrarSesionBoton } from "@/components/cerrar-sesion-boton";
import { SaldosInicialesModal } from "@/components/minimarket/tablero/saldos-iniciales-modal";
import { SoporteWhatsappBoton } from "@/components/soporte/soporte-whatsapp-boton";
import type { ContextoSoporte } from "@/lib/soporte-mensaje";
import { MINIMARKET_BASE, MINIMARKET_NAV } from "@/lib/minimarket/nav";
import { moduloPermitido, type ContextoPermisos } from "@/lib/minimarket/permisos";
import { precalentarRutasCriticas } from "@/lib/minimarket/prefetch-warmup";

// `@powersync/react` arrastra @powersync/common (varios MB): se difiere por
// completo al cliente (ssr:false) para que no entre al bundle del servidor.
// El indicador es puramente informativo, no hace falta en el HTML inicial.
const SyncStatus = dynamic(() => import("./sync-status").then((m) => m.SyncStatus), {
  ssr: false,
  loading: () => (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
      <span className="bg-muted-foreground/40 size-1.5 rounded-full" aria-hidden />
    </span>
  ),
});

// `driver.js` (el tour de Arki) solo hace falta la primera vez que un usuario
// entra o cuando pide verlo de nuevo: se difiere por completo del bundle
// inicial (mismo criterio que `SyncStatus` arriba).
const ArkiTour = dynamic(() => import("./onboarding/arki-tour").then((m) => m.ArkiTour), {
  ssr: false,
});

interface VerticalShellProps {
  businessName: string;
  /** Contexto de permisos del usuario en el tenant activo; null = sin restricción. */
  permisos: ContextoPermisos | null;
  /** true = el usuario aún no completó el tour de bienvenida de Arki (calculado en el servidor). */
  mostrarOnboarding: boolean;
  /** Datos para la pantalla breve de bienvenida (saludo + nombre); null = no mostrarla ahora. */
  bienvenida: { nombre: string; saludo: string } | null;
  /** Aviso (modal descartable) de medios de pago y saldo inicial pendiente
   * (migración 0106); null = no corresponde mostrarlo ahora. */
  saldosIniciales: { tipo: "nuevo" | "existente" } | null;
  /** Número de soporte del admin, o null para ocultar el botón flotante (ver lib/platform/settings.ts). */
  numeroSoporte: string | null;
  contextoSoporte: ContextoSoporte;
  children: React.ReactNode;
}

function isActive(pathname: string, href: string): boolean {
  if (href === MINIMARKET_BASE) return pathname === MINIMARKET_BASE;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isMenuActive(pathname: string, item: (typeof MINIMARKET_NAV)[number]): boolean {
  if (isActive(pathname, item.href)) return true;
  if (item.children) {
    return item.children.some((child) => isActive(pathname, child.href));
  }
  return false;
}

function Brand() {
  return (
    <Link
      href={MINIMARKET_BASE}
      className="flex items-center gap-2.5 rounded-md"
      aria-label="Minimarket, inicio"
    >
      <span className="bg-accent-500/15 text-accent-600 inline-flex size-9 items-center justify-center rounded-xl">
        <Store className="size-5" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="font-display text-heading block text-sm font-semibold">Minimarket</span>
        <span className="text-muted-foreground block text-[11px]">por Arkiteq Data</span>
      </span>
    </Link>
  );
}

function NavLinks({
  permisos,
  onNavigate,
}: {
  permisos: ContextoPermisos | null;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = React.useMemo(
    () => MINIMARKET_NAV.filter((item) => moduloPermitido(item.href, permisos)),
    [permisos],
  );

  const [openMenus, setOpenMenus] = React.useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const item of items) {
      if (item.children && isMenuActive(pathname, item)) {
        initial[item.href] = true;
      }
    }
    return initial;
  });

  React.useEffect(() => {
    setOpenMenus((prev) => {
      const next = { ...prev };
      for (const item of items) {
        if (item.children && isMenuActive(pathname, item)) {
          next[item.href] = true;
        }
      }
      return next;
    });
  }, [pathname, items]);

  function toggle(href: string) {
    setOpenMenus((prev) => ({ ...prev, [href]: !prev[href] }));
  }

  return (
    <nav aria-label="Módulos del minimarket" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const menuActive = isMenuActive(pathname, item);
        const selfActive = isActive(pathname, item.href);
        const Icon = item.icon;
        const hasChildren = item.children && item.children.length > 0;
        const expanded = openMenus[item.href] ?? false;

        return (
          <div key={item.href}>
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggle(item.href)}
                aria-expanded={expanded}
                data-tour={item.tourId ? `nav-${item.tourId}` : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
                  menuActive
                    ? "bg-accent-500/12 text-accent-600"
                    : "text-muted-foreground hover:bg-surface-2 hover:text-heading",
                )}
              >
                <Icon className="size-[18px] shrink-0" aria-hidden />
                <span className="flex-1">{item.label}</span>
                <ChevronDown
                  className={cn(
                    "size-3.5 shrink-0 transition-transform duration-150",
                    expanded && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>
            ) : (
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={selfActive ? "page" : undefined}
                data-tour={item.tourId ? `nav-${item.tourId}` : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  selfActive
                    ? "bg-accent-500/12 text-accent-600"
                    : "text-muted-foreground hover:bg-surface-2 hover:text-heading",
                )}
              >
                <Icon className="size-[18px] shrink-0" aria-hidden />
                {item.label}
              </Link>
            )}

            {hasChildren && expanded && item.children ? (
              <div className="border-border ml-6 mt-0.5 flex flex-col gap-0.5 border-l pl-3">
                {item.children.map((child) => {
                  const childActive = isActive(pathname, child.href);
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={onNavigate}
                      aria-current={childActive ? "page" : undefined}
                      className={cn(
                        "rounded-md px-2 py-1.5 text-sm transition-colors",
                        childActive
                          ? "text-accent-600 font-medium"
                          : "text-muted-foreground hover:text-heading",
                      )}
                    >
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

export function VerticalShell({
  businessName,
  permisos,
  mostrarOnboarding,
  bienvenida,
  saldosIniciales,
  numeroSoporte,
  contextoSoporte,
  children,
}: VerticalShellProps) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const pathname = usePathname();
  const router = useRouter();

  React.useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Precalienta en segundo plano el caché offline de las rutas operativas
  // más usadas (ver `prefetch-warmup.ts`) — diferido unos segundos para no
  // competir por ancho de banda con la carga/hidratación de la página
  // actual. No hace nada si no hay conexión; como mucho una vez por sesión.
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      precalentarRutasCriticas(router, permisos);
    }, 2000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="theme-minimarket bg-background flex min-h-dvh overflow-x-hidden">
      {bienvenida ? (
        <BienvenidaSplash nombre={bienvenida.nombre} saludo={bienvenida.saludo} />
      ) : null}
      <SaldosInicialesModal
        open={saldosIniciales !== null}
        tipo={saldosIniciales?.tipo ?? "existente"}
        nombreNegocio={businessName}
      />
      <SoporteWhatsappBoton numeroSoporte={numeroSoporte} contexto={contextoSoporte} />

      {/* Skip link — accesibilidad AA */}
      <a
        href="#main-content"
        className="focus:text-heading focus:ring-accent-500 sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:outline-none focus:ring-2"
      >
        Saltar al contenido
      </a>

      {/* Barra lateral fija (escritorio) — nunca se imprime, es interfaz de la app. */}
      <aside className="border-border bg-surface fixed inset-y-0 left-0 hidden w-64 flex-col border-r lg:flex print:hidden">
        <div className="border-border flex h-16 items-center border-b px-4">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks permisos={permisos} />
        </div>
        <div className="border-border space-y-2 border-t p-3">
          <p className="text-muted-foreground truncate px-2 text-xs" title={businessName}>
            {businessName}
          </p>
          <CerrarSesionBoton />
        </div>
      </aside>

      {/* Drawer móvil — nunca se imprime, es interfaz de la app. */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden print:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="bg-ink-900/40 absolute inset-0 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="border-border bg-surface theme-minimarket absolute inset-y-0 left-0 flex w-72 flex-col border-r">
            <div className="border-border flex h-16 items-center justify-between border-b px-4">
              <Brand />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Cerrar menú"
                onClick={() => setDrawerOpen(false)}
              >
                <X className="size-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <NavLinks permisos={permisos} onNavigate={() => setDrawerOpen(false)} />
            </div>
            <div className="border-border space-y-2 border-t p-3">
              <CerrarSesionBoton />
            </div>
          </aside>
        </div>
      ) : null}

      {/* Contenido */}
      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden lg:pl-64 print:pl-0">
        {/* Barra superior (menú, sincronización, tema) — nunca se imprime, es interfaz de la app. */}
        <div className="sticky top-0 z-30 flex flex-col print:hidden">
          <header className="border-border bg-background/80 flex h-16 items-center gap-3 border-b px-4 backdrop-blur-md lg:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Abrir menú"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
            >
              <Menu className="size-5" />
            </Button>
            <div className="flex-1" />
            <SyncStatus />
            <ThemeToggle />
          </header>
        </div>

        <main id="main-content" className="min-w-0 flex-1 p-4 lg:p-8 print:p-0">
          {children}
        </main>
      </div>

      <ArkiTour
        mostrarInicial={mostrarOnboarding}
        permisos={permisos}
        drawerOpen={drawerOpen}
        onSetDrawerOpen={setDrawerOpen}
      />
    </div>
  );
}
