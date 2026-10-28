"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle } from "lucide-react";
import { Button, Dialog, DialogContent } from "@arkiteq/ui";
import { confirmarRecepcion, anularCompra } from "../actions";

interface CompraAccionesProps {
  compraId: string;
  estado: string;
  /** Solo administradores del negocio pueden anular una compra ya recibida. */
  puedeAnularRecibida?: boolean;
  /** Qué dinero se devolverá al anular (texto para el diálogo de confirmación). */
  dineroADevolver?: string;
}

export function CompraAcciones({
  compraId,
  estado,
  puedeAnularRecibida = false,
  dineroADevolver,
}: CompraAccionesProps) {
  const router = useRouter();
  const [confirmando, setConfirmando] = React.useState(false);
  const [anulando, setAnulando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dialogoAnular, setDialogoAnular] = React.useState(false);
  // Sobrevive al router.refresh (el componente no se desmonta): se muestra
  // aunque la compra ya figure como anulada.
  const [resultadoAnulacion, setResultadoAnulacion] = React.useState<{
    resumen: string[];
    avisos: string[];
  } | null>(null);

  async function handleConfirmar() {
    if (
      !confirm("¿Confirmar la recepción? El stock se sumará al inventario y no podrá deshacerse.")
    )
      return;
    setConfirmando(true);
    setError(null);
    const result = await confirmarRecepcion(compraId);
    setConfirmando(false);
    if (result.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
  }

  async function handleAnular() {
    if (!confirm("¿Anular esta compra? Solo puedes anular compras pendientes de recibir.")) return;
    setAnulando(true);
    setError(null);
    const result = await anularCompra(compraId);
    setAnulando(false);
    if (result.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
  }

  async function handleAnularRecibida() {
    setAnulando(true);
    setError(null);
    const result = await anularCompra(compraId);
    setAnulando(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDialogoAnular(false);
    setResultadoAnulacion({ resumen: result.resumen ?? [], avisos: result.avisos ?? [] });
    router.refresh();
  }

  if (resultadoAnulacion) {
    return (
      <div className="space-y-2 sm:max-w-sm" role="status">
        <div className="rounded-md bg-green-50 px-3 py-2 text-xs text-green-800">
          <p className="font-medium">Compra anulada.</p>
          {resultadoAnulacion.resumen.map((r) => (
            <p key={r}>{r}</p>
          ))}
        </div>
        {resultadoAnulacion.avisos.length > 0 ? (
          <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {resultadoAnulacion.avisos.map((a) => (
              <p key={a}>{a}</p>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (estado === "anulada") return null;

  if (estado === "recibida") {
    if (!puedeAnularRecibida) return null;
    return (
      <div className="sm:shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setError(null);
            setDialogoAnular(true);
          }}
          className="text-danger hover:text-danger w-full sm:w-auto"
        >
          <XCircle className="mr-1.5 size-4" />
          Anular compra
        </Button>
        <Dialog open={dialogoAnular} onOpenChange={(o) => !anulando && setDialogoAnular(o)}>
          <DialogContent className="max-w-md space-y-4 p-6">
            <div>
              <p className="text-heading font-medium">¿Anular esta compra recibida?</p>
              <p className="text-muted-foreground text-sm">
                Se revierte todo lo que hizo esta compra. No se puede deshacer.
              </p>
            </div>
            <ul className="text-body list-disc space-y-1 pl-5 text-sm">
              <li>La mercancía que entró sale del inventario.</li>
              <li>{dineroADevolver ?? "El dinero pagado vuelve a Caja o Bancos."}</li>
              <li>
                El costo y el precio de los productos vuelven a los de antes, salvo que alguien los
                haya cambiado después.
              </li>
            </ul>
            {error ? (
              <p role="alert" className="bg-danger/10 text-danger rounded-md px-3 py-2 text-sm">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogoAnular(false)} disabled={anulando}>
                Cancelar
              </Button>
              <Button
                onClick={handleAnularRecibida}
                disabled={anulando}
                className="bg-danger hover:bg-danger/90 text-white"
              >
                {anulando ? "Anulando..." : "Anular compra"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-2 sm:shrink-0">
      {error ? <p className="text-danger rounded-md bg-red-50 px-3 py-2 text-xs">{error}</p> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="outline"
          size="sm"
          onClick={handleAnular}
          disabled={anulando || confirmando}
          className="text-danger hover:text-danger w-full sm:w-auto"
        >
          <XCircle className="mr-1.5 size-4" />
          {anulando ? "Anulando..." : "Anular"}
        </Button>
        <Button
          size="sm"
          onClick={handleConfirmar}
          disabled={confirmando || anulando}
          className="w-full bg-green-600 text-white hover:bg-green-700 sm:w-auto"
        >
          <CheckCircle className="mr-1.5 size-4" />
          {confirmando ? "Confirmando..." : "Confirmar recepción"}
        </Button>
      </div>
    </div>
  );
}
