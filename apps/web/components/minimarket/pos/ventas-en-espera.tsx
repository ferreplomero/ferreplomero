"use client";

/**
 * Ventas en espera del POS: botón con contador + panel para retomar/cancelar,
 * y el diálogo de nota que se muestra al dejar una venta en espera.
 *
 * `useQuery` (de `@powersync/react`) asume un `PowerSyncContext` ya poblado —
 * llamarlo sin instancia lanza en vez de devolver un valor vacío (mismo
 * problema que `useStatus()`, ver comentario en `sync-panel.tsx`). Por eso el
 * componente que sí llama el hook (`BotonConectado`) solo se monta cuando
 * `db`/`sucursalId`/`activeCartId` ya existen; mientras tanto se muestra un
 * botón deshabilitado.
 */
import * as React from "react";
import { Clock3, Trash2 } from "lucide-react";
import { useQuery } from "@powersync/react";
import type { AbstractPowerSyncDatabase } from "@powersync/web";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  toast,
} from "@arkiteq/ui";
import {
  eliminarVentaPendienteLocal,
  parseCarritoPendiente,
  parsePagosPendiente,
  type VentaPendienteRow,
} from "@/lib/minimarket/powersync/ventas-pendientes-local";
import { TIPO_TASA_LABEL, esTipoTasa } from "@/lib/minimarket/exchange-rate";

export interface VentaPendienteParaRetomar {
  row: VentaPendienteRow;
  carrito: ReturnType<typeof parseCarritoPendiente>;
  pagos: ReturnType<typeof parsePagosPendiente>;
}

interface ClienteParaIdentificar {
  id: string;
  nombre: string;
}

interface VentasEnEsperaBotonProps {
  db: AbstractPowerSyncDatabase | null;
  sucursalId: string | null;
  locale: string;
  /** Para mostrar el nombre del cliente de cada venta en espera ("Cliente
   * ocasional" si no tiene uno asociado) — identificación junto a hora/total. */
  clientes: ClienteParaIdentificar[];
  onRetomar: (venta: VentaPendienteParaRetomar) => void;
}

export function VentasEnEsperaBoton(props: VentasEnEsperaBotonProps) {
  if (!props.db || !props.sucursalId) {
    return (
      <Button type="button" variant="outline" size="sm" disabled className="gap-1.5">
        <Clock3 className="size-4" aria-hidden />
        En espera
      </Button>
    );
  }
  return (
    <BotonConectado
      db={props.db}
      sucursalId={props.sucursalId}
      locale={props.locale}
      clientes={props.clientes}
      onRetomar={props.onRetomar}
    />
  );
}

function BotonConectado({
  db,
  sucursalId,
  locale,
  clientes,
  onRetomar,
}: {
  db: AbstractPowerSyncDatabase;
  sucursalId: string;
  locale: string;
  clientes: ClienteParaIdentificar[];
  onRetomar: (venta: VentaPendienteParaRetomar) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [cancelando, setCancelando] = React.useState<string | null>(null);
  // Filtra SOLO por estado — nunca comparando contra el cartId activo en
  // memoria del cliente. Ese truco era justo el bug: si el guardado de
  // "en_espera" tardaba en confirmarse (PowerSync inicializando) la fila
  // terminaba escrita pero el panel igual la excluía por id.
  const { data: pendientes, error: errorQuery } = useQuery<VentaPendienteRow>(
    `select * from mm_ventas_pendientes where sucursal_id = ? and estado = 'en_espera' order by updated_at desc`,
    [sucursalId],
  );

  React.useEffect(() => {
    if (errorQuery) console.error("No se pudo leer las ventas en espera:", errorQuery);
  }, [errorQuery]);

  async function cancelar(row: VentaPendienteRow) {
    const etiqueta = row.nota?.trim() ? ` ("${row.nota.trim()}")` : "";
    if (!window.confirm(`¿Cancelar esta venta en espera${etiqueta}? No se puede deshacer.`)) return;
    setCancelando(row.id);
    try {
      await eliminarVentaPendienteLocal(db, row.id);
      toast.success("Venta en espera cancelada.");
    } catch (err) {
      toast.error(
        err instanceof Error ? `No se pudo cancelar: ${err.message}` : "No se pudo cancelar.",
      );
    } finally {
      setCancelando(null);
    }
  }

  function retomar(row: VentaPendienteRow) {
    onRetomar({
      row,
      carrito: parseCarritoPendiente(row),
      pagos: parsePagosPendiente(row),
    });
    setOpen(false);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Clock3 className="size-4" aria-hidden />
        En espera
        {pendientes.length > 0 ? (
          <Badge variant="brand" className="ml-0.5 px-1.5">
            {pendientes.length}
          </Badge>
        ) : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ventas en espera</DialogTitle>
            <DialogDescription>
              Cobros que dejaste a medias para atender otra venta. Retómalos donde quedaron o
              cancélalos si el cliente ya no los quiere.
            </DialogDescription>
          </DialogHeader>

          {pendientes.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No hay ventas en espera.
            </p>
          ) : (
            <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
              {pendientes.map((row) => {
                const carrito = parseCarritoPendiente(row);
                const cantidadArticulos = carrito.reduce((s, i) => s + i.cantidad, 0);
                const hora = new Intl.DateTimeFormat(locale, {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(row.updated_at));
                const nombreCliente = row.cliente_id
                  ? (clientes.find((c) => c.id === row.cliente_id)?.nombre ?? "Cliente")
                  : "Cliente ocasional";
                return (
                  <li key={row.id} className="border-border rounded-lg border p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-heading truncate text-sm font-medium">{nombreCliente}</p>
                      <p className="text-heading shrink-0 text-sm font-semibold tabular-nums">
                        ${row.subtotal_usd.toFixed(2)}
                      </p>
                    </div>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {hora} · {cantidadArticulos} artículo(s)
                      {row.nota?.trim() ? ` · "${row.nota.trim()}"` : ""}
                    </p>
                    {esTipoTasa(row.tasa_tipo) ? (
                      <p className="text-muted-foreground text-xs">
                        Tasa: {TIPO_TASA_LABEL[row.tasa_tipo]}
                      </p>
                    ) : null}
                    <div className="mt-2 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => retomar(row)}
                        className="flex-1"
                      >
                        Retomar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void cancelar(row)}
                        disabled={cancelando === row.id}
                        aria-label="Cancelar esta venta en espera"
                        className="text-danger hover:border-danger/40 hover:text-danger"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface DialogoDejarEnEsperaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmar: (nota: string) => void;
  cantidadArticulos: number;
  guardando: boolean;
}

/** Diálogo de nota al dejar una venta en espera (paso previo a vaciar el carrito). */
export function DialogoDejarEnEspera({
  open,
  onOpenChange,
  onConfirmar,
  cantidadArticulos,
  guardando,
}: DialogoDejarEnEsperaProps) {
  const [nota, setNota] = React.useState("");

  React.useEffect(() => {
    if (open) setNota("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !guardando && onOpenChange(o)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Dejar venta en espera</DialogTitle>
          <DialogDescription>
            Se guarda el carrito ({cantidadArticulos} artículo(s)) tal como está, con el cliente,
            los descuentos y los pagos ya ingresados. Podrás retomarlo cuando quieras desde &quot;En
            espera&quot;. El carrito se vacía para que puedas atender otra venta ahora.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="nota-espera">Nota (opcional)</Label>
          <Input
            id="nota-espera"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder='ej. "Mesa 2", "el señor de la gorra"'
            maxLength={80}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={() => onConfirmar(nota)} disabled={guardando}>
            {guardando ? "Guardando…" : "Dejar en espera"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
