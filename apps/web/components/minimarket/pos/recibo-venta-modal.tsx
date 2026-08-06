"use client";

import * as React from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@arkiteq/ui";
import {
  obtenerReciboVentaAction,
  type ReciboVentaAction,
} from "@/app/(vertical)/minimarket/ventas/actions";
import { ReciboDocumento } from "./recibo-documento";

interface ReciboVentaModalProps {
  ventaId: string | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Ve el recibo de una venta puntual sin navegar a `/minimarket/ventas/[id]/recibo`
 * — reutiliza el mismo `ReciboDocumento` que esa página, solo cambia el punto
 * de acceso (ej. desde la cuenta de fiado de un cliente, junto a la deuda
 * vinculada a esa venta).
 */
export function ReciboVentaModal({ ventaId, onOpenChange }: ReciboVentaModalProps) {
  const [resultado, setResultado] = React.useState<ReciboVentaAction | null>(null);
  const [cargando, setCargando] = React.useState(false);

  React.useEffect(() => {
    if (!ventaId) {
      setResultado(null);
      return;
    }
    let cancelado = false;
    setCargando(true);
    setResultado(null);
    obtenerReciboVentaAction(ventaId).then(
      (res) => {
        if (!cancelado) {
          setResultado(res);
          setCargando(false);
        }
      },
      () => {
        if (!cancelado) {
          setResultado({ error: "No se pudo cargar el recibo. Inténtalo de nuevo." });
          setCargando(false);
        }
      },
    );
    return () => {
      cancelado = true;
    };
  }, [ventaId]);

  return (
    <Dialog open={Boolean(ventaId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Recibo de la venta</DialogTitle>
        </DialogHeader>

        {cargando ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-sm">
            <Loader2 className="size-6 animate-spin" aria-hidden />
            Cargando recibo…
          </div>
        ) : resultado?.error ? (
          <p
            role="alert"
            className="bg-danger/10 text-danger flex items-center gap-2 rounded-md px-3 py-2.5 text-sm"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {resultado.error}
          </p>
        ) : resultado?.doc && resultado.fecha ? (
          <div className="space-y-4">
            <ReciboDocumento doc={resultado.doc} fecha={resultado.fecha} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
