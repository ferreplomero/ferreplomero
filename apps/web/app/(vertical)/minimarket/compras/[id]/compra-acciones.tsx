"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle } from "lucide-react";
import { Button } from "@arkiteq/ui";
import { confirmarRecepcion, anularCompra } from "../actions";

interface CompraAccionesProps {
  compraId: string;
  estado: string;
}

export function CompraAcciones({ compraId, estado }: CompraAccionesProps) {
  const router = useRouter();
  const [confirmando, setConfirmando] = React.useState(false);
  const [anulando, setAnulando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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

  if (estado === "recibida" || estado === "anulada") return null;

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
