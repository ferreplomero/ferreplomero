"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Landmark } from "lucide-react";
import { Button, Card, Input, Label } from "@arkiteq/ui";
import { SubmitButton } from "@/components/auth/submit-button";
import { CampoMontoDual } from "@/components/minimarket/shared/campo-monto-dual";
import type { DeudaConSaldo } from "@/lib/minimarket/data/deudas";
import type { DeudaResult } from "./actions";

interface Categoria {
  id: string;
  nombre: string;
}

interface DeudaFormProps {
  action: (prev: DeudaResult, formData: FormData) => Promise<DeudaResult>;
  deuda?: DeudaConSaldo | null;
  categorias: Categoria[];
  tasa: number;
  hoy: string;
}

const SELECT_CLASS =
  "border-border bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2";

export function DeudaForm({ action, deuda, categorias, tasa, hoy }: DeudaFormProps) {
  const router = useRouter();
  const [state, formAction] = useActionState<DeudaResult, FormData>(action, {});
  const [montoUsd, setMontoUsd] = React.useState(deuda ? String(deuda.monto_usd) : "");

  React.useEffect(() => {
    if (state.ok && state.deudaId) {
      router.push(`/minimarket/deudas/${state.deudaId}`);
    }
  }, [state.ok, state.deudaId, router]);

  const fe = state.fieldErrors ?? {};

  return (
    <Card className="mx-auto max-w-xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <span className="bg-accent-500/12 text-accent-600 inline-flex size-11 items-center justify-center rounded-xl">
          <Landmark className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-heading font-medium">{deuda ? "Editar deuda" : "Nueva deuda"}</p>
          <p className="text-muted-foreground text-sm">
            {deuda
              ? "Actualiza los datos de esta deuda."
              : "Registra un préstamo, servicio u otra deuda del negocio."}
          </p>
        </div>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="bg-danger/10 text-danger flex items-center gap-2 rounded-md px-3 py-2.5 text-sm"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      <form action={formAction} className="space-y-4" noValidate>
        {/* Descripción */}
        <div className="space-y-1.5">
          <Label htmlFor="descripcion">
            Descripción <span className="text-danger">*</span>
          </Label>
          <Input
            id="descripcion"
            name="descripcion"
            placeholder="ej. Préstamo para comprar nevera nueva"
            defaultValue={deuda?.descripcion ?? ""}
            required
          />
          {fe.descripcion ? <p className="text-danger text-xs">{fe.descripcion}</p> : null}
        </div>

        {/* Acreedor */}
        <div className="space-y-1.5">
          <Label htmlFor="acreedor">
            Acreedor (a quién le debe) <span className="text-danger">*</span>
          </Label>
          <Input
            id="acreedor"
            name="acreedor"
            placeholder="ej. Banco Nacional, Juan Pérez, CANTV"
            defaultValue={deuda?.acreedor ?? ""}
            required
          />
          {fe.acreedor ? <p className="text-danger text-xs">{fe.acreedor}</p> : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Categoría */}
          <div className="space-y-1.5">
            <Label htmlFor="categoria_id">Categoría</Label>
            <select
              id="categoria_id"
              name="categoria_id"
              defaultValue={deuda?.categoria_id ?? ""}
              className={SELECT_CLASS}
            >
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Fecha */}
          <div className="space-y-1.5">
            <Label htmlFor="fecha">
              Fecha <span className="text-danger">*</span>
            </Label>
            <Input
              id="fecha"
              name="fecha"
              type="date"
              defaultValue={deuda?.fecha ?? hoy}
              required
            />
          </div>
        </div>

        {/* Monto */}
        <CampoMontoDual
          id="monto_usd"
          label={
            <>
              Monto de la deuda (USD) <span className="text-danger">*</span>
            </>
          }
          name="monto_usd"
          valorUsd={montoUsd}
          onChangeUsd={setMontoUsd}
          tasa={tasa}
          required
        />
        {fe.monto_usd ? <p className="text-danger -mt-2 text-xs">{fe.monto_usd}</p> : null}

        {/* Vencimiento */}
        <div className="space-y-1.5">
          <Label htmlFor="vencimiento">Fecha de vencimiento (opcional)</Label>
          <Input
            id="vencimiento"
            name="vencimiento"
            type="date"
            defaultValue={deuda?.vencimiento ?? ""}
          />
          <p className="text-muted-foreground text-xs">
            Si la dejas vacía, la deuda no se marcará como vencida.
          </p>
        </div>

        {/* Notas */}
        <div className="space-y-1.5">
          <Label htmlFor="notas">Notas (opcional)</Label>
          <textarea
            id="notas"
            name="notas"
            rows={3}
            placeholder="Condiciones, plazos acordados, etc."
            defaultValue={deuda?.notas ?? ""}
            className="border-border bg-background focus-visible:ring-ring w-full resize-none rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
          />
        </div>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
          <SubmitButton className="w-full sm:w-auto">
            {deuda ? "Guardar cambios" : "Registrar deuda"}
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}
