"use client";

import * as React from "react";
import { useActionState } from "react";
import { Pencil, Plus, Trash2, X, Check } from "lucide-react";
import { Button, Card, cn } from "@arkiteq/ui";
import type { MmCategoriaMovimiento, MmCategoriaMovimientoTipo } from "@arkiteq/db";
import {
  crearCategoriaMovimiento,
  actualizarCategoriaMovimiento,
  eliminarCategoriaMovimiento,
} from "./actions";

interface Props {
  tipo: MmCategoriaMovimientoTipo;
  categorias: MmCategoriaMovimiento[];
  countPorCategoria: Record<string, number>;
}

function CrearCategoriaForm({ tipo }: { tipo: MmCategoriaMovimientoTipo }) {
  const [state, action, pending] = useActionState(crearCategoriaMovimiento, {});
  const ref = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <Card className="space-y-3 p-4">
      <p className="text-heading text-sm font-medium">Nueva categoría</p>
      <form action={action} ref={ref} className="flex gap-2">
        <input type="hidden" name="tipo" value={tipo} />
        <div className="flex-1">
          <input
            name="nombre"
            required
            maxLength={60}
            placeholder={tipo === "gasto" ? "ej. Combustible" : "ej. Devolución de impuestos"}
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
          {state.error && !state.fieldErrors?.nombre ? (
            <p className="text-danger mt-1 text-xs">{state.error}</p>
          ) : null}
        </div>
        <Button type="submit" disabled={pending} size="sm" className="shrink-0">
          <Plus className="size-4" />
          {pending ? "Guardando…" : "Agregar"}
        </Button>
      </form>
    </Card>
  );
}

function FilaCategoria({ categoria, count }: { categoria: MmCategoriaMovimiento; count: number }) {
  const [editando, setEditando] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const boundUpdate = actualizarCategoriaMovimiento.bind(null, categoria.id);
  const [editState, editAction] = useActionState(boundUpdate, {});
  const [deleteState, deleteAction, deletePending] = useActionState(
    async (_prev: { error?: string }, fd: FormData) => eliminarCategoriaMovimiento(fd),
    {},
  );

  React.useEffect(() => {
    if (editState.ok) setEditando(false);
  }, [editState.ok]);

  React.useEffect(() => {
    if (editando) inputRef.current?.focus();
  }, [editando]);

  return (
    <div className="gap-3 px-4 py-3">
      {editando ? (
        <form action={editAction} className="flex items-center gap-2">
          <input
            ref={inputRef}
            name="nombre"
            defaultValue={categoria.nombre}
            required
            maxLength={60}
            className={cn(
              "border-border bg-background text-heading flex-1 rounded-md border px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-offset-1",
              editState.fieldErrors?.nombre
                ? "border-red-400 focus:ring-red-300"
                : "focus:ring-accent-400",
            )}
          />
          <button
            type="submit"
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
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-heading text-sm font-medium">{categoria.nombre}</p>
            {count > 0 ? (
              <p className="text-muted-foreground text-xs">
                {count} registro{count !== 1 ? "s" : ""}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">Sin registros</p>
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
                      `Esta categoría tiene ${count} registro${count !== 1 ? "s" : ""}. Reasígnalos antes de eliminar.`,
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
        </div>
      )}
      {deleteState.error ? <p className="text-danger mt-1 text-xs">{deleteState.error}</p> : null}
    </div>
  );
}

export function CategoriasMovimientoCrud({ tipo, categorias, countPorCategoria }: Props) {
  return (
    <div className="space-y-4">
      <CrearCategoriaForm tipo={tipo} />

      {categorias.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <div className="border-border border-b px-4 py-3">
            <p className="text-heading text-sm font-medium">
              {categorias.length} categoría{categorias.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="divide-border divide-y">
            {categorias.map((c) => (
              <FilaCategoria key={c.id} categoria={c} count={countPorCategoria[c.id] ?? 0} />
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
