"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Truck, WifiOff } from "lucide-react";
import { Button, Card, Input, Label, toast } from "@arkiteq/ui";
import { PowerSyncContext } from "@powersync/react";
import { SubmitButton } from "@/components/auth/submit-button";
import type { MmProveedor } from "@arkiteq/db";
import type { ProveedorResult } from "../compras/actions";
import {
  actualizarProveedorLocal,
  crearProveedorLocal,
} from "@/lib/minimarket/powersync/registrar-compra-local";
import { useOnline } from "@/lib/minimarket/use-online";
import { useTelefonoWhatsapp } from "@/lib/minimarket/use-telefono-whatsapp";

interface ProveedorFormProps {
  action: (prev: ProveedorResult, formData: FormData) => Promise<ProveedorResult>;
  proveedor?: MmProveedor | null;
  tenantId: string;
  /**
   * Si se provee, se llama al crear con éxito EN VEZ de navegar al detalle
   * del proveedor — usado por quien reutiliza este formulario fuera de
   * Proveedores (ej. el modal de "Nuevo proveedor" en Compras) para
   * seleccionarlo de inmediato sin abandonar la pantalla actual. Sin este
   * prop, el comportamiento es exactamente el de siempre (navega al detalle).
   */
  onDone?: (creado: { id: string; nombre: string }) => void;
}

export function ProveedorForm({ action, proveedor, tenantId, onDone }: ProveedorFormProps) {
  const router = useRouter();
  const powerSyncDb = React.useContext(PowerSyncContext);
  const offline = !useOnline();
  const [state, formAction] = useActionState<ProveedorResult, FormData>(action, {});
  const [activo, setActivo] = React.useState(proveedor ? proveedor.activo : true);
  const [guardandoLocal, setGuardandoLocal] = React.useState(false);
  const { telefono, whatsapp, setTelefono, setWhatsapp } = useTelefonoWhatsapp(
    proveedor?.telefono ?? "",
    proveedor?.whatsapp ?? "",
  );
  const [nombreActual, setNombreActual] = React.useState(proveedor?.nombre ?? "");

  React.useEffect(() => {
    if (state.ok && state.proveedorId) {
      if (onDone) onDone({ id: state.proveedorId, nombre: nombreActual.trim() });
      else router.push(`/minimarket/proveedores/${state.proveedorId}`);
    }
    // Solo debe reaccionar a que el guardado terminó bien, no a cada tecleo del nombre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, state.proveedorId, router, onDone]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!offline) return;
    e.preventDefault();
    if (!powerSyncDb) {
      toast.error("Sin conexión y sin base local disponible. Inténtalo de nuevo en unos segundos.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const nombre = String(fd.get("nombre") ?? "").trim();
    if (nombre.length < 1) {
      toast.error("El nombre es obligatorio.");
      return;
    }
    const toNull = (v: FormDataEntryValue | null) => {
      const s = typeof v === "string" ? v.trim() : "";
      return s.length > 0 ? s : null;
    };
    const input = {
      tenantId,
      nombre,
      contacto: toNull(fd.get("contacto")),
      telefono: toNull(fd.get("telefono")),
      whatsapp: toNull(fd.get("whatsapp")),
      notas: toNull(fd.get("notas")),
      activo,
    };

    setGuardandoLocal(true);
    try {
      if (proveedor) {
        await actualizarProveedorLocal(powerSyncDb, proveedor.id, input);
        toast.success("Proveedor guardado en este dispositivo. Se sincronizará al conectarte.");
        if (onDone) onDone({ id: proveedor.id, nombre });
        else router.back();
      } else {
        const { proveedorId } = await crearProveedorLocal(powerSyncDb, input);
        toast.success("Proveedor guardado en este dispositivo. Se sincronizará al conectarte.");
        if (onDone) onDone({ id: proveedorId, nombre });
        else router.back();
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `No se pudo guardar: ${err.message}`
          : "No se pudo guardar el proveedor.",
      );
    } finally {
      setGuardandoLocal(false);
    }
  }

  const fe = state.fieldErrors ?? {};

  return (
    <Card className="mx-auto max-w-xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <span className="bg-accent-500/12 text-accent-600 inline-flex size-11 items-center justify-center rounded-xl">
          <Truck className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-heading font-medium">
            {proveedor ? "Editar proveedor" : "Nuevo proveedor"}
          </p>
          <p className="text-muted-foreground text-sm">
            {proveedor
              ? "Actualiza los datos del proveedor."
              : "Registra un proveedor para asociarlo a compras y productos."}
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

      <form action={formAction} onSubmit={onSubmit} className="space-y-4" noValidate>
        <input type="hidden" name="activo" value={String(activo)} />

        {/* Nombre */}
        <div className="space-y-1.5">
          <Label htmlFor="nombre">
            Nombre del proveedor <span className="text-danger">*</span>
          </Label>
          <Input
            id="nombre"
            name="nombre"
            placeholder="Distribuidora El Buen Precio"
            value={nombreActual}
            onChange={(e) => setNombreActual(e.target.value)}
            required
          />
          {fe.nombre ? <p className="text-danger text-xs">{fe.nombre}</p> : null}
        </div>

        {/* Persona de contacto */}
        <div className="space-y-1.5">
          <Label htmlFor="contacto">Contacto (opcional)</Label>
          <Input
            id="contacto"
            name="contacto"
            placeholder="Nombre de la persona de contacto"
            defaultValue={proveedor?.contacto ?? ""}
          />
        </div>

        {/* Teléfono y WhatsApp */}
        <div className="grid gap-4 sm:grid-cols-2">
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
          <div className="space-y-1.5">
            <Label htmlFor="whatsapp">WhatsApp (opcional)</Label>
            <Input
              id="whatsapp"
              name="whatsapp"
              type="tel"
              placeholder="Se copia del teléfono"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
            />
          </div>
        </div>

        {/* Notas */}
        <div className="space-y-1.5">
          <Label htmlFor="notas">Notas (opcional)</Label>
          <textarea
            id="notas"
            name="notas"
            rows={3}
            placeholder="Condiciones de pago, días de entrega, etc."
            defaultValue={proveedor?.notas ?? ""}
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
              {activo ? "Proveedor activo" : "Proveedor inactivo"}
            </span>
            <span className="text-muted-foreground text-xs">
              Los proveedores inactivos no aparecen al registrar compras.
            </span>
          </span>
        </button>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
          <SubmitButton disabled={guardandoLocal} className="w-full sm:w-auto">
            {guardandoLocal ? "Guardando…" : proveedor ? "Guardar cambios" : "Crear proveedor"}
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}
