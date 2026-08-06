"use client";

import * as React from "react";
import { useActionState } from "react";
import { CheckCircle } from "lucide-react";
import { Button, Card } from "@arkiteq/ui";
import { actualizarParametros } from "./actions";

interface Props {
  igtfPct: number;
  ivaPct: number;
  redondeoBs: number;
  monedaBase: "USD" | "VES";
  precioMinoristaIncluyeIgtf: boolean;
  igtfActivo: boolean;
  ivaActivo: boolean;
}

const LABEL = "text-muted-foreground block text-xs font-medium uppercase tracking-wide";
const INPUT =
  "border-border bg-background text-heading w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-offset-1 focus:ring-accent-400";

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

export function ParametrosForm({
  igtfPct,
  ivaPct,
  redondeoBs,
  monedaBase,
  precioMinoristaIncluyeIgtf,
  igtfActivo,
  ivaActivo,
}: Props) {
  const [state, action, pending] = useActionState(actualizarParametros, {});
  const [igtfOn, setIgtfOn] = React.useState(igtfActivo);
  const [ivaOn, setIvaOn] = React.useState(ivaActivo);

  return (
    <Card className="space-y-5 p-6">
      {state.ok ? (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle className="size-4 shrink-0" />
          Parámetros guardados.
        </div>
      ) : null}
      {state.error ? <p className="text-danger text-sm">{state.error}</p> : null}

      <form action={action} className="space-y-5">
        {/* Valores ocultos para los toggles */}
        <input type="hidden" name="igtf_activo" value={igtfOn ? "1" : "0"} />
        <input type="hidden" name="iva_activo" value={ivaOn ? "1" : "0"} />

        {/* ── IGTF ── */}
        <div className="border-border space-y-3 rounded-lg border p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <p className="text-heading text-sm font-medium">IGTF</p>
              <p className="text-muted-foreground text-xs">
                Aplica 3 % a pagos en divisa recibida físicamente (efectivo USD, Zelle). Activo por
                defecto para bodegas venezolanas.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 pt-0.5">
              <span
                className={`text-xs font-medium ${igtfOn ? "text-accent-600" : "text-muted-foreground"}`}
              >
                {igtfOn ? "Activo" : "Inactivo"}
              </span>
              <ToggleSwitch
                checked={igtfOn}
                onToggle={() => setIgtfOn((v) => !v)}
                label="Activar o desactivar el IGTF"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="param-igtf" className={LABEL}>
              Porcentaje (%)
            </label>
            <input
              id="param-igtf"
              type="number"
              name="igtf_pct"
              defaultValue={igtfPct}
              min={0}
              max={100}
              step={0.01}
              className={INPUT}
            />
            {state.fieldErrors?.igtf_pct ? (
              <p className="text-danger text-xs">{state.fieldErrors.igtf_pct}</p>
            ) : null}
          </div>
        </div>

        {/* ── IVA ── */}
        <div className="border-border space-y-3 rounded-lg border p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <p className="text-heading text-sm font-medium">IVA</p>
              <p className="text-muted-foreground text-xs">
                Aplica sobre el subtotal de la venta. Actívalo solo si tu negocio es contribuyente
                ordinario o especial ante el SENIAT.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 pt-0.5">
              <span
                className={`text-xs font-medium ${ivaOn ? "text-accent-600" : "text-muted-foreground"}`}
              >
                {ivaOn ? "Activo" : "Inactivo"}
              </span>
              <ToggleSwitch
                checked={ivaOn}
                onToggle={() => setIvaOn((v) => !v)}
                label="Activar o desactivar el IVA"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="param-iva" className={LABEL}>
              Porcentaje (%)
            </label>
            <input
              id="param-iva"
              type="number"
              name="iva_pct"
              defaultValue={ivaPct}
              min={0}
              max={100}
              step={0.01}
              className={INPUT}
            />
          </div>
        </div>

        {/* ── Otros parámetros ── */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="param-redondeo" className={LABEL}>
              Redondeo Bs
            </label>
            <p className="text-muted-foreground text-xs">
              Múltiplo para redondear importes en bolívares (0 = sin redondeo).
            </p>
            <input
              id="param-redondeo"
              type="number"
              name="redondeo_bs"
              defaultValue={redondeoBs}
              min={0}
              step={0.5}
              className={INPUT}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="param-moneda" className={LABEL}>
              Moneda base
            </label>
            <select
              id="param-moneda"
              name="moneda_base"
              defaultValue={monedaBase}
              className={INPUT}
            >
              <option value="USD">USD (dólar americano)</option>
              <option value="VES">VES (bolívar)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input type="hidden" name="precio_minorista_incluye_igtf" value="0" />
          <input
            id="param-igtf-minorista"
            type="checkbox"
            name="precio_minorista_incluye_igtf"
            value="1"
            defaultChecked={precioMinoristaIncluyeIgtf}
            className="accent-accent-500"
          />
          <label htmlFor="param-igtf-minorista" className="cursor-pointer">
            <p className="text-heading text-sm font-medium">Precio minorista incluye IGTF</p>
            <p className="text-muted-foreground text-xs">
              El precio mostrado al cliente ya tiene el IGTF incorporado.
            </p>
          </label>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar parámetros"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
