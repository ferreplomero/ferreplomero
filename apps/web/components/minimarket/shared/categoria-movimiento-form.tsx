"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@arkiteq/ui";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  crearCategoriaMovimiento,
  type CategoriaMovimientoResult,
} from "@/app/(vertical)/minimarket/reportes/categorias/actions";
import type { MmCategoriaMovimientoTipo } from "@arkiteq/db";

export interface CategoriaMovimientoFormProps {
  tipo: MmCategoriaMovimientoTipo;
  /** Al crear con éxito, recibe la categoría recién creada (id/nombre) para
   * que un llamador (ej. el formulario de gasto/otro-ingreso, alta rápida)
   * la seleccione de inmediato sin recargar ni volver a buscarla. */
  onDone: (creada?: { id: string; nombre: string }) => void;
}

export function CategoriaMovimientoForm({ tipo, onDone }: CategoriaMovimientoFormProps) {
  const router = useRouter();
  const [state, formAction] = useActionState<CategoriaMovimientoResult, FormData>(
    crearCategoriaMovimiento,
    {},
  );

  React.useEffect(() => {
    if (state.ok) {
      router.refresh();
      onDone(
        state.categoriaId && state.categoriaNombre
          ? { id: state.categoriaId, nombre: state.categoriaNombre }
          : undefined,
      );
    }
  }, [state.ok, state.categoriaId, state.categoriaNombre, router, onDone]);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>Nueva categoría</DialogTitle>
        <DialogDescription>
          {tipo === "gasto"
            ? "Agrupa tus gastos operativos para organizarlos mejor."
            : "Agrupa tus otros ingresos para organizarlos mejor."}
        </DialogDescription>
      </DialogHeader>

      <input type="hidden" name="tipo" value={tipo} />

      {state.error ? (
        <p
          role="alert"
          className="bg-danger/10 text-danger flex items-center gap-2 rounded-md px-3 py-2.5 text-sm"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="cat-mov-nombre">Nombre</Label>
        <Input
          id="cat-mov-nombre"
          name="nombre"
          placeholder={tipo === "gasto" ? "Combustible" : "Devolución de impuestos"}
          aria-invalid={Boolean(state.fieldErrors?.nombre)}
          required
        />
        {state.fieldErrors?.nombre ? (
          <p className="text-danger text-xs">{state.fieldErrors.nombre}</p>
        ) : null}
      </div>

      <DialogFooter>
        <SubmitButton>Crear categoría</SubmitButton>
      </DialogFooter>
    </form>
  );
}
