"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, WifiOff } from "lucide-react";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  toast,
} from "@arkiteq/ui";
import { PowerSyncContext } from "@powersync/react";
import { SubmitButton } from "@/components/auth/submit-button";
import { cerrarCaja, type CajaResult } from "@/app/(vertical)/minimarket/caja/actions";
import { cerrarCajaLocal } from "@/lib/minimarket/powersync/registrar-caja-local";
import { useOnline } from "@/lib/minimarket/use-online";
import { formatMaskedAmount, parseMaskedInput } from "@/lib/minimarket/currency-mask";

interface CerrarCajaFormProps {
  sesionId: string;
  tenantId: string;
  esperadoUsd: number;
  esperadoBs: number;
  locale: string;
  onDone: () => void;
  onCerradaLocal: () => void;
}

export function CerrarCajaForm({
  sesionId,
  tenantId,
  esperadoUsd,
  esperadoBs,
  locale,
  onDone,
  onCerradaLocal,
}: CerrarCajaFormProps) {
  const router = useRouter();
  const powerSyncDb = React.useContext(PowerSyncContext);
  const offline = !useOnline();
  const [state, formAction] = useActionState<CajaResult, FormData>(cerrarCaja, {});
  const [contadoUsd, setContadoUsd] = React.useState("");
  const [contadoBs, setContadoBs] = React.useState("");
  const [guardandoLocal, setGuardandoLocal] = React.useState(false);

  React.useEffect(() => {
    if (state.ok) {
      router.refresh();
      onDone();
    }
  }, [state.ok, router, onDone]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!offline) return;
    e.preventDefault();
    if (!powerSyncDb) {
      toast.error("Sin conexión y sin base local disponible. Inténtalo de nuevo en unos segundos.");
      return;
    }
    const montoFinalUsd = Number(contadoUsd.replace(",", ".")) || 0;
    const montoFinalBs = Number(contadoBs.replace(",", ".")) || 0;

    setGuardandoLocal(true);
    try {
      await cerrarCajaLocal(powerSyncDb, { tenantId, sesionId, montoFinalUsd, montoFinalBs });
      toast.success("Caja cerrada en este dispositivo. Se sincronizará al conectarte.");
      onCerradaLocal();
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo cerrar la caja.");
    } finally {
      setGuardandoLocal(false);
    }
  }

  const money = (valor: number, moneda: string) => {
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency: moneda }).format(valor);
    } catch {
      return `${moneda} ${valor.toFixed(2)}`;
    }
  };

  const difUsd = contadoUsd ? Number(contadoUsd.replace(",", ".")) - esperadoUsd : null;
  const difBs = contadoBs ? Number(contadoBs.replace(",", ".")) - esperadoBs : null;

  const filaDif = (label: string, dif: number | null, moneda: string) =>
    dif === null ? null : (
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={`tabular-nums ${Math.abs(dif) < 0.005 ? "text-success" : "text-warning"}`}>
          {dif > 0 ? "+" : ""}
          {money(dif, moneda)}
        </span>
      </div>
    );

  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>Cerrar caja (arqueo)</DialogTitle>
        <DialogDescription>
          Cuenta el efectivo físico y compáralo con lo esperado.
        </DialogDescription>
      </DialogHeader>

      <input type="hidden" name="sesion_id" value={sesionId} />

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

      <div className="border-border space-y-1 rounded-lg border p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Esperado USD</span>
          <span className="tabular-nums">{money(esperadoUsd, "USD")}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Esperado Bs</span>
          <span className="tabular-nums">{money(esperadoBs, "VES")}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="monto_final_usd">Contado USD</Label>
          <input type="hidden" name="monto_final_usd" value={contadoUsd} />
          <Input
            id="monto_final_usd"
            type="text"
            inputMode="numeric"
            value={formatMaskedAmount(contadoUsd)}
            onChange={(e) => setContadoUsd(parseMaskedInput(e.target.value))}
            placeholder="0,00"
            className="text-right tabular-nums"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="monto_final_bs">Contado Bs</Label>
          <input type="hidden" name="monto_final_bs" value={contadoBs} />
          <Input
            id="monto_final_bs"
            type="text"
            inputMode="numeric"
            value={formatMaskedAmount(contadoBs)}
            onChange={(e) => setContadoBs(parseMaskedInput(e.target.value))}
            placeholder="0,00"
            className="text-right tabular-nums"
            required
          />
        </div>
      </div>

      {difUsd !== null || difBs !== null ? (
        <div className="space-y-1">
          {filaDif("Diferencia USD", difUsd, "USD")}
          {filaDif("Diferencia Bs", difBs, "VES")}
        </div>
      ) : null}

      <DialogFooter>
        <SubmitButton disabled={guardandoLocal}>
          {guardandoLocal ? "Cerrando…" : "Cerrar caja"}
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}
