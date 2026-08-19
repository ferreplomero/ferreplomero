"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@arkiteq/ui";
import {
  cargaMasivaLote,
  type ResolucionesCarga,
} from "@/app/(vertical)/minimarket/inventario/actions";
import { LOTE_TAMANO } from "@/lib/minimarket/carga-masiva-parse";

interface Lote {
  indice: number;
  lineaInicio: number;
  lineas: string[];
}

interface FilaError {
  linea: number;
  motivo: string;
}

type EstadoLote =
  | { estado: "pendiente" }
  | { estado: "procesando" }
  | { estado: "ok"; creados: number; actualizados: number; omitidos: number; errores: FilaError[] }
  | { estado: "error"; motivo: string };

interface CargaProgresoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Líneas de datos del CSV (sin cabecera) — ver `dividirLineasCsv`. */
  lineas: string[];
  resoluciones: ResolucionesCarga;
  /** Se llama al cerrar el modal después de haber procesado al menos un lote,
   * para refrescar la lista de productos importados. */
  onTerminado: () => void;
}

function construirLotes(lineas: string[]): Lote[] {
  const lotes: Lote[] = [];
  for (let i = 0; i < lineas.length; i += LOTE_TAMANO) {
    lotes.push({
      indice: lotes.length,
      lineaInicio: i + 1,
      lineas: lineas.slice(i, i + LOTE_TAMANO),
    });
  }
  return lotes;
}

/**
 * Sube la carga masiva por lotes (ver `cargaMasivaLote`), en vez de una sola
 * petición con el archivo completo — así cada lote es una llamada corta que
 * no choca con el timeout de la función serverless, y se puede mostrar
 * progreso real (lote a lote) en vez de dejar al usuario esperando a ciegas.
 * Si un lote falla por error de red/servidor (no un error de datos: esos ya
 * vienen resueltos fila por fila dentro del resultado del lote), se puede
 * reintentar SOLO ese lote sin perder lo que ya se subió.
 */
export function CargaProgresoModal({
  open,
  onOpenChange,
  lineas,
  resoluciones,
  onTerminado,
}: CargaProgresoModalProps) {
  const [lotes, setLotes] = React.useState<Lote[]>([]);
  const [resultados, setResultados] = React.useState<Record<number, EstadoLote>>({});
  const [corriendo, setCorriendo] = React.useState(false);
  const resolucionesJson = React.useMemo(() => JSON.stringify(resoluciones), [resoluciones]);

  // Recibe los LOTES directamente (no sus índices) — si en vez de esto se
  // buscaran por índice en el estado `lotes`, la primera llamada (disparada
  // desde el useEffect de abajo justo después de `setLotes`) vería el
  // closure de ESTE render, con `lotes` todavía en su valor viejo (el
  // setState aún no se aplicó), y saltaría el lote entero sin subir nada ni
  // avisar del error.
  const procesarLotes = React.useCallback(
    async (objetivo: Lote[]) => {
      setCorriendo(true);
      for (const lote of objetivo) {
        setResultados((prev) => ({ ...prev, [lote.indice]: { estado: "procesando" } }));
        try {
          const res = await cargaMasivaLote(lote.lineas, lote.lineaInicio, resolucionesJson);
          if (res.error) {
            const motivo = res.error;
            setResultados((prev) => ({
              ...prev,
              [lote.indice]: { estado: "error", motivo },
            }));
          } else {
            setResultados((prev) => ({
              ...prev,
              [lote.indice]: {
                estado: "ok",
                creados: res.creados ?? 0,
                actualizados: res.actualizados ?? 0,
                omitidos: res.omitidos ?? 0,
                errores: res.errores ?? [],
              },
            }));
          }
        } catch {
          setResultados((prev) => ({
            ...prev,
            [lote.indice]: {
              estado: "error",
              motivo: "No se pudo procesar este lote (error de conexión).",
            },
          }));
        }
      }
      setCorriendo(false);
    },
    [resolucionesJson],
  );

  React.useEffect(() => {
    if (!open) return;
    const nuevosLotes = construirLotes(lineas);
    setLotes(nuevosLotes);
    setResultados({});
    // Arranca solo — el usuario no debe tener que darle a otro botón para
    // que empiece a subir, ni quedarse sin saber si algo está pasando.
    void procesarLotes(nuevosLotes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lineas]);

  const totalFilas = lineas.length;
  const filasResueltas = lotes.reduce((acc, l) => {
    const r = resultados[l.indice];
    return r && (r.estado === "ok" || r.estado === "error") ? acc + l.lineas.length : acc;
  }, 0);
  const porcentaje = totalFilas > 0 ? Math.round((filasResueltas / totalFilas) * 100) : 0;

  const todosTerminados =
    lotes.length > 0 &&
    lotes.every((l) => {
      const r = resultados[l.indice];
      return r?.estado === "ok" || r?.estado === "error";
    });

  const resumen = lotes.reduce(
    (acc, l) => {
      const r = resultados[l.indice];
      if (r?.estado === "ok") {
        acc.creados += r.creados;
        acc.actualizados += r.actualizados;
        acc.omitidos += r.omitidos;
        acc.errores.push(...r.errores);
      }
      return acc;
    },
    { creados: 0, actualizados: 0, omitidos: 0, errores: [] as FilaError[] },
  );

  const lotesFallidos = lotes.filter((l) => resultados[l.indice]?.estado === "error");

  function cerrar() {
    if (corriendo) return;
    onOpenChange(false);
    if (todosTerminados) onTerminado();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !corriendo && (o ? onOpenChange(true) : cerrar())}>
      <DialogContent className="sm:max-w-lg" hideClose={corriendo}>
        <DialogHeader>
          <DialogTitle>
            {todosTerminados ? "Importación terminada" : "Importando productos…"}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-1 text-left text-sm">
              <p>
                {todosTerminados
                  ? `Se procesaron ${totalFilas} fila(s).`
                  : "No cierres esta ventana — puede tardar unos segundos según el tamaño del archivo."}
              </p>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {filasResueltas} de {totalFilas} producto(s)
                  </span>
                  <span className="text-heading font-medium tabular-nums">{porcentaje}%</span>
                </div>
                <div
                  className="bg-border/60 h-2.5 w-full overflow-hidden rounded-full"
                  role="progressbar"
                  aria-valuenow={porcentaje}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="bg-accent-600 h-full rounded-full transition-[width] duration-300 ease-out"
                    style={{ width: `${porcentaje}%` }}
                  />
                </div>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        {todosTerminados ? (
          <div className="border-border space-y-3 rounded-md border p-4">
            <p className="text-success flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              Se crearon {resumen.creados}, se actualizaron {resumen.actualizados} y se omitieron{" "}
              {resumen.omitidos} producto(s).
            </p>

            {resumen.errores.length > 0 ? (
              <div className="text-muted-foreground text-xs">
                <p className="text-warning font-medium">
                  {resumen.errores.length} fila(s) con problemas:
                </p>
                <ul className="mt-1 max-h-32 list-inside list-disc space-y-0.5 overflow-y-auto">
                  {resumen.errores.slice(0, 30).map((e) => (
                    <li key={e.linea}>
                      Fila {e.linea}: {e.motivo}
                    </li>
                  ))}
                  {resumen.errores.length > 30 ? (
                    <li>… y {resumen.errores.length - 30} más.</li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            {lotesFallidos.length > 0 ? (
              <div className="bg-danger/10 space-y-2 rounded-md p-3 text-xs">
                <p className="text-danger flex items-center gap-2 font-medium">
                  <AlertCircle className="size-4 shrink-0" aria-hidden />
                  No se pudieron procesar las filas{" "}
                  {lotesFallidos
                    .map((l) => `${l.lineaInicio}–${l.lineaInicio + l.lineas.length - 1}`)
                    .join(", ")}
                  . Lo demás ya quedó importado.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void procesarLotes(lotesFallidos)}
                  className="gap-1.5"
                >
                  <RefreshCw className="size-3.5" aria-hidden />
                  Reintentar filas fallidas
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
            Lote {Math.min(
              lotes.filter((l) => resultados[l.indice]).length + 1,
              lotes.length,
            )} de {lotes.length}…
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={cerrar} disabled={corriendo}>
            {todosTerminados ? "Cerrar" : "Subiendo…"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
