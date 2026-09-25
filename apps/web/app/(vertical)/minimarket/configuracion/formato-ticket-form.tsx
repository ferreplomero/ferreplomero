"use client";

import * as React from "react";
import { useActionState } from "react";
import { CheckCircle } from "lucide-react";
import { Card, Input } from "@arkiteq/ui";
import {
  TICKET_ANCHO_MAX,
  TICKET_ANCHO_MIN,
  type FormatoTicket,
} from "@/lib/minimarket/recibo-formato";
import { actualizarFormatoTicket } from "./actions";
import { ToggleSwitch } from "./recibo-form";

const ANCHOS_PRESET = [
  { mm: 58, label: "58 mm (predeterminado — tiqueras térmicas estándar)" },
  { mm: 80, label: "80 mm" },
] as const;

const FUENTES = [
  { pct: 90, label: "Pequeña (90 %)" },
  { pct: 100, label: "Normal (100 %)" },
  { pct: 115, label: "Grande (115 %)" },
  { pct: 130, label: "Extra grande (130 %)" },
] as const;

function Opcion({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={activa}
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
        activa
          ? "border-accent-500 bg-accent-50 text-accent-700 font-medium"
          : "border-border hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}

/** Configuración → Recibos de venta → Formato de ticket (impresora térmica).
 * Guarda al cambiar cada opción. */
export function FormatoTicketForm({ inicial }: { inicial: FormatoTicket }) {
  const [state, action, pending] = useActionState(actualizarFormatoTicket, {});
  const [formato, setFormato] = React.useState<FormatoTicket>(inicial);
  const esPreset = ANCHOS_PRESET.some((p) => p.mm === inicial.anchoMm);
  const [personalizado, setPersonalizado] = React.useState(!esPreset);
  const [anchoTexto, setAnchoTexto] = React.useState(String(inicial.anchoMm));
  const [errorAncho, setErrorAncho] = React.useState<string | null>(null);

  function guardar(nuevo: FormatoTicket) {
    setFormato(nuevo);
    const fd = new FormData();
    fd.set("anchoMm", String(nuevo.anchoMm));
    fd.set("fuentePct", String(nuevo.fuentePct));
    fd.set("mostrarLogo", nuevo.mostrarLogo ? "1" : "0");
    fd.set("mostrarDatosNegocio", nuevo.mostrarDatosNegocio ? "1" : "0");
    React.startTransition(() => action(fd));
  }

  function guardarAnchoPersonalizado() {
    const n = Number(anchoTexto.replace(",", "."));
    if (!Number.isFinite(n) || n < TICKET_ANCHO_MIN || n > TICKET_ANCHO_MAX) {
      setErrorAncho(`Indica un ancho entre ${TICKET_ANCHO_MIN} y ${TICKET_ANCHO_MAX} mm.`);
      return;
    }
    setErrorAncho(null);
    if (n !== formato.anchoMm) guardar({ ...formato, anchoMm: n });
  }

  return (
    <Card className="space-y-5 p-6">
      <div>
        <p className="text-heading text-sm font-medium">Formato de ticket (impresora térmica)</p>
        <p className="text-muted-foreground text-xs">
          Se usa en el botón &quot;Imprimir ticket (térmica)&quot; del recibo. No cambia ningún
          monto ni el recibo en tamaño carta.
        </p>
      </div>

      {state.ok && !pending ? (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle className="size-4 shrink-0" />
          Guardado.
        </div>
      ) : null}
      {state.error ? <p className="text-danger text-sm">{state.error}</p> : null}

      <fieldset className="space-y-2">
        <legend className="text-heading mb-2 text-sm font-medium">Ancho del papel</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {ANCHOS_PRESET.map((p) => (
            <Opcion
              key={p.mm}
              activa={!personalizado && formato.anchoMm === p.mm}
              onClick={() => {
                setPersonalizado(false);
                setErrorAncho(null);
                setAnchoTexto(String(p.mm));
                guardar({ ...formato, anchoMm: p.mm });
              }}
            >
              {p.label}
            </Opcion>
          ))}
          <Opcion activa={personalizado} onClick={() => setPersonalizado(true)}>
            Personalizado
          </Opcion>
        </div>
        {personalizado ? (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="decimal"
              min={TICKET_ANCHO_MIN}
              max={TICKET_ANCHO_MAX}
              aria-label="Ancho personalizado en milímetros"
              className="w-28"
              value={anchoTexto}
              onChange={(e) => setAnchoTexto(e.target.value)}
              onBlur={guardarAnchoPersonalizado}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  guardarAnchoPersonalizado();
                }
              }}
            />
            <span className="text-muted-foreground text-sm">
              mm ({TICKET_ANCHO_MIN}–{TICKET_ANCHO_MAX})
            </span>
          </div>
        ) : null}
        {errorAncho ? <p className="text-danger text-xs">{errorAncho}</p> : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-heading mb-2 text-sm font-medium">Tamaño de letra</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FUENTES.map((f) => (
            <Opcion
              key={f.pct}
              activa={formato.fuentePct === f.pct}
              onClick={() => guardar({ ...formato, fuentePct: f.pct })}
            >
              {f.label}
            </Opcion>
          ))}
        </div>
      </fieldset>

      <div className="border-border space-y-4 border-t pt-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-heading text-sm">Mostrar logo en el ticket</p>
          <ToggleSwitch
            checked={formato.mostrarLogo}
            onToggle={() => guardar({ ...formato, mostrarLogo: !formato.mostrarLogo })}
            label="Mostrar u ocultar el logo en el ticket"
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <p className="text-heading text-sm">Mostrar datos del negocio (nombre, RIF, dirección)</p>
          <ToggleSwitch
            checked={formato.mostrarDatosNegocio}
            onToggle={() =>
              guardar({ ...formato, mostrarDatosNegocio: !formato.mostrarDatosNegocio })
            }
            label="Mostrar u ocultar los datos del negocio en el ticket"
          />
        </div>
      </div>
      {pending ? <p className="text-muted-foreground text-xs">Guardando…</p> : null}
    </Card>
  );
}
