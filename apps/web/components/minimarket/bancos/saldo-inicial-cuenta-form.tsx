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
  cn,
} from "@arkiteq/ui";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  registrarSaldoInicialCuenta,
  type BancosResult,
} from "@/app/(vertical)/minimarket/bancos/actions";
import { formatMaskedAmount, parseMaskedInput } from "@/lib/minimarket/currency-mask";

interface Props {
  cuentaId: string;
  cuentaLabel: string;
  /** Moneda NATIVA fija de la cuenta — igual que en el movimiento manual,
   * define en qué moneda queda GUARDADO el saldo (nunca cambia). */
  monedaNativa: "USD" | "VES";
  /** Tasa vigente para ofrecer la conversión en vivo — null = sin tasa
   * registrada, solo se puede escribir directo en la moneda nativa. */
  tasaVigente: number | null;
  onDone: () => void;
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Declara el saldo/capital inicial de esta cuenta — a propósito un diálogo
 * DISTINTO de "Movimiento manual" (`MovimientoCuentaForm`): no es una
 * operación puntual, es el punto de partida. Se puede abrir y reenviar
 * cuantas veces haga falta, cada vez queda como una fila propia en el
 * ledger de auditoría (`mm_saldos_iniciales`).
 */
export function SaldoInicialCuentaForm({
  cuentaId,
  cuentaLabel,
  monedaNativa,
  tasaVigente,
  onDone,
}: Props) {
  const router = useRouter();
  const [state, formAction] = useActionState<BancosResult, FormData>(
    registrarSaldoInicialCuenta,
    {},
  );
  const [modo, setModo] = React.useState<"nativa" | "otra">("nativa");
  const [monto, setMonto] = React.useState("");

  React.useEffect(() => {
    if (state.ok) {
      router.refresh();
      onDone();
    }
  }, [state.ok, router, onDone]);

  const esZelle = monedaNativa === "USD";
  const numero = Number(monto.replace(",", ".")) || 0;
  // Zelle: siempre USD, sin conversión. Bancos nacionales: si el modo es
  // "otra" (el usuario prefirió escribir en USD), se convierte a Bs con la
  // tasa vigente — eso es lo que finalmente se guarda como saldo.
  const montoNativo =
    esZelle || modo === "nativa" ? numero : tasaVigente ? redondear(numero * tasaVigente) : 0;
  const monedaVisible = esZelle ? "USD" : modo === "nativa" ? "Bs" : "USD";

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <PiggyBank className="text-accent-600 size-5" aria-hidden />
          Saldo inicial — {cuentaLabel}
        </DialogTitle>
        <DialogDescription>
          Declara cuánto tenía esta cuenta ANTES de empezar a usar el sistema. No es un movimiento
          del día a día — queda identificado en el historial como capital inicial, nunca como un
          ingreso normal.
        </DialogDescription>
      </DialogHeader>

      <input type="hidden" name="cuenta_id" value={cuentaId} />
      <input type="hidden" name="monto" value={montoNativo} />

      {state.error ? (
        <p
          role="alert"
          className="bg-danger/10 text-danger flex items-center gap-2 rounded-md px-3 py-2.5 text-sm"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      {!esZelle ? (
        <div className="flex items-center justify-between gap-2">
          <Label>Escribir monto en</Label>
          <div className="border-border flex shrink-0 overflow-hidden rounded-md border text-xs">
            <button
              type="button"
              onClick={() => setModo("nativa")}
              className={cn(
                "px-2.5 py-1.5 font-medium transition-colors",
                modo === "nativa"
                  ? "bg-accent-500 text-white"
                  : "bg-background text-muted-foreground",
              )}
            >
              Bs
            </button>
            <button
              type="button"
              onClick={() => setModo("otra")}
              disabled={!tasaVigente}
              className={cn(
                "px-2.5 py-1.5 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                modo === "otra"
                  ? "bg-accent-500 text-white"
                  : "bg-background text-muted-foreground",
              )}
            >
              USD
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="monto_visible">Monto ({monedaVisible})</Label>
        <Input
          id="monto_visible"
          type="text"
          inputMode="numeric"
          value={formatMaskedAmount(monto)}
          onChange={(e) => setMonto(parseMaskedInput(e.target.value))}
          placeholder="0,00"
          className="text-right tabular-nums"
          required
        />
        {esZelle ? (
          <p className="text-muted-foreground text-xs">
            Zelle siempre queda registrado en dólares.
          </p>
        ) : modo === "otra" ? (
          tasaVigente ? (
            <p className="text-muted-foreground text-xs">
              Se registrará como <strong>Bs.S {montoNativo.toLocaleString("es-VE")}</strong> (USD{" "}
              {numero.toLocaleString("es-VE")} × tasa {tasaVigente}) — el saldo de esta cuenta
              siempre queda fijo en bolívares.
            </p>
          ) : (
            <p className="text-xs text-amber-600">
              No hay tasa de cambio registrada — solo puedes escribir el monto directo en Bs.
            </p>
          )
        ) : (
          <p className="text-muted-foreground text-xs">
            Se guarda en bolívares, la moneda nativa fija de esta cuenta.
          </p>
        )}
      </div>

      <DialogFooter>
        <SubmitButton>Declarar saldo inicial</SubmitButton>
      </DialogFooter>
    </form>
  );
}
