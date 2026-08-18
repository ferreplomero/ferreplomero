/**
 * Precalienta el caché del Service Worker con las rutas operativas más
 * usadas del minimarket, para que sigan disponibles si se corta la conexión
 * antes de que el cajero las haya visitado manualmente ese día.
 *
 * `router.prefetch()` (App Router) hace una petición real de red por cada
 * ruta; el Service Worker (Serwist) la intercepta igual que cualquier otra
 * navegación y la guarda en su caché "network-first" — el mismo mecanismo
 * que ya deja disponible offline cualquier ruta visitada normalmente, solo
 * que aquí se dispara sola en segundo plano en vez de depender de que el
 * usuario haya entrado a esa pantalla ese día.
 *
 * Se ejecuta como máximo UNA vez por sesión de navegador (bandera a nivel de
 * módulo: sobrevive a la navegación dentro de la app vía el router de
 * Next.js, se resetea solo con una recarga completa de la página) y solo si
 * `navigator.onLine` es `true` — si no hay conexión, no dispara ninguna
 * petición.
 */
import { MINIMARKET_BASE } from "@/lib/minimarket/nav";
import { moduloPermitido, type ContextoPermisos } from "@/lib/minimarket/permisos";

const RUTAS_CRITICAS = [
  MINIMARKET_BASE,
  `${MINIMARKET_BASE}/ventas/nueva`,
  `${MINIMARKET_BASE}/inventario`,
  `${MINIMARKET_BASE}/caja`,
  `${MINIMARKET_BASE}/fiado`,
  `${MINIMARKET_BASE}/clientes`,
];

interface RouterConPrefetch {
  prefetch: (href: string) => void;
}

let yaPrecalentado = false;

/** Solo para pruebas — permite forzar que la próxima llamada dispare de nuevo. */
export function _reiniciarPrecalentamientoParaPruebas(): void {
  yaPrecalentado = false;
}

export function precalentarRutasCriticas(
  router: RouterConPrefetch,
  permisos: ContextoPermisos | null,
  esAdmin: boolean,
): void {
  if (yaPrecalentado) return;
  if (typeof navigator === "undefined" || !navigator.onLine) return;
  yaPrecalentado = true;

  for (const ruta of RUTAS_CRITICAS) {
    if (!moduloPermitido(ruta, permisos, esAdmin)) continue;
    try {
      router.prefetch(ruta);
    } catch (error) {
      // Es una optimización best-effort: un fallo aquí nunca debe afectar
      // la navegación real del usuario ni la carga de la página actual.
      console.error(`[Minimarket] No se pudo precalentar la ruta ${ruta}:`, error);
    }
  }
}
