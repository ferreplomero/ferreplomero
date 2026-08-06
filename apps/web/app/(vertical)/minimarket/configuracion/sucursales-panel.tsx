"use client";

import * as React from "react";
import { useActionState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { Button, Card, cn } from "@arkiteq/ui";
import type { MmSucursal } from "@arkiteq/db";
import { crearSucursal, actualizarSucursal, toggleSucursal } from "./actions";

interface Props {
  sucursales: MmSucursal[];
}

const LABEL = "text-muted-foreground block text-xs font-medium uppercase tracking-wide";
const INPUT =
  "border-border bg-background text-heading w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-offset-1 focus:ring-accent-400";

function NuevaSucursalForm() {
  const [state, action, pending] = useActionState(crearSucursal, {});
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state.ok) {
      setOpen(false);
      ref.current?.reset();
    }
  }, [state.ok]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-accent-600 hover:text-accent-700 flex items-center gap-1.5 text-sm font-medium"
      >
        <Plus className="size-4" />
        Agregar sucursal
      </button>
    );
  }

  return (
    <Card className="space-y-4 p-4">
      <p className="text-heading text-sm font-medium">Nueva sucursal</p>
      {state.error ? <p className="text-danger text-xs">{state.error}</p> : null}
      <form action={action} ref={ref} className="space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="suc-nombre" className={LABEL}>
            Nombre <span className="text-danger">*</span>
          </label>
          <input
            id="suc-nombre"
            name="nombre"
            required
            maxLength={120}
            placeholder="ej. Sucursal Centro"
            className={cn(INPUT, state.fieldErrors?.nombre && "border-red-400")}
          />
          {state.fieldErrors?.nombre ? (
            <p className="text-danger text-xs">{state.fieldErrors.nombre}</p>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="suc-dir" className={LABEL}>
              Dirección
            </label>
            <input
              id="suc-dir"
              name="direccion"
              maxLength={400}
              placeholder="Dirección"
              className={INPUT}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="suc-tel" className={LABEL}>
              Teléfono
            </label>
            <input
              id="suc-tel"
              name="telefono"
              maxLength={30}
              placeholder="ej. 0414-1234567"
              className={INPUT}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending} size="sm">
            {pending ? "Guardando…" : "Crear sucursal"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}

function FilaSucursal({ sucursal }: { sucursal: MmSucursal }) {
  const [editando, setEditando] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const boundUpdate = actualizarSucursal.bind(null, sucursal.id);
  const [editState, editAction, editPending] = useActionState(boundUpdate, {});
  const [toggleState, toggleAction, togglePending] = useActionState(
    async (_prev: { ok?: boolean; error?: string }, fd: FormData) => toggleSucursal(fd),
    {},
  );

  React.useEffect(() => {
    if (editState.ok) setEditando(false);
  }, [editState.ok]);

  React.useEffect(() => {
    if (editando) inputRef.current?.focus();
  }, [editando]);

  const idBase = `suc-edit-${sucursal.id}`;

  return (
    <div className="px-4 py-3">
      {editando ? (
        <form action={editAction} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor={`${idBase}-nombre`} className={LABEL}>
                Nombre <span className="text-danger">*</span>
              </label>
              <input
                id={`${idBase}-nombre`}
                ref={inputRef}
                name="nombre"
                defaultValue={sucursal.nombre}
                required
                maxLength={120}
                className={INPUT}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${idBase}-dir`} className={LABEL}>
                Dirección
              </label>
              <input
                id={`${idBase}-dir`}
                name="direccion"
                defaultValue={sucursal.direccion ?? ""}
                maxLength={400}
                className={INPUT}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${idBase}-tel`} className={LABEL}>
                Teléfono
              </label>
              <input
                id={`${idBase}-tel`}
                name="telefono"
                defaultValue={sucursal.telefono ?? ""}
                maxLength={30}
                className={INPUT}
              />
            </div>
          </div>
          {editState.error ? <p className="text-danger text-xs">{editState.error}</p> : null}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={editPending}
              className="text-green-600 hover:text-green-700"
              aria-label="Guardar cambios"
            >
              <Check className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setEditando(false)}
              className="text-muted-foreground hover:text-heading"
              aria-label="Cancelar edición"
            >
              <X className="size-4" />
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-sm font-medium",
                sucursal.activa ? "text-heading" : "text-muted-foreground line-through",
              )}
            >
              {sucursal.nombre}
            </p>
            {sucursal.direccion ? (
              <p className="text-muted-foreground text-xs">{sucursal.direccion}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            {sucursal.activa ? (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                Activa
              </span>
            ) : (
              <span className="bg-surface-2 text-heading rounded-full px-2 py-0.5 text-xs">
                Inactiva
              </span>
            )}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setEditando(true)}
                className="text-muted-foreground hover:text-heading rounded p-1.5 transition-colors"
                aria-label={`Editar ${sucursal.nombre}`}
              >
                <Pencil className="size-3.5" />
              </button>
              <form action={toggleAction}>
                <input type="hidden" name="id" value={sucursal.id} />
                <input type="hidden" name="activa" value={sucursal.activa ? "0" : "1"} />
                <button
                  type="submit"
                  disabled={togglePending}
                  className="text-muted-foreground hover:text-heading rounded px-2 py-1 text-xs transition-colors disabled:opacity-50"
                >
                  {sucursal.activa ? "Desactivar" : "Activar"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
      {toggleState.error ? <p className="text-danger mt-1 text-xs">{toggleState.error}</p> : null}
    </div>
  );
}

export function SucursalesPanel({ sucursales }: Props) {
  return (
    <div className="space-y-4">
      {sucursales.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <div className="border-border border-b px-4 py-3">
            <p className="text-heading text-sm font-medium">
              {sucursales.length} sucursal{sucursales.length !== 1 ? "es" : ""}
            </p>
          </div>
          <div className="divide-border divide-y">
            {sucursales.map((s) => (
              <FilaSucursal key={s.id} sucursal={s} />
            ))}
          </div>
        </Card>
      ) : null}
      <NuevaSucursalForm />
    </div>
  );
}
