"use client";

import * as React from "react";
import { useActionState } from "react";
import { Check, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { Button, Card, cn } from "@arkiteq/ui";
import type { MmCuentaBancaria } from "@arkiteq/db";
import type { MetodoConCuenta } from "@/lib/minimarket/bancos";
import {
  actualizarCuentaBancaria,
  crearCuentaBancaria,
  eliminarCuentaBancaria,
  marcarCuentaPredeterminada,
} from "./cuentas-actions";

interface Props {
  metodo: MetodoConCuenta;
  cuentas: MmCuentaBancaria[];
}

const LABEL = "text-muted-foreground block text-xs font-medium uppercase tracking-wide";
const INPUT =
  "border-border bg-background text-heading w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-offset-1 focus:ring-accent-400";

/** Campos que aplican a cada método — pago móvil pide teléfono, transferencia
 * y Cashea piden número de cuenta (Cashea deposita a una cuenta bancaria
 * normal, igual que una transferencia), tarjeta solo necesita a nombre de
 * quién está el punto. Zelle no entra aquí: usa su propio set de campos
 * (nombre/apellido/cédula/correo), ver `ZELLE_CAMPOS` y las ramas `esZelle`
 * más abajo. */
const CAMPOS_POR_METODO: Record<Exclude<MetodoConCuenta, "zelle">, ("telefono" | "cuenta")[]> = {
  pago_movil: ["telefono"],
  transferencia: ["cuenta"],
  tarjeta: [],
  cashea: ["cuenta"],
};

function NuevaCuentaForm({ metodo, onDone }: { metodo: MetodoConCuenta; onDone: () => void }) {
  const [state, action, pending] = useActionState(crearCuentaBancaria, {});
  const ref = React.useRef<HTMLFormElement>(null);
  const esZelle = metodo === "zelle";
  const campos = esZelle ? [] : CAMPOS_POR_METODO[metodo];

  React.useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      onDone();
    }
    // onDone es estable (setState de useState) — no hace falta listarla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  const idBase = `cuenta-nueva-${metodo}`;

  return (
    <Card className="space-y-3 p-3">
      <form action={action} ref={ref} className="space-y-3">
        <input type="hidden" name="metodo" value={metodo} />
        {state.error ? <p className="text-danger text-xs">{state.error}</p> : null}
        {esZelle ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor={`${idBase}-nombre`} className={LABEL}>
                Nombre <span className="text-danger">*</span>
              </label>
              <input
                id={`${idBase}-nombre`}
                name="nombre"
                required
                maxLength={80}
                placeholder="ej. Jeramine"
                className={cn(INPUT, state.fieldErrors?.nombre && "border-red-400")}
              />
              {state.fieldErrors?.nombre ? (
                <p className="text-danger text-xs">{state.fieldErrors.nombre}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <label htmlFor={`${idBase}-apellido`} className={LABEL}>
                Apellido <span className="text-danger">*</span>
              </label>
              <input
                id={`${idBase}-apellido`}
                name="apellido"
                required
                maxLength={80}
                placeholder="ej. Rojas"
                className={cn(INPUT, state.fieldErrors?.apellido && "border-red-400")}
              />
              {state.fieldErrors?.apellido ? (
                <p className="text-danger text-xs">{state.fieldErrors.apellido}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <label htmlFor={`${idBase}-correo`} className={LABEL}>
                Correo de Zelle <span className="text-danger">*</span>
              </label>
              <input
                id={`${idBase}-correo`}
                name="correo"
                type="email"
                required
                maxLength={160}
                placeholder="ej. pagos@ejemplo.com"
                className={cn(INPUT, state.fieldErrors?.correo && "border-red-400")}
              />
              {state.fieldErrors?.correo ? (
                <p className="text-danger text-xs">{state.fieldErrors.correo}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <label htmlFor={`${idBase}-cedula`} className={LABEL}>
                Cédula
              </label>
              <input
                id={`${idBase}-cedula`}
                name="cedula"
                maxLength={30}
                placeholder="ej. V-12345678"
                className={INPUT}
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor={`${idBase}-banco`} className={LABEL}>
                Banco <span className="text-danger">*</span>
              </label>
              <input
                id={`${idBase}-banco`}
                name="banco"
                required
                maxLength={120}
                placeholder="ej. Banco de Venezuela"
                className={cn(INPUT, state.fieldErrors?.banco && "border-red-400")}
              />
              {state.fieldErrors?.banco ? (
                <p className="text-danger text-xs">{state.fieldErrors.banco}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <label htmlFor={`${idBase}-titular`} className={LABEL}>
                Titular <span className="text-danger">*</span>
              </label>
              <input
                id={`${idBase}-titular`}
                name="titular"
                required
                maxLength={160}
                placeholder="Nombre completo"
                className={cn(INPUT, state.fieldErrors?.titular && "border-red-400")}
              />
              {state.fieldErrors?.titular ? (
                <p className="text-danger text-xs">{state.fieldErrors.titular}</p>
              ) : null}
            </div>
            {campos.includes("telefono") ? (
              <div className="space-y-1">
                <label htmlFor={`${idBase}-telefono`} className={LABEL}>
                  Número de teléfono
                </label>
                <input
                  id={`${idBase}-telefono`}
                  name="telefono"
                  maxLength={30}
                  placeholder="ej. 0412-1234567"
                  className={INPUT}
                />
              </div>
            ) : null}
            {campos.includes("cuenta") ? (
              <div className="space-y-1">
                <label htmlFor={`${idBase}-cuenta`} className={LABEL}>
                  Número de cuenta
                </label>
                <input
                  id={`${idBase}-cuenta`}
                  name="cuenta"
                  maxLength={40}
                  placeholder="ej. 01020123456789012345"
                  className={INPUT}
                />
              </div>
            ) : null}
            <div className="space-y-1">
              <label htmlFor={`${idBase}-rif`} className={LABEL}>
                Cédula o RIF del titular
              </label>
              <input
                id={`${idBase}-rif`}
                name="rif"
                maxLength={30}
                placeholder="ej. J-12345678-9"
                className={INPUT}
              />
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Guardando…" : "Guardar cuenta"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}

function FilaCuenta({ cuenta, metodo }: { cuenta: MmCuentaBancaria; metodo: MetodoConCuenta }) {
  const [editando, setEditando] = React.useState(false);
  const boundUpdate = actualizarCuentaBancaria.bind(null, cuenta.id);
  const [editState, editAction, editPending] = useActionState(boundUpdate, {});
  const [predState, predAction, predPending] = useActionState(
    async (_prev: { ok?: boolean; error?: string }, fd: FormData) => marcarCuentaPredeterminada(fd),
    {},
  );
  const [delState, delAction, delPending] = useActionState(
    async (_prev: { ok?: boolean; error?: string }, fd: FormData) => eliminarCuentaBancaria(fd),
    {},
  );

  React.useEffect(() => {
    if (editState.ok) setEditando(false);
  }, [editState.ok]);

  const esZelle = metodo === "zelle";
  const campos = esZelle ? [] : CAMPOS_POR_METODO[metodo];
  const idBase = `cuenta-edit-${cuenta.id}`;
  // `titular` guarda "Nombre Apellido" combinado (ver cuentas-actions.ts) — al
  // editar se separa de nuevo en dos campos por mejor UX, mismo criterio que
  // al crear. Si el titular no tiene espacio, todo queda en "nombre".
  const [nombreDefault, ...apellidoParts] = cuenta.titular.split(" ");
  const apellidoDefault = apellidoParts.join(" ");

  return (
    <div className="px-4 py-3">
      {editando ? (
        <form action={editAction} className="space-y-3">
          {esZelle ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor={`${idBase}-nombre`} className={LABEL}>
                  Nombre
                </label>
                <input
                  id={`${idBase}-nombre`}
                  name="nombre"
                  defaultValue={nombreDefault}
                  required
                  maxLength={80}
                  className={INPUT}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${idBase}-apellido`} className={LABEL}>
                  Apellido
                </label>
                <input
                  id={`${idBase}-apellido`}
                  name="apellido"
                  defaultValue={apellidoDefault}
                  required
                  maxLength={80}
                  className={INPUT}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${idBase}-correo`} className={LABEL}>
                  Correo de Zelle
                </label>
                <input
                  id={`${idBase}-correo`}
                  name="correo"
                  type="email"
                  defaultValue={cuenta.correo ?? ""}
                  required
                  maxLength={160}
                  className={INPUT}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${idBase}-cedula`} className={LABEL}>
                  Cédula
                </label>
                <input
                  id={`${idBase}-cedula`}
                  name="cedula"
                  defaultValue={cuenta.rif ?? ""}
                  maxLength={30}
                  className={INPUT}
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor={`${idBase}-banco`} className={LABEL}>
                  Banco
                </label>
                <input
                  id={`${idBase}-banco`}
                  name="banco"
                  defaultValue={cuenta.banco}
                  required
                  maxLength={120}
                  className={INPUT}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${idBase}-titular`} className={LABEL}>
                  Titular
                </label>
                <input
                  id={`${idBase}-titular`}
                  name="titular"
                  defaultValue={cuenta.titular}
                  required
                  maxLength={160}
                  className={INPUT}
                />
              </div>
              {campos.includes("telefono") ? (
                <div className="space-y-1">
                  <label htmlFor={`${idBase}-telefono`} className={LABEL}>
                    Número de teléfono
                  </label>
                  <input
                    id={`${idBase}-telefono`}
                    name="telefono"
                    defaultValue={cuenta.telefono ?? ""}
                    maxLength={30}
                    className={INPUT}
                  />
                </div>
              ) : null}
              {campos.includes("cuenta") ? (
                <div className="space-y-1">
                  <label htmlFor={`${idBase}-cuenta`} className={LABEL}>
                    Número de cuenta
                  </label>
                  <input
                    id={`${idBase}-cuenta`}
                    name="cuenta"
                    defaultValue={cuenta.cuenta ?? ""}
                    maxLength={40}
                    className={INPUT}
                  />
                </div>
              ) : null}
              <div className="space-y-1">
                <label htmlFor={`${idBase}-rif`} className={LABEL}>
                  Cédula o RIF del titular
                </label>
                <input
                  id={`${idBase}-rif`}
                  name="rif"
                  defaultValue={cuenta.rif ?? ""}
                  maxLength={30}
                  className={INPUT}
                />
              </div>
            </div>
          )}
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-heading flex items-center gap-1.5 text-sm font-medium">
              {cuenta.banco}
              {cuenta.predeterminada ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                  <Star className="size-3 fill-amber-500 text-amber-500" />
                  Predeterminada
                </span>
              ) : null}
            </p>
            <p className="text-muted-foreground text-xs">
              {cuenta.titular}
              {cuenta.telefono ? ` · ${cuenta.telefono}` : ""}
              {cuenta.cuenta ? ` · ${cuenta.cuenta}` : ""}
              {cuenta.rif ? ` · ${cuenta.rif}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!cuenta.predeterminada ? (
              <form action={predAction}>
                <input type="hidden" name="id" value={cuenta.id} />
                <button
                  type="submit"
                  disabled={predPending}
                  className="text-muted-foreground hover:text-heading rounded px-2 py-1 text-xs transition-colors disabled:opacity-50"
                >
                  Hacer predeterminada
                </button>
              </form>
            ) : null}
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="text-muted-foreground hover:text-heading rounded p-1.5 transition-colors"
              aria-label={`Editar ${cuenta.banco}`}
            >
              <Pencil className="size-3.5" />
            </button>
            <form action={delAction}>
              <input type="hidden" name="id" value={cuenta.id} />
              <button
                type="submit"
                disabled={delPending}
                onClick={(e) => {
                  if (!window.confirm(`¿Eliminar la cuenta de ${cuenta.banco}?`))
                    e.preventDefault();
                }}
                className="text-muted-foreground hover:text-danger rounded p-1.5 transition-colors"
                aria-label={`Eliminar ${cuenta.banco}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </form>
          </div>
        </div>
      )}
      {predState.error ? <p className="text-danger mt-1 text-xs">{predState.error}</p> : null}
      {delState.error ? <p className="text-danger mt-1 text-xs">{delState.error}</p> : null}
    </div>
  );
}

export function CuentasBancariasPanel({ metodo, cuentas }: Props) {
  const [agregando, setAgregando] = React.useState(false);

  return (
    <div className="border-border mt-3 space-y-3 border-t pt-3">
      <p className="text-heading text-sm font-medium">Cuentas</p>
      {cuentas.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <div className="divide-border divide-y">
            {cuentas.map((c) => (
              <FilaCuenta key={c.id} cuenta={c} metodo={metodo} />
            ))}
          </div>
        </Card>
      ) : (
        <p className="text-muted-foreground text-xs">
          Aún no has registrado ninguna cuenta para este método.
        </p>
      )}
      {agregando ? (
        <NuevaCuentaForm metodo={metodo} onDone={() => setAgregando(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setAgregando(true)}
          className="text-accent-600 hover:text-accent-700 flex items-center gap-1.5 text-sm font-medium"
        >
          <Plus className="size-4" />
          {metodo === "zelle" ? "Agregar otro correo" : "Agregar otro banco"}
        </button>
      )}
    </div>
  );
}
