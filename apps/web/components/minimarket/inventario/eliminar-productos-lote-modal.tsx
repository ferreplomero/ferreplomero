"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Loader2, Trash2, XCircle } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@arkiteq/ui";
import { eliminarProducto } from "@/app/(vertical)/minimarket/inventario/actions";

export interface ProductoAEliminar {
  id: string;
  nombre: string;
}

type EstadoFila = "pendiente" | "eliminando" | "ok" | "error";

interface FilaEstado {
  estado: EstadoFila;
  error?: string;
}

interface EliminarProductosLoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productos: ProductoAEliminar[];
  /** Se llama al terminar el borrado (parcial o completo) con el conteo final. */
  onTerminado: (resultado: { eliminados: number; fallidos: number }) => void;
}

/**
 * Confirma y ejecuta el borrado de varios productos a la vez, reutilizando
 * `eliminarProducto` (la MISMA server action del borrado individual) una vez
 * por producto seleccionado — no existe una ruta de borrado distinta. Si
 * alguno falla (p. ej. una validación futura de la action), el resto sigue
 * su curso y el resumen final indica cuáles no se pudieron eliminar y por qué.
 */
export function EliminarProductosLoteModal({
  open,
  onOpenChange,
  productos,
  onTerminado,
}: EliminarProductosLoteModalProps) {
  const [fase, setFase] = React.useState<"confirmar" | "eliminando">("confirmar");
  const [filas, setFilas] = React.useState<Record<string, FilaEstado>>({});

  React.useEffect(() => {
    if (!open) return;
    setFase("confirmar");
    const inicial: Record<string, FilaEstado> = {};
    for (const p of productos) inicial[p.id] = { estado: "pendiente" };
    setFilas(inicial);
  }, [open, productos]);

  const pending = fase === "eliminando";

  function cerrar() {
    if (pending) return;
    onOpenChange(false);
  }

  async function confirmar() {
    setFase("eliminando");
    let eliminados = 0;
    let fallidos = 0;

    for (const producto of productos) {
      setFilas((prev) => ({ ...prev, [producto.id]: { estado: "eliminando" } }));

      try {
        const fd = new FormData();
        fd.set("id", producto.id);
        const res = await eliminarProducto(fd);
        if (res.error) {
          fallidos += 1;
          setFilas((prev) => ({ ...prev, [producto.id]: { estado: "error", error: res.error } }));
        } else {
          eliminados += 1;
          setFilas((prev) => ({ ...prev, [producto.id]: { estado: "ok" } }));
        }
      } catch {
        fallidos += 1;
        setFilas((prev) => ({
          ...prev,
          [producto.id]: {
            estado: "error",
            error: "No se pudo eliminar. Inténtalo de nuevo.",
          },
        }));
      }
    }

    onTerminado({ eliminados, fallidos });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && (o ? onOpenChange(true) : cerrar())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="text-danger size-5" aria-hidden />
            {productos.length === 1
              ? "¿Eliminar este producto?"
              : `¿Eliminar ${productos.length} productos?`}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 pt-1 text-left text-sm">
              <p>
                {productos.length === 1 ? "Dejará" : "Dejarán"} de aparecer en el inventario. Podrás
                volver a crear{productos.length === 1 ? "lo" : "los"} después si hace falta.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="border-border divide-border max-h-56 divide-y overflow-y-auto rounded-lg border">
          {productos.map((p) => {
            const fila = filas[p.id];
            return (
              <div key={p.id} className="px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-heading truncate font-medium">{p.nombre}</p>
                  {fila?.estado === "eliminando" ? (
                    <Loader2
                      className="text-muted-foreground size-4 shrink-0 animate-spin"
                      aria-hidden
                    />
                  ) : fila?.estado === "ok" ? (
                    <CheckCircle2 className="text-success size-4 shrink-0" aria-hidden />
                  ) : fila?.estado === "error" ? (
                    <XCircle className="text-danger size-4 shrink-0" aria-hidden />
                  ) : null}
                </div>
                {fila?.estado === "error" && fila.error ? (
                  <p className="text-danger mt-0.5 text-xs">{fila.error}</p>
                ) : null}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={cerrar} disabled={pending}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={confirmar}
            disabled={pending || productos.length === 0}
            className="gap-1.5"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Eliminando…
              </>
            ) : (
              <>
                <Trash2 className="size-4" aria-hidden />
                Eliminar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
