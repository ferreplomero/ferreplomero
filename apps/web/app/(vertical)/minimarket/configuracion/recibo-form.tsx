"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertTriangle, CheckCircle } from "lucide-react";
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@arkiteq/ui";
import {
  actualizarBotonWhatsappRecibo,
  actualizarEncabezadoRecibo,
  actualizarLeyendaRecibo,
} from "./actions";

interface Props {
  mostrarEncabezado: boolean;
  mostrarLeyenda: boolean;
  mostrarBotonWhatsapp: boolean;
}

function ToggleSwitch({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
        checked
          ? "bg-accent-500 focus-visible:ring-accent-400"
          : "bg-gray-200 focus-visible:ring-gray-300"
      }`}
    >
      <span
        className={`pointer-events-none absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
      <span className="sr-only">{checked ? "Activo" : "Inactivo"}</span>
    </button>
  );
}

/** Fila de toggle reutilizada por ambos ajustes del recibo (encabezado, leyenda). */
function FilaToggle({
  titulo,
  descripcion,
  activo,
  onToggle,
  label,
}: {
  titulo: string;
  descripcion: React.ReactNode;
  activo: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="text-heading text-sm font-medium">{titulo}</p>
        <p className="text-muted-foreground text-xs">{descripcion}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        <span
          className={`text-xs font-medium ${activo ? "text-accent-600" : "text-muted-foreground"}`}
        >
          {activo ? "Activo" : "Inactivo"}
        </span>
        <ToggleSwitch checked={activo} onToggle={onToggle} label={label} />
      </div>
    </div>
  );
}

/** Toggles de Configuración para los recibos: encabezado de empresa, leyenda de
 * comprobante interno y botón de enviar recibo por WhatsApp. */
export function ReciboForm({ mostrarEncabezado, mostrarLeyenda, mostrarBotonWhatsapp }: Props) {
  const [encabezadoState, encabezadoAction, encabezadoPending] = useActionState(
    actualizarEncabezadoRecibo,
    {},
  );
  const [activoEncabezado, setActivoEncabezado] = React.useState(mostrarEncabezado);

  const [leyendaState, leyendaAction, leyendaPending] = useActionState(actualizarLeyendaRecibo, {});
  const [activaLeyenda, setActivaLeyenda] = React.useState(mostrarLeyenda);
  const [avisoAbierto, setAvisoAbierto] = React.useState(false);

  const [whatsappState, whatsappAction, whatsappPending] = useActionState(
    actualizarBotonWhatsappRecibo,
    {},
  );
  const [activoWhatsapp, setActivoWhatsapp] = React.useState(mostrarBotonWhatsapp);

  function onToggleEncabezado() {
    const nuevo = !activoEncabezado;
    setActivoEncabezado(nuevo);
    const fd = new FormData();
    fd.set("mostrar_encabezado_recibo", nuevo ? "1" : "0");
    React.startTransition(() => encabezadoAction(fd));
  }

  function guardarLeyenda(nuevo: boolean) {
    setActivaLeyenda(nuevo);
    const fd = new FormData();
    fd.set("mostrar_leyenda_no_fiscal", nuevo ? "1" : "0");
    React.startTransition(() => leyendaAction(fd));
  }

  function onToggleLeyenda() {
    // Activar no necesita confirmación; desactivar sí, por la advertencia legal.
    if (activaLeyenda) {
      setAvisoAbierto(true);
    } else {
      guardarLeyenda(true);
    }
  }

  function confirmarDesactivarLeyenda() {
    setAvisoAbierto(false);
    guardarLeyenda(false);
  }

  function onToggleWhatsapp() {
    const nuevo = !activoWhatsapp;
    setActivoWhatsapp(nuevo);
    const fd = new FormData();
    fd.set("mostrar_boton_whatsapp_recibo", nuevo ? "1" : "0");
    React.startTransition(() => whatsappAction(fd));
  }

  return (
    <Card className="space-y-5 p-6">
      {encabezadoState.ok || leyendaState.ok || whatsappState.ok ? (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle className="size-4 shrink-0" />
          Ajuste del recibo guardado.
        </div>
      ) : null}
      {encabezadoState.error ? (
        <p className="text-danger text-sm">{encabezadoState.error}</p>
      ) : null}
      {leyendaState.error ? <p className="text-danger text-sm">{leyendaState.error}</p> : null}
      {whatsappState.error ? <p className="text-danger text-sm">{whatsappState.error}</p> : null}

      <FilaToggle
        titulo="Mostrar encabezado de la empresa en los recibos"
        descripcion="Activado (por defecto): el recibo muestra arriba el nombre, RIF, dirección y logo del negocio. Desactivado: el recibo solo muestra los datos de la venta (productos, montos, pago, fecha) y del cliente, sin el bloque de la empresa."
        activo={activoEncabezado}
        onToggle={onToggleEncabezado}
        label="Mostrar u ocultar el encabezado de la empresa en los recibos"
      />
      {encabezadoPending ? <p className="text-muted-foreground text-xs">Guardando…</p> : null}

      <div className="border-border border-t pt-5">
        <FilaToggle
          titulo='Mostrar leyenda "Comprobante interno de venta — no es una factura fiscal"'
          descripcion="Activada (por defecto): aclara al cliente que el recibo no es una factura fiscal. Desactivarla requiere tu confirmación porque es un resguardo legal."
          activo={activaLeyenda}
          onToggle={onToggleLeyenda}
          label='Mostrar u ocultar la leyenda "Comprobante interno de venta"'
        />
        {leyendaPending ? <p className="text-muted-foreground text-xs">Guardando…</p> : null}
      </div>

      <div className="border-border border-t pt-5">
        <FilaToggle
          titulo="Mostrar botón de enviar recibo por WhatsApp"
          descripcion="Activado (por defecto): debajo de cada recibo aparece un botón para enviárselo al cliente por WhatsApp, con un link para que vea su comprobante. Desactivado: el recibo no muestra ese botón."
          activo={activoWhatsapp}
          onToggle={onToggleWhatsapp}
          label="Mostrar u ocultar el botón de enviar recibo por WhatsApp"
        />
        {whatsappPending ? <p className="text-muted-foreground text-xs">Guardando…</p> : null}
      </div>

      <Dialog open={avisoAbierto} onOpenChange={setAvisoAbierto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="text-warning size-5 shrink-0" />
              Vas a desactivar la leyenda de comprobante interno
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-1">
              <span className="block">
                Esta leyenda aclara que tu recibo es un comprobante interno y NO una factura fiscal.
                En Venezuela, las facturas fiscales requieren cumplir con la normativa del SENIAT
                (sistemas homologados, número de control, etc.).
              </span>
              <span className="block">
                Si desactivas esta leyenda, tu recibo podría confundirse con una factura fiscal sin
                serlo, lo que puede traerte problemas legales. Te recomendamos mantenerla activa y
                consultar con tu contador.
              </span>
              <span className="text-heading block font-medium">
                ¿Deseas desactivarla de todas formas?
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAvisoAbierto(false)}>
              Mantener activa (recomendado)
            </Button>
            <Button variant="danger" onClick={confirmarDesactivarLeyenda}>
              Desactivar de todas formas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
