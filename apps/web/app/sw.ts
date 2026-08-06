// @ts-nocheck
/*
 * Service worker real de Arkiteq Data (app shell offline).
 *
 * Serwist genera `public/sw.js` a partir de este archivo en cada build
 * (ver `next.config.ts`). Excluido del `tsc` del proyecto (tsconfig.json)
 * porque usa el lib "webworker", incompatible con el lib "dom" del resto
 * de la app.
 *
 * Estrategia:
 *  - Precachea los assets del build (JS/CSS/fuentes) vía `self.__SW_MANIFEST`.
 *  - `defaultCache` (de `@serwist/next/worker`) cachea en runtime, con
 *    "network-first", el HTML y los payloads RSC de cada ruta visitada: la
 *    primera vez requiere red, pero desde ahí queda disponible sin conexión
 *    (así se resuelve que el vertical Minimarket cargue offline aunque su
 *    layout haga consultas a Supabase en el servidor — se sirve la última
 *    respuesta ya renderizada, sin volver a ejecutar ese código).
 *  - `rutasSinRedireccionCacheada`: las mismas 3 rutas de página de
 *    `defaultCache` (RSC prefetch, RSC, HTML), pero con un plugin que impide
 *    cachear una respuesta que en realidad vino de un `redirect()` (ej. el
 *    guardián de onboarding en `minimarket/layout.tsx` redirigiendo a
 *    `/minimarket/bienvenida` mientras el negocio aún no completaba sus datos
 *    iniciales). Sin este filtro, Workbox/Serwist cachean igual el contenido
 *    final de la redirección BAJO la URL original visitada (ej.
 *    `/minimarket/bancos`), y esa copia envenenada se sigue sirviendo desde
 *    caché (offline o ante cualquier corte de red) hasta por 24h aunque el
 *    servidor ya esté devolviendo la página correcta — bug real observado
 *    como "cada acción redirige a bienvenida" tras completar el onboarding.
 *    Van PRIMERO en `runtimeCaching`: Workbox usa la primera regla que
 *    matchea, así que interceptan exactamente los mismos casos que
 *    `defaultCache` manejaría más abajo, sin tocar el resto de sus reglas
 *    (fuentes, imágenes, JS/CSS, `/api/*`, etc.).
 *  - `fallbacks`: si una ruta nunca visitada falla por falta de red, se
 *    muestra `/offline.html` (estático, precacheado, sin dependencias) en
 *    vez de un error de navegador en blanco.
 */
import { defaultCache, PAGES_CACHE_NAME } from "@serwist/next/worker";
import { ExpirationPlugin, NetworkFirst, Serwist } from "serwist";

declare const self: ServiceWorkerGlobalScope;

const noCachearRedirecciones = {
  cacheWillUpdate: async ({ response }) => (response.redirected ? null : response),
};

// Nombres de caché nuevos (sufijo `-sinredirect`) a propósito: además de
// activar el filtro hacia adelante, hace que cualquier navegador que ya
// tuviera una entrada envenenada bajo el nombre viejo (`pages-rsc`, etc.) deje
// de consultarla de inmediato en este deploy, en vez de esperar a que expire
// sola en 24h.
const rutasSinRedireccionCacheada = [
  {
    matcher: ({ request, url: { pathname }, sameOrigin }) =>
      request.headers.get("RSC") === "1" &&
      request.headers.get("Next-Router-Prefetch") === "1" &&
      sameOrigin &&
      !pathname.startsWith("/api/"),
    handler: new NetworkFirst({
      cacheName: `${PAGES_CACHE_NAME.rscPrefetch}-sinredirect`,
      plugins: [
        noCachearRedirecciones,
        new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 }),
      ],
    }),
  },
  {
    matcher: ({ request, url: { pathname }, sameOrigin }) =>
      request.headers.get("RSC") === "1" && sameOrigin && !pathname.startsWith("/api/"),
    handler: new NetworkFirst({
      cacheName: `${PAGES_CACHE_NAME.rsc}-sinredirect`,
      plugins: [
        noCachearRedirecciones,
        new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 }),
      ],
    }),
  },
  {
    matcher: ({ request, url: { pathname }, sameOrigin }) =>
      request.headers.get("Content-Type")?.includes("text/html") &&
      sameOrigin &&
      !pathname.startsWith("/api/"),
    handler: new NetworkFirst({
      cacheName: `${PAGES_CACHE_NAME.html}-sinredirect`,
      plugins: [
        noCachearRedirecciones,
        new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 }),
      ],
    }),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...rutasSinRedireccionCacheada, ...defaultCache],
  fallbacks: {
    entries: [
      {
        url: "/offline.html",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
