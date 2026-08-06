"use client";

import { useActionState } from "react";
import { CheckCircle } from "lucide-react";
import { Button, Card } from "@arkiteq/ui";
import { ZONAS_HORARIAS } from "@/lib/minimarket/timezone";
import { actualizarNegocio } from "./actions";

interface Props {
  nombre: string;
  rif: string;
  direccion: string;
  telefono: string;
  timezone: string;
}

const LABEL = "text-muted-foreground block text-xs font-medium uppercase tracking-wide";
const INPUT =
  "border-border bg-background text-heading w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-offset-1 focus:ring-accent-400";

export function NegocioForm({ nombre, rif, direccion, telefono, timezone }: Props) {
  const [state, action, pending] = useActionState(actualizarNegocio, {});

  return (
    <Card className="space-y-5 p-6">
      {state.ok ? (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle className="size-4 shrink-0" />
          Configuración guardada.
        </div>
      ) : null}
      {state.error ? <p className="text-danger text-sm">{state.error}</p> : null}

      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="cfg-nombre" className={LABEL}>
            Nombre comercial <span className="text-danger">*</span>
          </label>
          <input
            id="cfg-nombre"
            name="nombre_comercial"
            defaultValue={nombre}
            required
            maxLength={160}
            placeholder="ej. Minimarket El Palmar"
            className={INPUT}
          />
          {state.fieldErrors?.nombre_comercial ? (
            <p className="text-danger text-xs">{state.fieldErrors.nombre_comercial}</p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="cfg-rif" className={LABEL}>
              RIF
            </label>
            <input
              id="cfg-rif"
              name="rif"
              defaultValue={rif}
              maxLength={20}
              placeholder="ej. J-12345678-9"
              className={INPUT}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="cfg-telefono" className={LABEL}>
              Teléfono
            </label>
            <input
              id="cfg-telefono"
              name="telefono"
              defaultValue={telefono}
              maxLength={30}
              placeholder="ej. 0412-1234567"
              className={INPUT}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="cfg-direccion" className={LABEL}>
            Dirección
          </label>
          <textarea
            id="cfg-direccion"
            name="direccion"
            defaultValue={direccion}
            rows={2}
            maxLength={400}
            placeholder="Dirección del negocio principal"
            className={INPUT + " resize-none"}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="cfg-timezone" className={LABEL}>
            Zona horaria
          </label>
          <select id="cfg-timezone" name="timezone" defaultValue={timezone} className={INPUT}>
            {ZONAS_HORARIAS.map((z) => (
              <option key={z.value} value={z.value}>
                {z.label}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">
            Todas las fechas y horas se muestran en esta zona horaria.
          </p>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar datos del negocio"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
