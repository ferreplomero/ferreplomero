"use client";

import * as React from "react";
import { useActionState } from "react";
import { Pencil, Plus, Trash2, WifiOff, X, Check } from "lucide-react";
import { Button, Card, cn, toast } from "@arkiteq/ui";
import { PowerSyncContext } from "@powersync/react";
import type { MmCategoria } from "@arkiteq/db";
import {
  crearCategoriaLocal,
  actualizarCategoriaLocal,
} from "@/lib/minimarket/powersync/registrar-producto-local";
import { useOnline } from "@/lib/minimarket/use-online";
import { crearCategoria, actualizarCategoria, eliminarCategoria } from "../actions";

interface Props {
  categorias: MmCategoria[];
  countPorCategoria: Record<string, number>;
  tenantId: string;
}

function CrearCategoriaForm({ tenantId }: { tenantId: string }) {
  const powerSyncDb = React.useContext(PowerSyncContext);
  const offline = !useOnline();
  const [state, action, pending] = useActionState(crearCategoria, {});
  const [guardandoLocal, setGuardandoLocal] = React.useState(false);
  const ref = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

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
      await crearCategoriaLocal(powerSyncDb, { tenantId, nombre });
      toast.success("Categoría guardada en este dispositivo. Se sincronizará al conectarte.");
      ref.current?.reset();
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
    <Card className="space-y-3 p-4">
      <p className="text-heading text-sm font-medium">Nueva categoría</p>
      {offline ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          <WifiOff className="size-3.5 shrink-0" aria-hidden />
          Sin conexión — se guarda en este dispositivo y se sube solo cuando vuelva la señal.
        </div>
      ) : null}
      <form action={action} onSubmit={onSubmit} ref={ref} className="flex gap-2">
        <div className="flex-1">
          <input
            name="nombre"
            required
            maxLength={80}
            placeholder="ej. Víveres, Charcutería, Licores…"
            className={cn(
              "border-border bg-background text-heading placeholder:text-muted-foreground w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-offset-1",
              state.fieldErrors?.nombre
                ? "border-red-400 focus:ring-red-300"
                : "focus:ring-accent-400",
            )}
          />
          {state.fieldErrors?.nombre ? (
            <p className="text-danger mt-1 text-xs">{state.fieldErrors.nombre}</p>
          ) : null}
          {state.error ? <p className="text-danger mt-1 text-xs">{state.error}</p> : null}
        </div>
        <Button type="submit" disabled={pending || guardandoLocal} size="sm" className="shrink-0">
          <Plus className="size-4" />
          {pending || guardandoLocal ? "Guardando…" : "Agregar"}
        </Button>
      </form>
    </Card>
  );
}

function FilaCategoria({
  categoria,
  count,
  tenantId,
}: {
  categoria: MmCategoria;
  count: number;
  tenantId: string;
}) {
  const powerSyncDb = React.useContext(PowerSyncContext);
  const offline = !useOnline();
  const [editando, setEditando] = React.useState(false);
  const [guardandoLocal, setGuardandoLocal] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const boundUpdate = actualizarCategoria.bind(null, categoria.id);
  const [editState, editAction, editPending] = useActionState(boundUpdate, {});
  const [deleteState, deleteAction, deletePending] = useActionState(
    async (_prev: { error?: string }, fd: FormData) => eliminarCategoria(fd),
    {},
  );

  React.useEffect(() => {
    if (editState.ok) setEditando(false);
  }, [editState.ok]);

  React.useEffect(() => {
    if (editando) inputRef.current?.focus();
  }, [editando]);

  async function onSubmitEdit(e: React.FormEvent<HTMLFormElement>) {
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
      await actualizarCategoriaLocal(powerSyncDb, categoria.id, { tenantId, nombre });
      toast.success("Categoría guardada en este dispositivo. Se sincronizará al conectarte.");
      setEditando(false);
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
    <div className="flex items-center gap-3 px-4 py-3">
      {editando ? (
        <form
          action={editAction}
          onSubmit={onSubmitEdit}
          className="flex flex-1 items-center gap-2"
        >
          <input
            ref={inputRef}
            name="nombre"
            defaultValue={categoria.nombre}
            required
            maxLength={80}
            className={cn(
              "border-border bg-background text-heading flex-1 rounded-md border px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-offset-1",
              editState.fieldErrors?.nombre
                ? "border-red-400 focus:ring-red-300"
                : "focus:ring-accent-400",
            )}
          />
          <button
            type="submit"
            disabled={editPending || guardandoLocal}
            className="text-green-600 hover:text-green-700"
            aria-label="Guardar"
          >
            <Check className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="text-muted-foreground hover:text-heading"
            aria-label="Cancelar"
          >
            <X className="size-4" />
          </button>
        </form>
      ) : (
        <>
          <div className="flex-1">
            <p className="text-heading text-sm font-medium">{categoria.nombre}</p>
            {count > 0 ? (
              <p className="text-muted-foreground text-xs">
                {count} producto{count !== 1 ? "s" : ""}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">Sin productos</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="text-muted-foreground hover:text-heading rounded p-1.5 transition-colors"
              aria-label="Editar categoría"
            >
              <Pencil className="size-3.5" />
            </button>
            <form action={deleteAction}>
              <input type="hidden" name="id" value={categoria.id} />
              <button
                type="submit"
                disabled={deletePending}
                className="text-danger/70 hover:text-danger rounded p-1.5 transition-colors disabled:opacity-50"
                aria-label="Eliminar categoría"
                onClick={(e) => {
                  if (count > 0) {
                    e.preventDefault();
                    alert(
                      `Esta categoría tiene ${count} producto${count !== 1 ? "s" : ""}. Reasígnalos antes de eliminar.`,
                    );
                    return;
                  }
                  if (!confirm(`¿Eliminar la categoría "${categoria.nombre}"?`)) e.preventDefault();
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </form>
          </div>
        </>
      )}
      {deleteState.error ? <p className="text-danger text-xs">{deleteState.error}</p> : null}
    </div>
  );
}

export function CategoriasCrud({ categorias, countPorCategoria, tenantId }: Props) {
  return (
    <div className="space-y-4">
      <CrearCategoriaForm tenantId={tenantId} />

      {categorias.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <div className="border-border border-b px-4 py-3">
            <p className="text-heading text-sm font-medium">
              {categorias.length} categoría{categorias.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="divide-border divide-y">
            {categorias.map((c) => (
              <FilaCategoria
                key={c.id}
                categoria={c}
                count={countPorCategoria[c.id] ?? 0}
                tenantId={tenantId}
              />
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
