"use client";

import * as React from "react";
import type { PowerSyncContext as PowerSyncContextType } from "@powersync/react";
import type { AbstractPowerSyncDatabase } from "@powersync/web";

/**
 * Provee la base local de PowerSync al árbol del vertical.
 *
 * El SDK (WASM) Y `@powersync/react` se cargan de forma DINÁMICA y solo en el
 * navegador (dentro del efecto), para que ni SSR ni el bundle del servidor
 * los evalúen — `@powersync/react` por sí solo arrastra `@powersync/common`
 * (varios MB) y, aunque este componente envuelve TODO el vertical, durante el
 * render en el servidor `db` siempre es `null`, así que el Provider real
 * nunca hace falta ahí. Solo los tipos (`import type`, sin costo en runtime)
 * se importan arriba. Mientras la base no está lista, se renderizan los
 * hijos sin contexto (la app funciona; el indicador de sync muestra "Local").
 */
export function PowerSyncProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = React.useState<AbstractPowerSyncDatabase | null>(null);
  const [Context, setContext] = React.useState<typeof PowerSyncContextType | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let instance: AbstractPowerSyncDatabase | null = null;

    void (async () => {
      try {
        const [{ createPowerSyncDatabase }, { PowerSyncContext }] = await Promise.all([
          import("@/lib/minimarket/powersync/db"),
          import("@powersync/react"),
        ]);
        const created = await createPowerSyncDatabase();
        if (cancelled) return;
        instance = created;
        setDb(created);
        setContext(() => PowerSyncContext);
      } catch (error) {
        // Sin base local la app sigue usable en modo conectado; se reporta para diagnóstico.
        console.error("No se pudo inicializar PowerSync:", error);
      }
    })();

    return () => {
      cancelled = true;
      void instance?.disconnect();
    };
  }, []);

  if (!db || !Context) return <>{children}</>;
  return <Context.Provider value={db}>{children}</Context.Provider>;
}
