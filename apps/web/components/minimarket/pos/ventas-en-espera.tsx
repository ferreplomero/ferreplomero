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
 *
 * Compartidas entre usuarios: además de las filas locales, el panel lee del
 * servidor (`listarVentasEnEsperaAction`) las ventas en espera de TODA la
 * sucursal al montar, al abrirse, al volver a la pestaña y con "Actualizar"
 * — así un cajero ve también las que dejó otro usuario u otro dispositivo,
 * sin depender de qué filas le baje PowerSync. Local gana sobre servidor
 * (la copia local puede tener cambios que aún no subieron).
 */
import * as React from "react";
import { Clock3, RefreshCw, Trash2, User } from "lucide-react";
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
import {
  cancelarVentaEnEsperaAction,
  listarVentasEnEsperaAction,
  type VentaEnEsperaRemota,
} from "@/app/(vertical)/minimarket/ventas/en-espera-actions";

export interface VentaPendienteParaRetomar {
  row: VentaPendienteRow;
  carrito: ReturnType<typeof parseCarritoPendiente>;
  pagos: ReturnType<typeof parsePagosPendiente>;
  /** Solo existe en el servidor (la dejó otro usuario/dispositivo y no está en local). */
  soloServidor: boolean;
}

type Etiquetas = Record<string, { nombre: string; rol: string }>;

/** `true` = se retomó; `false` = no se pudo (p. ej. otro usuario la tomó primero). */
type OnRetomar = (venta: VentaPendienteParaRetomar) => Promise<boolean>;

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
  onRetomar: OnRetomar;
  /** Sin conexión no se consulta el servidor (solo se muestran las locales). */
  offline: boolean;
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
      offline={props.offline}
    />
  );
}

function BotonConectado({
  db,
  sucursalId,
  locale,
  clientes,
  onRetomar,
  offline,
}: {
  db: AbstractPowerSyncDatabase;
  sucursalId: string;
  locale: string;
  clientes: ClienteParaIdentificar[];
  onRetomar: OnRetomar;
  offline: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [cancelando, setCancelando] = React.useState<string | null>(null);
  const [retomando, setRetomando] = React.useState<string | null>(null);
  const [remotas, setRemotas] = React.useState<VentaEnEsperaRemota[]>([]);
  const [etiquetas, setEtiquetas] = React.useState<Etiquetas>({});
  const [cargandoRemotas, setCargandoRemotas] = React.useState(false);
  // Filtra SOLO por estado — nunca comparando contra el cartId activo en
  // memoria del cliente. Ese truco era justo el bug: si el guardado de
  // "en_espera" tardaba en confirmarse (PowerSync inicializando) la fila
  // terminaba escrita pero el panel igual la excluía por id.
  const { data: pendientes, error: errorQuery } = useQuery<VentaPendienteRow>(
    `select * from mm_ventas_pendientes where sucursal_id = ? and estado = 'en_espera' order by updated_at desc`,
    [sucursalId],
  );

  // Todas las ids locales de la sucursal (cualquier estado): una fila del
  // servidor que ya existe en local se ignora — la local manda (p. ej. la
  // acabo de retomar aquí y el cambio a 'activo' todavía no subió).
  const { data: idsLocales } = useQuery<{ id: string }>(
    `select id from mm_ventas_pendientes where sucursal_id = ?`,
    [sucursalId],
  );

  React.useEffect(() => {
    if (errorQuery) console.error("No se pudo leer las ventas en espera:", errorQuery);
  }, [errorQuery]);

  const usuariosLocalesRef = React.useRef<string[]>([]);
  usuariosLocalesRef.current = pendientes.map((p) => p.usuario_id ?? "").filter(Boolean);

  const cargarRemotas = React.useCallback(async () => {
    if (offline) return;
    setCargandoRemotas(true);
    try {
      const res = await listarVentasEnEsperaAction(sucursalId, usuariosLocalesRef.current);
      if (res.error) {
        console.error("No se pudo leer las ventas en espera del servidor:", res.error);
        return;
      }
      setRemotas(res.ventas ?? []);
      setEtiquetas(res.etiquetas ?? {});
    } catch (err) {
      console.error("No se pudo leer las ventas en espera del servidor:", err);
    } finally {
      setCargandoRemotas(false);
    }
  }, [offline, sucursalId]);

  // Al montar / recuperar señal / volver a la pestaña: refresca las del servidor.
  React.useEffect(() => {
    void cargarRemotas();
    const alVolver = () => {
      if (document.visibilityState === "visible") void cargarRemotas();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [cargarRemotas]);

  const lista = React.useMemo(() => {
    const idsLocalesSet = new Set(idsLocales.map((r) => r.id));
    const locales = pendientes.map((row) => ({ row, soloServidor: false }));
    const soloServidor = remotas
      .filter((r) => !idsLocalesSet.has(r.id))
      .map((row) => ({ row, soloServidor: true }));
    return [...locales, ...soloServidor].sort((a, b) =>
      b.row.updated_at.localeCompare(a.row.updated_at),
    );
  }, [pendientes, remotas, idsLocales]);

  function abrir() {
    setOpen(true);
    void cargarRemotas();
  }

  async function cancelar(row: VentaPendienteRow, soloServidor: boolean) {
    const etiqueta = row.nota?.trim() ? ` ("${row.nota.trim()}")` : "";
    if (!window.confirm(`¿Cancelar esta venta en espera${etiqueta}? No se puede deshacer.`)) return;
    setCancelando(row.id);
    try {
      if (soloServidor) {
        const res = await cancelarVentaEnEsperaAction(row.id);
        if (res.error) throw new Error(res.error);
      } else {
        await eliminarVentaPendienteLocal(db, row.id);
      }
      setRemotas((prev) => prev.filter((r) => r.id !== row.id));
      toast.success("Venta en espera cancelada.");
    } catch (err) {
      toast.error(
        err instanceof Error ? `No se pudo cancelar: ${err.message}` : "No se pudo cancelar.",
      );
    } finally {
      setCancelando(null);
    }
  }

  async function retomar(row: VentaPendienteRow, soloServidor: boolean) {
    setRetomando(row.id);
    try {
      const ok = await onRetomar({
        row,
        carrito: parseCarritoPendiente(row),
        pagos: parsePagosPendiente(row),
        soloServidor,
      });
      if (!ok) {
        // No se pudo tomar (p. ej. otro usuario la retomó primero): refresca la lista.
        void cargarRemotas();
        return;
      }
      setRemotas((prev) => prev.filter((r) => r.id !== row.id));
      setOpen(false);
    } finally {
      setRetomando(null);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={abrir} className="gap-1.5">
        <Clock3 className="size-4" aria-hidden />
        En espera
        {lista.length > 0 ? (
          <Badge variant="brand" className="ml-0.5 px-1.5">
            {lista.length}
          </Badge>
        ) : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ventas en espera</DialogTitle>
            <DialogDescription>
              Cobros dejados a medias en esta sucursal (por cualquier usuario o dispositivo).
              Retómalos donde quedaron o cancélalos si el cliente ya no los quiere.
            </DialogDescription>
          </DialogHeader>

          <div className="-mt-1 flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs">
              {offline ? "Sin conexión: solo se ven las de este dispositivo." : null}
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void cargarRemotas()}
              disabled={offline || cargandoRemotas}
              className="gap-1.5"
            >
              <RefreshCw
                className={`size-3.5 ${cargandoRemotas ? "animate-spin" : ""}`}
                aria-hidden
              />
              Actualizar
            </Button>
          </div>

          {lista.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No hay ventas en espera.
            </p>
          ) : (
            <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
              {lista.map(({ row, soloServidor }) => {
                const carrito = parseCarritoPendiente(row);
                const cantidadArticulos = carrito.reduce((s, i) => s + i.cantidad, 0);
                const hora = new Intl.DateTimeFormat(locale, {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(row.updated_at));
                const nombreCliente = row.cliente_id
                  ? (clientes.find((c) => c.id === row.cliente_id)?.nombre ?? "Cliente")
                  : "Cliente ocasional";
                const remota = remotas.find((r) => r.id === row.id);
                const quien = row.usuario_id ? etiquetas[row.usuario_id] : undefined;
                const quienNombre = remota?.usuario_nombre ?? quien?.nombre;
                const quienRol = remota?.usuario_rol ?? quien?.rol;
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
                    {quienNombre ? (
                      <p className="text-muted-foreground flex items-center gap-1 text-xs">
                        <User className="size-3" aria-hidden />
                        Dejada por <span className="text-heading font-medium">{quienNombre}</span>
                        {quienRol ? ` (${quienRol})` : ""}
                      </p>
                    ) : null}
                    {esTipoTasa(row.tasa_tipo) ? (
                      <p className="text-muted-foreground text-xs">
                        Tasa: {TIPO_TASA_LABEL[row.tasa_tipo]}
                      </p>
                    ) : null}
                    <div className="mt-2 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void retomar(row, soloServidor)}
                        disabled={retomando !== null}
                        className="flex-1"
                      >
                        {retomando === row.id ? "Retomando…" : "Retomar"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void cancelar(row, soloServidor)}
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
