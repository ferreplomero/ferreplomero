"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, WifiOff } from "lucide-react";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  toast,
} from "@arkiteq/ui";
import { PowerSyncContext } from "@powersync/react";
import { SubmitButton } from "@/components/auth/submit-button";
import { crearCategoria, type ActionResult } from "@/app/(vertical)/minimarket/inventario/actions";
import { crearCategoriaLocal } from "@/lib/minimarket/powersync/registrar-producto-local";
import { useOnline } from "@/lib/minimarket/use-online";

export interface CategoriaFormProps {
  tenantId: string;
  /** Al crear con éxito, recibe la categoría recién creada (id/nombre) para
   * que un llamador (ej. el formulario de producto, alta rápida) la
   * seleccione de inmediato sin recargar ni volver a buscarla. */
  onDone: (creada?: { id: string; nombre: string }) => void;
}

export function CategoriaForm({ tenantId, onDone }: CategoriaFormProps) {
  const router = useRouter();
  const powerSyncDb = React.useContext(PowerSyncContext);
  const offline = !useOnline();
  const [state, formAction] = useActionState<ActionResult, FormData>(crearCategoria, {});
  const [guardandoLocal, setGuardandoLocal] = React.useState(false);

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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!offline) return;
    e.preventDefault();
    if (!powerSyncDb) {
      toast.error("Sin conexión y sin base local disponible. Inténtalo de nuevo en unos segundos.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const nombre = String(fd.get("nombre") ?? "").trim();
    if (!nombre) {
      toast.error("El nombre es obligatorio.");
      return;
    }
    setGuardandoLocal(true);
    try {
      const { categoriaId } = await crearCategoriaLocal(powerSyncDb, { tenantId, nombre });
      toast.success("Categoría guardada en este dispositivo. Se sincronizará al conectarte.");
      onDone({ id: categoriaId, nombre });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `No se pudo guardar: ${err.message}`
          : "No se pudo guardar la categoría.",
      );
    } finally {
      setGuardandoLocal(false);
    }
  }

  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>Nueva categoría</DialogTitle>
        <DialogDescription>Agrupa tus productos para encontrarlos más rápido.</DialogDescription>
      </DialogHeader>

      {offline ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800"
        >
          <WifiOff className="size-4 shrink-0" aria-hidden />
          <span>
            <strong>Sin conexión</strong> — se guarda en este dispositivo y se sube solo cuando
            vuelva la señal.
          </span>
        </div>
      ) : null}

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
        <Label htmlFor="cat-nombre">Nombre</Label>
        <Input
          id="cat-nombre"
          name="nombre"
          placeholder="Abarrotes"
          aria-invalid={Boolean(state.fieldErrors?.nombre)}
          required
        />
        {state.fieldErrors?.nombre ? (
          <p className="text-danger text-xs">{state.fieldErrors.nombre}</p>
        ) : null}
      </div>

      <DialogFooter>
        <SubmitButton disabled={guardandoLocal}>
          {guardandoLocal ? "Guardando…" : "Crear categoría"}
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}
