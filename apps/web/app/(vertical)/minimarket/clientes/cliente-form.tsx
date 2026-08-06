"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, User, WifiOff } from "lucide-react";
import { Button, Card, Input, Label, toast } from "@arkiteq/ui";
import { PowerSyncContext } from "@powersync/react";
import { SubmitButton } from "@/components/auth/submit-button";
import type { MmCliente } from "@arkiteq/db";
import type { ClienteResult } from "./actions";
import {
  actualizarClienteLocal,
  crearClienteLocal,
} from "@/lib/minimarket/powersync/registrar-cliente-local";
import { useOnline } from "@/lib/minimarket/use-online";
import { useTelefonoWhatsapp } from "@/lib/minimarket/use-telefono-whatsapp";
import { CedulaInput } from "@/components/minimarket/cedula-input";
import { CampoMontoDual } from "@/components/minimarket/shared/campo-monto-dual";

interface ClienteFormProps {
  action: (prev: ClienteResult, formData: FormData) => Promise<ClienteResult>;
  cliente?: MmCliente | null;
  tenantId: string;
  tasa: number | null;
}

export function ClienteForm({ action, cliente, tenantId, tasa }: ClienteFormProps) {
  const router = useRouter();
  const powerSyncDb = React.useContext(PowerSyncContext);
  const offline = !useOnline();
  const [state, formAction] = useActionState<ClienteResult, FormData>(action, {});
  const [activo, setActivo] = React.useState(cliente ? cliente.activo : true);
  const [guardandoLocal, setGuardandoLocal] = React.useState(false);
  const [cedula, setCedula] = React.useState(cliente?.cedula ?? "");
  const [limiteFiado, setLimiteFiado] = React.useState(
    cliente?.limite_fiado_usd != null ? cliente.limite_fiado_usd.toFixed(2) : "",
  );
  const { telefono, whatsapp, setTelefono, setWhatsapp } = useTelefonoWhatsapp(
    cliente?.telefono ?? "",
    cliente?.whatsapp ?? "",
  );

  React.useEffect(() => {
    if (state.ok && state.clienteId) {
      router.push(`/minimarket/clientes/${state.clienteId}`);
    }
  }, [state.ok, state.clienteId, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!offline) return;
    e.preventDefault();
    if (!powerSyncDb) {
      toast.error("Sin conexión y sin base local disponible. Inténtalo de nuevo en unos segundos.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const nombre = String(fd.get("nombre") ?? "").trim();
    if (nombre.length < 2) {
      toast.error("El nombre debe tener al menos 2 caracteres.");
      return;
    }
    const limiteFiadoUsd = Number(String(fd.get("limite_fiado_usd") ?? "").replace(",", "."));
    if (!Number.isFinite(limiteFiadoUsd) || limiteFiadoUsd < 0) {
      toast.error("El límite de fiado debe ser un número válido.");
      return;
    }
    const toNull = (v: FormDataEntryValue | null) => {
      const s = typeof v === "string" ? v.trim() : "";
      return s.length > 0 ? s : null;
    };
    const input = {
      tenantId,
      nombre,
      cedula: toNull(fd.get("cedula")),
      telefono: toNull(fd.get("telefono")),
      whatsapp: toNull(fd.get("whatsapp")),
      direccion: toNull(fd.get("direccion")),
      limiteFiadoUsd,
      notas: toNull(fd.get("notas")),
      activo,
    };

    setGuardandoLocal(true);
    try {
      if (cliente) {
        await actualizarClienteLocal(powerSyncDb, cliente.id, input);
      } else {
        await crearClienteLocal(powerSyncDb, input);
      }
      toast.success("Cliente guardado en este dispositivo. Se sincronizará al conectarte.");
      router.back();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `No se pudo guardar: ${err.message}`
          : "No se pudo guardar el cliente.",
      );
    } finally {
      setGuardandoLocal(false);
    }
  }

  const fe = state.fieldErrors ?? {};

  return (
    <Card className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <span className="bg-accent-500/12 text-accent-600 inline-flex size-11 items-center justify-center rounded-xl">
          <User className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-heading font-medium">{cliente ? "Editar cliente" : "Nuevo cliente"}</p>
          <p className="text-muted-foreground text-sm">
            {cliente
              ? "Actualiza los datos del cliente."
              : "Registra un cliente para fiarle y llevar su cuenta."}
          </p>
        </div>
      </div>

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

      <form action={formAction} onSubmit={onSubmit} className="space-y-5" noValidate>
        {/* activo como campo oculto controlado */}
        <input type="hidden" name="activo" value={String(activo)} />

        {/* Nombre */}
        <div className="space-y-1.5">
          <Label htmlFor="nombre">
            Nombre <span className="text-danger">*</span>
          </Label>
          <Input
            id="nombre"
            name="nombre"
            placeholder="María González"
            defaultValue={cliente?.nombre ?? ""}
            required
            aria-describedby={fe.nombre ? "nombre-error" : undefined}
          />
          {fe.nombre ? (
            <p id="nombre-error" className="text-danger text-xs">
              {fe.nombre}
            </p>
          ) : null}
        </div>

        {/* Cédula y Teléfono */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cedula">Cédula (opcional)</Label>
            <CedulaInput id="cedula" name="cedula" value={cedula} onChange={setCedula} />
            {fe.cedula ? (
              <p id="cedula-error" className="text-danger text-xs">
                {fe.cedula}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="telefono">Teléfono (opcional)</Label>
            <Input
              id="telefono"
              name="telefono"
              type="tel"
              placeholder="0412-1234567"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </div>
        </div>

        {/* WhatsApp y Límite */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="whatsapp">WhatsApp (opcional)</Label>
            <Input
              id="whatsapp"
              name="whatsapp"
              type="tel"
              placeholder="0412-1234567"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Se copia del teléfono automáticamente; edítalo si es distinto.
            </p>
          </div>

          <div className="space-y-1.5">
            <CampoMontoDual
              id="limite_fiado_usd"
              label={
                <>
                  Límite de fiado (USD) <span className="text-danger">*</span>
                </>
              }
              name="limite_fiado_usd"
              valorUsd={limiteFiado}
              onChangeUsd={setLimiteFiado}
              tasa={tasa}
              required
              ariaDescribedby={fe.limite_fiado_usd ? "limite-error" : undefined}
            />
            {fe.limite_fiado_usd ? (
              <p id="limite-error" className="text-danger text-xs">
                {fe.limite_fiado_usd}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">Monto máximo que se le puede fiar.</p>
            )}
          </div>
        </div>

        {/* Dirección */}
        <div className="space-y-1.5">
          <Label htmlFor="direccion">Dirección (opcional)</Label>
          <Input
            id="direccion"
            name="direccion"
            placeholder="Calle 5, Casa 12, Urb. Los Pinos"
            defaultValue={cliente?.direccion ?? ""}
          />
        </div>

        {/* Notas */}
        <div className="space-y-1.5">
          <Label htmlFor="notas">Notas (opcional)</Label>
          <textarea
            id="notas"
            name="notas"
            rows={3}
            placeholder="Observaciones sobre el cliente..."
            defaultValue={cliente?.notas ?? ""}
            className="border-border bg-background focus-visible:ring-ring w-full resize-none rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
          />
        </div>

        {/* Estado activo */}
        <button
          type="button"
          role="switch"
          aria-checked={activo}
          onClick={() => setActivo((v) => !v)}
          className={`flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors ${
            activo ? "border-accent-300 bg-accent-50/40" : "bg-surface"
          }`}
        >
          <span
            className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
              activo ? "border-accent-500 bg-accent-500" : "border-border bg-white"
            }`}
          >
            {activo ? <span className="size-2 rounded-full bg-white" /> : null}
          </span>
          <span>
            <span className="text-heading block text-sm font-medium">
              {activo ? "Cliente activo" : "Cliente inactivo"}
            </span>
            <span className="text-muted-foreground text-xs">
              Los clientes inactivos no aparecen en el POS para fiar.
            </span>
          </span>
        </button>

        <div className="grid grid-cols-2 gap-3 pt-2 sm:flex sm:justify-end">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
          <SubmitButton disabled={guardandoLocal}>
            {guardandoLocal ? "Guardando…" : cliente ? "Guardar cambios" : "Crear cliente"}
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}
