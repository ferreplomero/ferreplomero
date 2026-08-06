"use client";

import * as React from "react";
import { Check, Cloud, Database, RefreshCw, WifiOff } from "lucide-react";
import { PowerSyncContext, useStatus } from "@powersync/react";
import type { AbstractPowerSyncDatabase } from "@powersync/web";
import { cn } from "@arkiteq/ui";
import { useOnline } from "@/lib/minimarket/use-online";

type Estado =
  "local" | "sincronizado" | "sincronizando" | "conectando" | "sin-conexion" | "pendiente";

const ESTILOS: Record<
  Estado,
  { label: (n: number) => string; className: string; Icon: typeof Cloud }
> = {
  local: { label: () => "Local", className: "text-muted-foreground", Icon: Database },
  sincronizado: { label: () => "Sincronizado", className: "text-success", Icon: Check },
  sincronizando: { label: () => "Sincronizando", className: "text-accent-600", Icon: RefreshCw },
  conectando: { label: () => "Conectando", className: "text-muted-foreground", Icon: Cloud },
  "sin-conexion": { label: () => "Sin conexión", className: "text-warning", Icon: WifiOff },
  pendiente: {
    label: (n) => `Pendiente ${n}`,
    className: "text-warning",
    Icon: RefreshCw,
  },
};

function Indicador({ estado, pendientes = 0 }: { estado: Estado; pendientes?: number }) {
  const { label, className, Icon } = ESTILOS[estado];
  return (
    <span
      className={cn(
        "inline-flex max-w-[7.5rem] shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium sm:max-w-none",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Icon
        className={cn("size-3.5 shrink-0", estado === "sincronizando" && "animate-spin")}
        aria-hidden
      />
      <span className="truncate">{label(pendientes)}</span>
    </span>
  );
}

/** Sondea la cola local de cambios sin subir; se refresca con cada cambio de estado de sync. */
export function usePendingCount(db: AbstractPowerSyncDatabase | null): number {
  const [count, setCount] = React.useState(0);
  const status = useStatus();

  React.useEffect(() => {
    if (!db) return;
    let cancelled = false;
    const refresh = () => {
      void db
        .getUploadQueueStats()
        .then((stats) => {
          if (!cancelled) setCount(stats.count);
        })
        .catch(() => {
          /* la base local puede no estar lista todavía; se reintenta en el próximo tick */
        });
    };
    refresh();
    const interval = setInterval(refresh, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // status como dependencia: refresca de inmediato tras cada intento de subida/descarga.
  }, [db, status]);

  return count;
}

/** Indicador conectado: lee el estado real del motor de sincronización. */
function EstadoConectado({ db }: { db: AbstractPowerSyncDatabase }) {
  const status = useStatus();
  const online = useOnline();
  const pendientes = usePendingCount(db);

  let estado: Estado = "conectando";
  if (status.dataFlowStatus.uploading || status.dataFlowStatus.downloading) {
    estado = "sincronizando";
  } else if (!online || (!status.connected && !online)) {
    estado = "sin-conexion";
  } else if (pendientes > 0) {
    estado = status.connected ? "pendiente" : "sin-conexion";
  } else if (status.connected) {
    estado = "sincronizado";
  } else {
    estado = online ? "conectando" : "sin-conexion";
  }

  return <Indicador estado={estado} pendientes={pendientes} />;
}

/**
 * Estado de sincronización del vertical. Si la base local aún no está montada
 * (o no hay instancia PowerSync provisionada), muestra "Local": los datos viven
 * en el dispositivo y la app es plenamente usable.
 */
export function SyncStatus() {
  const db = React.useContext(PowerSyncContext);
  if (!db) return <Indicador estado="local" />;
  return <EstadoConectado db={db} />;
}
