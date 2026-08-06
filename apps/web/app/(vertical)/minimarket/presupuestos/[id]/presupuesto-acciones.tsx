"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightCircle, Copy, Pencil, Trash2, XCircle } from "lucide-react";
import { Button } from "@arkiteq/ui";
import {
  duplicarPresupuesto,
  eliminarPresupuesto,
  prepararConversionPresupuesto,
  rechazarPresupuesto,
} from "../actions";

interface PresupuestoAccionesProps {
  presupuestoId: string;
  estado: "pendiente" | "convertido" | "rechazado";
  vencido: boolean;
}

export function PresupuestoAcciones({ presupuestoId, estado, vencido }: PresupuestoAccionesProps) {
  const router = useRouter();
  const [cargando, setCargando] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleConvertir() {
    if (
      vencido &&
      !confirm(
        "Este presupuesto ya venció. ¿Confirmas los precios con el cliente y quieres continuar?",
      )
    ) {
      return;
    }
    setCargando("convertir");
    setError(null);
    const res = await prepararConversionPresupuesto(presupuestoId);
    setCargando(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.redirectTo) router.push(res.redirectTo);
  }

  async function handleRechazar() {
    if (!confirm("¿Marcar este presupuesto como rechazado?")) return;
    setCargando("rechazar");
    setError(null);
    const res = await rechazarPresupuesto(presupuestoId);
    setCargando(null);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  async function handleDuplicar() {
    setCargando("duplicar");
    setError(null);
    const res = await duplicarPresupuesto(presupuestoId);
    setCargando(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.presupuestoId) router.push(`/minimarket/presupuestos/${res.presupuestoId}`);
  }

  async function handleEliminar() {
    if (!confirm("¿Eliminar este presupuesto? Esta acción no se puede deshacer.")) return;
    setCargando("eliminar");
    setError(null);
    const res = await eliminarPresupuesto(presupuestoId);
    setCargando(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.push("/minimarket/presupuestos");
  }

  return (
    <div className="space-y-2 sm:shrink-0">
      {error ? <p className="text-danger rounded-md bg-red-50 px-3 py-2 text-xs">{error}</p> : null}
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {estado === "pendiente" ? (
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/minimarket/presupuestos/${presupuestoId}/editar`}>
                <Pencil className="mr-1.5 size-4" />
                Editar
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRechazar}
              disabled={cargando !== null}
              className="text-danger hover:text-danger"
            >
              <XCircle className="mr-1.5 size-4" />
              {cargando === "rechazar" ? "Rechazando..." : "Rechazar"}
            </Button>
          </>
        ) : null}
        <Button variant="outline" size="sm" onClick={handleDuplicar} disabled={cargando !== null}>
          <Copy className="mr-1.5 size-4" />
          {cargando === "duplicar" ? "Duplicando..." : "Duplicar"}
        </Button>
        {estado !== "convertido" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleEliminar}
            disabled={cargando !== null}
            className="text-danger hover:text-danger"
          >
            <Trash2 className="mr-1.5 size-4" />
            {cargando === "eliminar" ? "Eliminando..." : "Eliminar"}
          </Button>
        ) : null}
        {estado === "pendiente" ? (
          <Button
            size="sm"
            onClick={handleConvertir}
            disabled={cargando !== null}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            <ArrowRightCircle className="mr-1.5 size-4" />
            {cargando === "convertir" ? "Preparando..." : "Convertir en venta"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
