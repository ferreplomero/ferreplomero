"use client";

import dynamic from "next/dynamic";

/**
 * Carga diferida (ssr:false) del panel de sincronización — arrastra
 * `@powersync/react`/`@powersync/common` (varios MB). La página de
 * Sincronización es un Server Component, así que este wrapper cliente es el
 * punto donde se puede usar `ssr:false` (no está permitido directo en un
 * Server Component).
 */
export const SyncPanel = dynamic(() => import("./sync-panel").then((m) => m.SyncPanel), {
  ssr: false,
  loading: () => (
    <div className="text-muted-foreground animate-pulse text-sm">Cargando sincronización…</div>
  ),
});
