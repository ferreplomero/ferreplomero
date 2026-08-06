"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
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
  registrarMovimientoCuentaManual,
  type BancosResult,
} from "@/app/(vertical)/minimarket/bancos/actions";
import { formatMaskedAmount, parseMaskedInput } from "@/lib/minimarket/currency-mask";

const SELECT_CLASS =
  "border-border bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2";

interface Props {
  cuentaId: string;
  cuentaLabel: string;
  /** Moneda NATIVA fija de la cuenta (Bs para pago móvil/transferencia/
   * tarjeta/Cashea, USD para Zelle) — el monto se teclea directo en esa
   * moneda, sin conversión mental, y así es como queda guardado el saldo. */
  monedaNativa: "USD" | "VES";
  onDone: () => void;
}

export function MovimientoCuentaForm({ cuentaId, cuentaLabel, monedaNativa, onDone }: Props) {
  const router = useRouter();
  const [state, formAction] = useActionState<BancosResult, FormData>(
    registrarMovimientoCuentaManual,
    {},
  );
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
        <DialogTitle>Movimiento manual — {cuentaLabel}</DialogTitle>
        <DialogDescription>
          Registra un depósito/ajuste o un retiro que hiciste directo en el banco (no por una
          venta).
        </DialogDescription>
      </DialogHeader>

      <input type="hidden" name="cuenta_id" value={cuentaId} />

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
        <Label htmlFor="tipo">Tipo</Label>
        <select id="tipo" name="tipo" className={SELECT_CLASS} defaultValue="ingreso">
          <option value="ingreso">Depósito / ajuste (entra dinero)</option>
          <option value="retiro">Retiro (sale dinero)</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="monto">Monto ({monedaNativa === "USD" ? "USD" : "Bs"})</Label>
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

      <div className="space-y-2">
        <Label htmlFor="motivo">Motivo (opcional)</Label>
        <Input id="motivo" name="motivo" placeholder="Retiro para gastos, corrección de saldo…" />
      </div>

      <DialogFooter>
        <SubmitButton>Registrar</SubmitButton>
      </DialogFooter>
    </form>
  );
}
