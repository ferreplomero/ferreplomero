"use client";

import * as React from "react";
import { useActionState } from "react";
import { CheckCircle, RefreshCw } from "lucide-react";
import { Button, Card, toast } from "@arkiteq/ui";
import { actualizarMargenGlobal } from "./actions";
import { recalcularProductosMargenGlobal } from "@/app/(vertical)/minimarket/inventario/actions";

interface Props {
  margenGlobalActivo: boolean;
  margenGlobalPct: number | null;
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

export function MargenGlobalForm({ margenGlobalActivo, margenGlobalPct }: Props) {
  const [state, action, pending] = useActionState(actualizarMargenGlobal, {});
  const [activo, setActivo] = React.useState(margenGlobalActivo);
  const [recalculando, setRecalculando] = React.useState(false);

  async function onRecalcular() {
    setRecalculando(true);
    try {
      const res = await recalcularProductosMargenGlobal();
      if (res.error) {
        toast.error(res.error);
      } else if (res.actualizados && res.actualizados > 0) {
        toast.success(
          `Se actualizó el precio de ${res.actualizados} producto${res.actualizados !== 1 ? "s" : ""} que sigue${res.actualizados !== 1 ? "n" : ""} el margen global.`,
        );
      } else {
        toast.success("Los productos con margen global ya estaban al día.");
      }
    } finally {
      setRecalculando(false);
    }
  }

  return (
    <Card className="space-y-5 p-6">
      {state.ok ? (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle className="size-4 shrink-0" />
          Margen global guardado.
        </div>
      ) : null}
      {state.error ? <p className="text-danger text-sm">{state.error}</p> : null}

      <form action={action} className="space-y-4">
        <input type="hidden" name="margen_global_activo" value={activo ? "1" : "0"} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="text-heading text-sm font-medium">Margen de ganancia global</p>
            <p className="text-muted-foreground text-xs">
              Se sugiere automáticamente al crear un producto nuevo (precio = costo + este %). Si en
              un producto cambias el margen o el precio a mano, ese producto conserva su valor
              propio y deja de seguir este global.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            <span
              className={`text-xs font-medium ${activo ? "text-accent-600" : "text-muted-foreground"}`}
            >
              {activo ? "Activo" : "Inactivo"}
            </span>
            <ToggleSwitch
              checked={activo}
              onToggle={() => setActivo((v) => !v)}
              label="Activar o desactivar el margen de ganancia global"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="margen-global-pct" className={LABEL}>
            Porcentaje (%)
          </label>
          <input
            id="margen-global-pct"
            type="number"
            name="margen_global_pct"
            defaultValue={margenGlobalPct ?? 40}
            min={0}
            max={1000}
            step={0.1}
            className={INPUT}
          />
          {state.fieldErrors?.margen_global_pct ? (
            <p className="text-danger text-xs">{state.fieldErrors.margen_global_pct}</p>
          ) : null}
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar margen global"}
          </Button>
        </div>
      </form>

      <div className="border-border flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-heading text-sm font-medium">Recalcular productos existentes</p>
          <p className="text-muted-foreground text-xs">
            Cambiar el % de arriba NO toca precios ya guardados. Usa este botón cuando quieras que
            los productos que siguen el margen global adopten el nuevo %. Los de margen
            personalizado nunca se tocan.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onRecalcular}
          disabled={recalculando || !activo}
          className="shrink-0"
        >
          <RefreshCw className={`size-4 ${recalculando ? "animate-spin" : ""}`} />
          {recalculando ? "Recalculando…" : "Recalcular productos con margen global"}
        </Button>
      </div>
    </Card>
  );
}
