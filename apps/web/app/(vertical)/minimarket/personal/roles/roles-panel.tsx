"use client";

import * as React from "react";
import { AlertCircle, Check, Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  toast,
} from "@arkiteq/ui";
import type { MmModulo } from "@arkiteq/db";
import { MODULOS, MODULO_LABEL, type PermisoModulo } from "@/lib/minimarket/permisos";
import {
  actualizarRolPersonalizadoAction,
  crearRolPersonalizadoAction,
  eliminarRolPersonalizadoAction,
} from "./actions";

export interface RolConPermisos {
  id: string;
  slug: string;
  nombre: string;
  esSistema: boolean;
  descripcion: string | null;
  permisos: (PermisoModulo & { modulo: MmModulo })[];
}

const ACCIONES: { key: keyof PermisoModulo; label: string }[] = [
  { key: "ver", label: "Ver" },
  { key: "crear", label: "Crear" },
  { key: "editar", label: "Editar" },
  { key: "eliminar", label: "Eliminar" },
];

function permisoVacio(): PermisoModulo {
  return { ver: false, crear: false, editar: false, eliminar: false };
}

function mapaPermisos(rol: RolConPermisos): Record<MmModulo, PermisoModulo> {
  const mapa = {} as Record<MmModulo, PermisoModulo>;
  for (const modulo of MODULOS) {
    const fila = rol.permisos.find((p) => p.modulo === modulo);
    mapa[modulo] = fila
      ? { ver: fila.ver, crear: fila.crear, editar: fila.editar, eliminar: fila.eliminar }
      : permisoVacio();
  }
  return mapa;
}

/** Grilla de permisos ver/crear/editar/eliminar por módulo. Modo lectura o edición. */
function PermisosGrid({
  valores,
  onChange,
  disabled,
}: {
  valores: Record<MmModulo, PermisoModulo>;
  onChange?: (modulo: MmModulo, accion: keyof PermisoModulo, valor: boolean) => void;
  disabled?: boolean;
}) {
  const soloLectura = !onChange;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="text-muted-foreground text-left text-xs uppercase tracking-wide">
            <th className="py-1.5 pr-2 font-medium">Módulo</th>
            {ACCIONES.map((a) => (
              <th key={a.key} className="px-2 py-1.5 text-center font-medium">
                {a.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {MODULOS.map((modulo) => (
            <tr key={modulo}>
              <td className="text-heading py-1.5 pr-2">{MODULO_LABEL[modulo]}</td>
              {ACCIONES.map((a) => {
                const activo = valores[modulo][a.key];
                return (
                  <td key={a.key} className="px-2 py-1.5 text-center">
                    {soloLectura ? (
                      activo ? (
                        <Check className="text-success mx-auto size-4" aria-label="Sí" />
                      ) : (
                        <X className="text-muted-foreground/40 mx-auto size-4" aria-label="No" />
                      )
                    ) : (
                      <input
                        type="checkbox"
                        name={`perm_${modulo}_${a.key}`}
                        value="1"
                        defaultChecked={activo}
                        disabled={disabled}
                        onChange={(e) => onChange?.(modulo, a.key, e.target.checked)}
                        className="accent-accent-500 size-4"
                        aria-label={`${a.label} en ${MODULO_LABEL[modulo]}`}
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RolesPanel({ roles }: { roles: RolConPermisos[] }) {
  const [crearAbierto, setCrearAbierto] = React.useState(false);
  const [editando, setEditando] = React.useState<RolConPermisos | null>(null);
  const [eliminando, setEliminando] = React.useState<RolConPermisos | null>(null);

  return (
    <>
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCrearAbierto(true)}>
          <Plus className="size-4" />
          Crear rol personalizado
        </Button>
      </div>

      <div className="space-y-4">
        {roles.map((rol) => (
          <Card key={rol.id} className="p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-heading font-medium">{rol.nombre}</p>
                  {rol.esSistema ? (
                    <Badge variant="outline" className="text-[10px]">
                      <Lock className="mr-1 size-3" />
                      Predefinido
                    </Badge>
                  ) : (
                    <Badge variant="brand" className="text-[10px]">
                      Personalizado
                    </Badge>
                  )}
                </div>
                {rol.descripcion ? (
                  <p className="text-muted-foreground mt-0.5 text-xs">{rol.descripcion}</p>
                ) : null}
              </div>
              {!rol.esSistema ? (
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => setEditando(rol)}>
                    <Pencil className="size-3.5" />
                    Editar
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setEliminando(rol)}>
                    <Trash2 className="size-3.5" />
                    Eliminar
                  </Button>
                </div>
              ) : null}
            </div>
            <PermisosGrid valores={mapaPermisos(rol)} />
          </Card>
        ))}
      </div>

      <CrearRolDialog open={crearAbierto} onOpenChange={setCrearAbierto} />
      {editando ? (
        <EditarRolDialog
          rol={editando}
          onOpenChange={(open) => {
            if (!open) setEditando(null);
          }}
        />
      ) : null}
      {eliminando ? (
        <EliminarRolDialog
          rol={eliminando}
          onOpenChange={(open) => {
            if (!open) setEliminando(null);
          }}
        />
      ) : null}
    </>
  );
}

function CrearRolDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [valores, setValores] = React.useState<Record<MmModulo, PermisoModulo>>(() => {
    const mapa = {} as Record<MmModulo, PermisoModulo>;
    for (const modulo of MODULOS) mapa[modulo] = permisoVacio();
    return mapa;
  });
  const formRef = React.useRef<HTMLFormElement>(null);

  function onChangePermiso(modulo: MmModulo, accion: keyof PermisoModulo, valor: boolean) {
    setValores((prev) => ({ ...prev, [modulo]: { ...prev[modulo], [accion]: valor } }));
  }

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await crearRolPersonalizadoAction({}, fd);
    setPending(false);
    if (res.ok) {
      toast.success("Rol creado.");
      formRef.current?.reset();
      onOpenChange(false);
      return;
    }
    setError(res.error ?? Object.values(res.fieldErrors ?? {})[0] ?? "No se pudo crear el rol.");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crear rol personalizado</DialogTitle>
          <DialogDescription>
            Ponle un nombre y activa exactamente lo que esta persona puede hacer en cada módulo.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p
            role="alert"
            className="bg-danger/10 text-danger flex items-center gap-2 rounded-md px-3 py-2.5 text-sm"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}

        <form ref={formRef} onSubmit={enviar} className="space-y-4" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rol-nombre">Nombre del rol</Label>
              <Input
                id="rol-nombre"
                name="nombre"
                placeholder="Encargado de turno"
                required
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rol-descripcion">Descripción (opcional)</Label>
              <Input
                id="rol-descripcion"
                name="descripcion"
                placeholder="Qué hace este rol"
                disabled={pending}
              />
            </div>
          </div>

          <div className="max-h-[45vh] overflow-y-auto pr-1">
            <PermisosGrid valores={valores} onChange={onChangePermiso} disabled={pending} />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creando…" : "Crear rol"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditarRolDialog({
  rol,
  onOpenChange,
}: {
  rol: RolConPermisos;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [valores, setValores] = React.useState<Record<MmModulo, PermisoModulo>>(() =>
    mapaPermisos(rol),
  );

  function onChangePermiso(modulo: MmModulo, accion: keyof PermisoModulo, valor: boolean) {
    setValores((prev) => ({ ...prev, [modulo]: { ...prev[modulo], [accion]: valor } }));
  }

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await actualizarRolPersonalizadoAction(rol.id, {}, fd);
    setPending(false);
    if (res.ok) {
      toast.success("Rol actualizado.");
      onOpenChange(false);
      return;
    }
    setError(
      res.error ?? Object.values(res.fieldErrors ?? {})[0] ?? "No se pudo actualizar el rol.",
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar rol: {rol.nombre}</DialogTitle>
        </DialogHeader>

        {error ? (
          <p
            role="alert"
            className="bg-danger/10 text-danger flex items-center gap-2 rounded-md px-3 py-2.5 text-sm"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}

        <form onSubmit={enviar} className="space-y-4" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rol-edit-nombre">Nombre del rol</Label>
              <Input
                id="rol-edit-nombre"
                name="nombre"
                defaultValue={rol.nombre}
                required
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rol-edit-descripcion">Descripción (opcional)</Label>
              <Input
                id="rol-edit-descripcion"
                name="descripcion"
                defaultValue={rol.descripcion ?? ""}
                disabled={pending}
              />
            </div>
          </div>

          <div className="max-h-[45vh] overflow-y-auto pr-1">
            <PermisosGrid valores={valores} onChange={onChangePermiso} disabled={pending} />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EliminarRolDialog({
  rol,
  onOpenChange,
}: {
  rol: RolConPermisos;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function confirmar() {
    setPending(true);
    setError(null);
    const res = await eliminarRolPersonalizadoAction(rol.id);
    setPending(false);
    if (res.ok) {
      toast.success("Rol eliminado.");
      onOpenChange(false);
    } else {
      setError(res.error ?? "No se pudo eliminar el rol.");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Eliminar rol: {rol.nombre}</DialogTitle>
          <DialogDescription>
            Esta acción no se puede deshacer. Si hay personal con este rol asignado, primero
            cámbiales el rol desde Personal &gt; Usuarios.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p
            role="alert"
            className="bg-danger/10 text-danger flex items-center gap-2 rounded-md px-3 py-2.5 text-sm"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={confirmar} disabled={pending}>
            {pending ? "Eliminando…" : "Sí, eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
