"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, PiggyBank } from "lucide-react";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@arkiteq/ui";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  registrarSaldoInicialCaja,
  type CajaResult,
} from "@/app/(vertical)/minimarket/caja/actions";
import { formatMaskedAmount, parseMaskedInput } from "@/lib/minimarket/currency-mask";

const SELECT_CLASS =
  "border-border bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2";

interface Props {
  sesionId: string;
  onDone: () => void;
}

/**
 * Declara el saldo/capital inicial en efectivo de la caja abierta — a
 * propósito un diálogo DISTINTO de "Movimiento" (`MovimientoCajaForm`): no
 * es un ingreso/egreso/retiro del día a día, es el punto de partida. Se
 * puede abrir y reenviar cuantas veces haga falta.
 */
export function SaldoInicialCajaForm({ sesionId, onDone }: Props) {
  const router = useRouter();
  const [state, formAction] = useActionState<CajaResult, FormData>(registrarSaldoInicialCaja, {});
  const [monto, setMonto] = React.useState("");

  React.useEffect(() => {
    if (state.ok) {
      router.refresh();
      onDone();
    }
  }, [state.ok, router, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <PiggyBank className="text-accent-600 size-5" aria-hidden />
          Saldo inicial de caja
        </DialogTitle>
        <DialogDescription>
          Declara cuánto efectivo tenías en caja ANTES de empezar a usar el sistema. No es un
          ingreso del día a día — queda identificado en el historial como capital inicial. Distinto
          del &quot;Efectivo inicial&quot; que declaras cada vez que abres un turno: eso es solo el
          vuelto de hoy, esto es el capital histórico del negocio (normalmente se declara una sola
          vez).
        </DialogDescription>
      </DialogHeader>

      <input type="hidden" name="sesion_id" value={sesionId} />

      {state.error ? (
        <p
          role="alert"
          className="bg-danger/10 text-danger flex items-center gap-2 rounded-md px-3 py-2.5 text-sm"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="moneda">Moneda</Label>
        <select id="moneda" name="moneda" className={SELECT_CLASS} defaultValue="VES">
          <option value="VES">Bolívares</option>
          <option value="USD">Dólares</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="monto">Monto</Label>
        <input type="hidden" name="monto" value={monto} />
        <Input
          id="monto"
          type="text"
          inputMode="numeric"
          value={formatMaskedAmount(monto)}
          onChange={(e) => setMonto(parseMaskedInput(e.target.value))}
          placeholder="0,00"
          className="text-right tabular-nums"
          required
        />
      </div>

      <DialogFooter>
        <SubmitButton>Declarar saldo inicial</SubmitButton>
      </DialogFooter>
    </form>
  );
}
