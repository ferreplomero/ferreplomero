"use client";

import * as React from "react";
import { Button, Card, cn, toast } from "@arkiteq/ui";
import { AlertTriangle, Check, Cloud, Database, RefreshCw, WifiOff } from "lucide-react";
import { PowerSyncContext, useStatus } from "@powersync/react";
import type { AbstractPowerSyncDatabase } from "@powersync/web";
import { SyncStatus, usePendingCount } from "./sync-status";

const ESTADOS = [
  {
    Icon: Check,
    titulo: "Sincronizado",
    detalle: "Todos los cambios están guardados en el servidor. No hay nada pendiente.",
  },
  {
    Icon: RefreshCw,
    titulo: "Sincronizando",
    detalle: "Enviando o recibiendo cambios. Puedes seguir trabajando con normalidad.",
  },
  {
    Icon: AlertTriangle,
    titulo: "Pendiente",
    detalle: "Hay cambios guardados en este dispositivo que aún no llegan al servidor.",
  },
  {
    Icon: WifiOff,
    titulo: "Sin conexión",
    detalle: "Estás trabajando offline. Tus ventas y movimientos se guardan en el dispositivo.",
  },
  {
    Icon: Database,
    titulo: "Local",
    detalle: "Los datos viven en este dispositivo; la sincronización se activará al conectarse.",
  },
];

function fmtFechaHora(d: Date): string {
  return new Intl.DateTimeFormat("es-VE", { dateStyle: "medium", timeStyle: "medium" }).format(d);
}

/**
 * Detalle de la cola local: cuántos cambios faltan por subir y el último sync
 * exitoso. `useStatus()` (de `@powersync/react`) asume un `PowerSyncContext`
 * ya poblado — llamarla sin instancia lanza `Cannot read properties of null
 * (reading 'currentStatus')`. Por eso el `db` se resuelve ANTES, en el
 * componente padre, y solo se monta `DetalleColaConectada` (que sí llama
 * `useStatus()`) cuando hay una instancia real — mismo patrón que
 * `SyncStatus`/`EstadoConectado` en `sync-status.tsx`.
 */
function DetalleCola() {
  const db = React.useContext(PowerSyncContext);

  if (!db) {
    return (
      <Card className="space-y-3 p-6">
        <p className="text-heading font-medium">Cola de cambios</p>
        <p className="text-muted-foreground text-sm">
          Aún no hay una instancia de sincronización conectada; los cambios se guardan solo en este
          dispositivo.
        </p>
      </Card>
    );
  }

  return <DetalleColaConectada db={db} />;
}

function DetalleColaConectada({ db }: { db: AbstractPowerSyncDatabase }) {
  const status = useStatus();
  const pendientes = usePendingCount(db);
  const [forzando, setForzando] = React.useState(false);

  const uploadError = status.dataFlowStatus.uploadError;
  const downloadError = status.dataFlowStatus.downloadError;

  async function forzarSincronizacion() {
    if (!db) return;
    setForzando(true);
    try {
      const endpoint = process.env.NEXT_PUBLIC_POWERSYNC_URL;
      if (!endpoint) {
        toast.error("No hay instancia de sincronización configurada todavía.");
        return;
      }
      const { SupabaseConnector } = await import("@/lib/minimarket/powersync/connector");
      await db.disconnect();
      await db.connect(new SupabaseConnector(endpoint));
      toast.success("Sincronización reiniciada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo forzar la sincronización.");
    } finally {
      setForzando(false);
    }
  }

  return (
    <Card className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-heading font-medium">Cola de cambios</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void forzarSincronizacion()}
          disabled={forzando}
        >
          <RefreshCw className={cn("mr-1.5 size-3.5", forzando && "animate-spin")} aria-hidden />
          Forzar sincronización
        </Button>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground text-xs">Cambios pendientes de subir</dt>
          <dd className="text-heading text-lg font-semibold tabular-nums">{pendientes}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Última sincronización</dt>
          <dd className="text-heading text-sm font-medium">
            {status.lastSyncedAt ? fmtFechaHora(status.lastSyncedAt) : "Aún no se ha sincronizado"}
          </dd>
        </div>
      </dl>

      {(uploadError ?? downloadError) ? (
        <div className="border-warning/30 bg-warning/10 flex items-start gap-2 rounded-lg border p-3">
          <AlertTriangle className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="text-sm">
            <p className="text-heading font-medium">No se pudo completar la sincronización</p>
            <p className="text-muted-foreground">
              {(uploadError ?? downloadError)?.message ??
                "Hubo un error al conectar con el servidor. Se reintentará automáticamente."}
            </p>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

/** Panel del módulo de sincronización: estado real del motor offline-first. */
export function SyncPanel() {
  const configurada = Boolean(process.env.NEXT_PUBLIC_POWERSYNC_URL);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-heading text-2xl font-semibold">Sincronización</h1>
        <p className="text-muted-foreground">
          Estado de la conexión y de la cola de cambios. La app funciona con o sin internet y
          concilia al volver la señal.
        </p>
      </header>

      <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="bg-accent-500/12 text-accent-600 inline-flex size-11 shrink-0 items-center justify-center rounded-xl">
            <Cloud className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-heading font-medium">Estado actual</p>
            <p className="text-muted-foreground text-sm">
              {configurada
                ? "Sincronización en la nube activada."
                : "Aún sin instancia de sincronización; operando en modo local."}
            </p>
          </div>
        </div>
        <SyncStatus />
      </Card>

      <DetalleCola />

      <section aria-labelledby="estados" className="space-y-3">
        <h2 id="estados" className="font-display text-heading text-base font-semibold">
          Qué significa cada estado
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {ESTADOS.map(({ Icon, titulo, detalle }) => (
            <Card key={titulo} className="flex items-start gap-3 p-4">
              <span className="text-accent-600 mt-0.5 shrink-0">
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-heading text-sm font-medium">{titulo}</p>
                <p className="text-muted-foreground text-sm">{detalle}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
