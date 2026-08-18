"use client";

import * as React from "react";
import {
  AlertCircle,
  Ban,
  KeyRound,
  Pencil,
  Plus,
  Trash2,
  UserCheck,
  UserCog,
  X,
} from "lucide-react";
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
import { PasswordInput } from "@/components/auth/password-input";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import {
  actualizarDatosPersonalAction,
  agregarAsignacionPersonalAction,
  cambiarAsignacionPersonalAction,
  desactivarPersonalAction,
  eliminarPersonalAction,
  establecerPasswordPersonalAction,
  quitarAsignacionSucursalAction,
  reactivarPersonalAction,
  registrarPersonalAction,
} from "./actions";

export interface AsignacionPersonal {
  asignacionId: string;
  sucursalId: string;
  sucursalNombre: string;
  rolId: string;
  rolNombre: string;
}

export interface MiembroPersonal {
  profileId: string;
  nombre: string;
  email: string;
  whatsapp: string;
  activo: boolean;
  esDuenoPrincipal: boolean;
  /** Una entrada por sucursal asignada — puede ser más de una. */
  asignaciones: AsignacionPersonal[];
}

export interface RolDisponible {
  id: string;
  nombre: string;
  esSistema: boolean;
}

export interface SucursalSimple {
  id: string;
  nombre: string;
}

interface Props {
  miembros: MiembroPersonal[];
  roles: RolDisponible[];
  sucursales: SucursalSimple[];
}

const LABEL = "text-muted-foreground block text-xs font-medium uppercase tracking-wide";
const SELECT =
  "border-border bg-background text-heading w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-offset-1 focus:ring-accent-400";

function splitNombre(nombreCompleto: string): { nombre: string; apellido: string } {
  const partes = nombreCompleto.trim().split(/\s+/);
  if (partes.length <= 1) return { nombre: partes[0] ?? "", apellido: "" };
  return { nombre: partes[0] ?? "", apellido: partes.slice(1).join(" ") };
}

export function PersonalPanel({ miembros, roles, sucursales }: Props) {
  const [registrarAbierto, setRegistrarAbierto] = React.useState(false);
  const [editando, setEditando] = React.useState<MiembroPersonal | null>(null);
  const [eliminando, setEliminando] = React.useState<MiembroPersonal | null>(null);
  const [pending, startTransition] = React.useTransition();

  function recargar(msg: string) {
    toast.success(msg);
  }

  return (
    <>
      <Card className="overflow-hidden p-0">
        <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <p className="text-heading text-sm font-medium">
              {miembros.length} miembro{miembros.length !== 1 ? "s" : ""} del personal
            </p>
            <p className="text-muted-foreground text-xs">
              Cada uno inicia sesión con su propia cuenta.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setRegistrarAbierto(true)}
            disabled={sucursales.length === 0}
          >
            <Plus className="size-4" />
            Registrar personal
          </Button>
        </div>

        <div className="divide-border divide-y">
          {miembros.map((m) => (
            <div
              key={m.profileId}
              className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-heading break-words text-sm font-medium">{m.nombre}</p>
                  {m.esDuenoPrincipal ? (
                    <Badge variant="brand" className="text-[10px]">
                      Dueño principal
                    </Badge>
                  ) : null}
                  <Badge variant={m.activo ? "success" : "neutral"} className="text-[10px]">
                    {m.activo ? "Activo" : "Desactivado"}
                  </Badge>
                </div>
                <p className="text-muted-foreground break-words text-xs">{m.email}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {m.asignaciones.map((a) => (
                    <span
                      key={a.asignacionId}
                      className="bg-surface-2 text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-[11px]"
                    >
                      <span className="font-medium">{a.rolNombre}</span>
                      <span className="mx-1">·</span>
                      {a.sucursalNombre}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={() => setEditando(m)}>
                  <Pencil className="size-3.5" />
                  Editar
                </Button>
                {!m.esDuenoPrincipal ? (
                  m.activo ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          const res = await desactivarPersonalAction(m.profileId);
                          if (res.ok) recargar("Personal desactivado.");
                          else toast.error(res.error ?? "No se pudo desactivar.");
                        });
                      }}
                    >
                      <Ban className="size-3.5" />
                      Desactivar
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          const res = await reactivarPersonalAction(m.profileId);
                          if (res.ok) recargar("Personal reactivado.");
                          else toast.error(res.error ?? "No se pudo reactivar.");
                        });
                      }}
                    >
                      <UserCheck className="size-3.5" />
                      Reactivar
                    </Button>
                  )
                ) : null}
                {!m.esDuenoPrincipal ? (
                  <Button variant="danger" size="sm" onClick={() => setEliminando(m)}>
                    <Trash2 className="size-3.5" />
                    Eliminar
                  </Button>
                ) : null}
              </div>
            </div>
          ))}

          {miembros.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <UserCog className="text-muted-foreground mx-auto mb-2 size-8" aria-hidden />
              <p className="text-muted-foreground text-sm">
                Aún no registras personal. Usa &quot;Registrar personal&quot; para dar de alta al
                primer miembro de tu equipo.
              </p>
            </div>
          ) : null}
        </div>
      </Card>

      <RegistrarPersonalDialog
        open={registrarAbierto}
        onOpenChange={setRegistrarAbierto}
        roles={roles}
        sucursales={sucursales}
      />

      {editando ? (
        <EditarPersonalDialog
          miembro={editando}
          roles={roles}
          sucursales={sucursales}
          onOpenChange={(open) => {
            if (!open) setEditando(null);
          }}
        />
      ) : null}

      {eliminando ? (
        <EliminarPersonalDialog
          miembro={eliminando}
          onOpenChange={(open) => {
            if (!open) setEliminando(null);
          }}
        />
      ) : null}
    </>
  );
}

function RegistrarPersonalDialog({
  open,
  onOpenChange,
  roles,
  sucursales,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: RolDisponible[];
  sucursales: SucursalSimple[];
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState("");
  const [confirmar, setConfirmar] = React.useState("");
  const formRef = React.useRef<HTMLFormElement>(null);

  const confirmTocado = confirmar.length > 0;
  const confirmOk = confirmTocado && confirmar === password;

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!confirmOk) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await registrarPersonalAction({}, fd);
    setPending(false);

    if (res.ok) {
      toast.success("Personal registrado. Ya puede iniciar sesión con su correo y contraseña.");
      formRef.current?.reset();
      setPassword("");
      setConfirmar("");
      onOpenChange(false);
      return;
    }
    setError(res.error ?? Object.values(res.fieldErrors ?? {})[0] ?? "No se pudo registrar.");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!pending) onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar personal</DialogTitle>
          <DialogDescription>
            Crea un acceso propio para esta persona: nombre, correo, WhatsApp, sucursal, rol y
            contraseña.
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

        <form ref={formRef} onSubmit={enviar} className="space-y-3" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="reg-nombre">Nombre</Label>
              <Input
                id="reg-nombre"
                name="nombre"
                placeholder="María"
                required
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-apellido">Apellido</Label>
              <Input
                id="reg-apellido"
                name="apellido"
                placeholder="González"
                required
                disabled={pending}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reg-email">Correo</Label>
            <Input
              id="reg-email"
              name="email"
              type="email"
              placeholder="correo@ejemplo.com"
              required
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reg-whatsapp">WhatsApp</Label>
            <Input
              id="reg-whatsapp"
              name="whatsapp"
              type="tel"
              placeholder="0412-1234567"
              required
              disabled={pending}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="reg-sucursal">Sucursal</Label>
              <select
                id="reg-sucursal"
                name="sucursal_id"
                required
                className={SELECT}
                disabled={pending}
              >
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-rol">Rol</Label>
              {/* Sin preseleccionar: que un registro apurado no le dé por
                  accidente el rol de mayor privilegio a alguien. */}
              <select
                id="reg-rol"
                name="rol_id"
                required
                defaultValue=""
                className={SELECT}
                disabled={pending}
              >
                <option value="" disabled>
                  Selecciona un rol…
                </option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reg-password">Contraseña</Label>
            <PasswordInput
              id="reg-password"
              name="password"
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
              required
            />
            <PasswordStrengthMeter password={password} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reg-confirmar">Confirmar contraseña</Label>
            <PasswordInput
              id="reg-confirmar"
              name="confirmar"
              autoComplete="new-password"
              placeholder="Repite la contraseña"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              disabled={pending}
              required
            />
            {confirmTocado && !confirmOk ? (
              <p className="text-danger text-xs">Las contraseñas no coinciden.</p>
            ) : null}
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
              {pending ? "Registrando…" : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Una fila de asignación existente dentro de "Editar": su propio select de
 * sucursal/rol (cambiarAsignacionPersonalAction) + "Quitar" (borra SOLO esta
 * fila, nunca la cuenta — quitarAsignacionSucursalAction). Confirmación en
 * dos pasos (sin modal aparte) que avisa explícitamente si es la última. */
function FilaAsignacion({
  asignacion,
  esUltima,
  roles,
  sucursales,
  disabled,
  onQuitada,
}: {
  asignacion: AsignacionPersonal;
  esUltima: boolean;
  roles: RolDisponible[];
  sucursales: SucursalSimple[];
  disabled: boolean;
  onQuitada: (asignacionId: string) => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [confirmando, setConfirmando] = React.useState(false);

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await cambiarAsignacionPersonalAction(asignacion.asignacionId, {}, fd);
    setPending(false);
    if (res.ok) toast.success("Sucursal y rol actualizados.");
    else toast.error(res.error ?? Object.values(res.fieldErrors ?? {})[0] ?? "No se pudo guardar.");
  }

  async function quitar() {
    setPending(true);
    const res = await quitarAsignacionSucursalAction(asignacion.asignacionId);
    setPending(false);
    if (res.ok) {
      toast.success("Sucursal quitada.");
      onQuitada(asignacion.asignacionId);
    } else {
      toast.error(res.error ?? "No se pudo quitar.");
    }
    setConfirmando(false);
  }

  return (
    <form onSubmit={guardar} className="flex flex-wrap items-end gap-2" noValidate>
      <div className="min-w-0 flex-1 space-y-1">
        <span className={LABEL}>Sucursal</span>
        <select
          name="sucursal_id"
          defaultValue={asignacion.sucursalId}
          required
          className={SELECT}
          disabled={disabled || pending}
        >
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <span className={LABEL}>Rol</span>
        <select
          name="rol_id"
          defaultValue={asignacion.rolId}
          required
          className={SELECT}
          disabled={disabled || pending}
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={disabled || pending}>
        Guardar
      </Button>
      {confirmando ? (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={disabled || pending}
            onClick={quitar}
          >
            {esUltima ? "Sí, dejar sin sucursales" : "Confirmar"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setConfirmando(false)}
          >
            Cancelar
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || pending}
          aria-label={`Quitar ${asignacion.sucursalNombre}`}
          onClick={() => setConfirmando(true)}
        >
          <X className="size-3.5" />
          Quitar
        </Button>
      )}
      {confirmando && esUltima ? (
        <p className="text-warning w-full text-xs">
          Es su única sucursal — se queda sin acceso a Inventario/POS hasta que le asignes otra.
        </p>
      ) : null}
    </form>
  );
}

/** Mini-formulario para sumar una sucursal MÁS a una persona ya existente
 * (agregarAsignacionPersonalAction) — junto con `FilaAsignacion`, es lo que
 * permite asignar varias sucursales desde Personal. */
function AgregarAsignacion({
  profileId,
  roles,
  sucursales,
  onAgregada,
}: {
  profileId: string;
  roles: RolDisponible[];
  sucursales: SucursalSimple[];
  onAgregada: (asignacion: AsignacionPersonal) => void;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!abierto) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setAbierto(true)}>
        <Plus className="size-3.5" />
        Agregar sucursal
      </Button>
    );
  }

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const sucursalId = fd.get("sucursal_id") as string;
    const rolId = fd.get("rol_id") as string;
    const res = await agregarAsignacionPersonalAction(profileId, {}, fd);
    setPending(false);
    if (res.ok) {
      const sucursal = sucursales.find((s) => s.id === sucursalId);
      const rol = roles.find((r) => r.id === rolId);
      toast.success("Sucursal agregada.");
      onAgregada({
        // El id real lo trae la próxima recarga del servidor; mientras
        // tanto, uno temporal alcanza para mostrar la fila en esta sesión.
        asignacionId: `temp-${sucursalId}`,
        sucursalId,
        sucursalNombre: sucursal?.nombre ?? "Sucursal",
        rolId,
        rolNombre: rol?.nombre ?? "Rol",
      });
      setAbierto(false);
    } else {
      setError(res.error ?? Object.values(res.fieldErrors ?? {})[0] ?? "No se pudo agregar.");
    }
  }

  return (
    <form onSubmit={enviar} className="border-border space-y-2 rounded-md border border-dashed p-3">
      {error ? <p className="text-danger text-xs">{error}</p> : null}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <span className={LABEL}>Sucursal</span>
          <select name="sucursal_id" required className={SELECT} disabled={pending}>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <span className={LABEL}>Rol</span>
          <select name="rol_id" required defaultValue="" className={SELECT} disabled={pending}>
            <option value="" disabled>
              Selecciona un rol…
            </option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Agregando…" : "Agregar"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function EditarPersonalDialog({
  miembro,
  roles,
  sucursales,
  onOpenChange,
}: {
  miembro: MiembroPersonal;
  roles: RolDisponible[];
  sucursales: SucursalSimple[];
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [mostrarPassword, setMostrarPassword] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [asignaciones, setAsignaciones] = React.useState(miembro.asignaciones);
  const { nombre: nombreInicial, apellido: apellidoInicial } = splitNombre(miembro.nombre);

  async function guardarDatos(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await actualizarDatosPersonalAction(miembro.profileId, {}, fd);
    setPending(false);
    if (res.ok) {
      toast.success("Datos actualizados.");
    } else {
      setError(res.error ?? Object.values(res.fieldErrors ?? {})[0] ?? "No se pudo guardar.");
    }
  }

  async function guardarPassword() {
    setError(null);
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setPending(true);
    const fd = new FormData();
    fd.set("password", password);
    const res = await establecerPasswordPersonalAction(miembro.profileId, {}, fd);
    setPending(false);
    if (res.ok) {
      toast.success("Contraseña actualizada.");
      setPassword("");
      setMostrarPassword(false);
    } else {
      setError(res.error ?? "No se pudo actualizar la contraseña.");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar a {miembro.nombre}</DialogTitle>
          <DialogDescription>{miembro.email}</DialogDescription>
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

        <form onSubmit={guardarDatos} className="space-y-3" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-nombre">Nombre</Label>
              <Input
                id="edit-nombre"
                name="nombre"
                defaultValue={nombreInicial}
                required
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-apellido">Apellido</Label>
              <Input
                id="edit-apellido"
                name="apellido"
                defaultValue={apellidoInicial}
                required
                disabled={pending}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-whatsapp">WhatsApp</Label>
            <Input
              id="edit-whatsapp"
              name="whatsapp"
              type="tel"
              defaultValue={miembro.whatsapp}
              required
              disabled={pending}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              Guardar datos
            </Button>
          </div>
        </form>

        {!miembro.esDuenoPrincipal ? (
          <div className="border-border space-y-3 border-t pt-4">
            <p className={LABEL}>Sucursales y roles</p>
            <div className="space-y-3">
              {asignaciones.map((a) => (
                <FilaAsignacion
                  key={a.asignacionId}
                  asignacion={a}
                  esUltima={asignaciones.length === 1}
                  roles={roles}
                  sucursales={sucursales}
                  disabled={pending}
                  onQuitada={(id) =>
                    setAsignaciones((prev) => prev.filter((x) => x.asignacionId !== id))
                  }
                />
              ))}
            </div>
            <AgregarAsignacion
              profileId={miembro.profileId}
              roles={roles}
              sucursales={sucursales.filter(
                (s) => !asignaciones.some((a) => a.sucursalId === s.id),
              )}
              onAgregada={(a) => setAsignaciones((prev) => [...prev, a])}
            />
          </div>
        ) : null}

        <div className="border-border space-y-2 border-t pt-4">
          <p className={LABEL}>Restablecer contraseña</p>
          {mostrarPassword ? (
            <div className="space-y-2">
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nueva contraseña"
                disabled={pending}
              />
              <PasswordStrengthMeter password={password} />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMostrarPassword(false);
                    setPassword("");
                  }}
                >
                  Cancelar
                </Button>
                <Button type="button" size="sm" onClick={guardarPassword} disabled={pending}>
                  Guardar contraseña
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMostrarPassword(true)}
            >
              <KeyRound className="size-3.5" />
              Establecer nueva contraseña
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EliminarPersonalDialog({
  miembro,
  onOpenChange,
}: {
  miembro: MiembroPersonal;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function confirmar() {
    setPending(true);
    setError(null);
    const res = await eliminarPersonalAction(miembro.profileId);
    setPending(false);
    if (res.ok) {
      toast.success("Cuenta eliminada.");
      onOpenChange(false);
    } else {
      setError(res.error ?? "No se pudo eliminar.");
    }
  }

  const sucursalesTexto = miembro.asignaciones.map((a) => a.sucursalNombre).join(", ");

  return (
    <Dialog open onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Eliminar a {miembro.nombre}</DialogTitle>
          <DialogDescription>
            Esto borra su <strong>cuenta completa</strong> y su acceso de forma permanente
            {sucursalesTexto ? (
              <>
                {" "}
                — pierde acceso a {miembro.asignaciones.length === 1 ? "su sucursal" : "sus"}{" "}
                {miembro.asignaciones.length} sucursal
                {miembro.asignaciones.length !== 1 ? "es" : ""} ({sucursalesTexto})
              </>
            ) : null}
            . No se puede deshacer. Si solo quieres revocarle el acceso temporalmente, usa
            &quot;Desactivar&quot; en vez de esto; si solo quieres quitarle UNA sucursal sin borrar
            su cuenta, usa &quot;Editar&quot;.
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
            {pending ? "Eliminando…" : "Sí, eliminar definitivamente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
