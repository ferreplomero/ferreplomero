"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Wallet, WifiOff } from "lucide-react";
import { Card, Input, Label, toast } from "@arkiteq/ui";
import { PowerSyncContext } from "@powersync/react";
import { SubmitButton } from "@/components/auth/submit-button";
import { abrirCaja, type CajaResult } from "@/app/(vertical)/minimarket/caja/actions";
import { abrirCajaLocal } from "@/lib/minimarket/powersync/registrar-caja-local";
import { useOnline } from "@/lib/minimarket/use-online";
import { formatMaskedAmount, parseMaskedInput } from "@/lib/minimarket/currency-mask";

interface SesionLocal {
  id: string;
  monto_inicial_usd: number;
  monto_inicial_bs: number;
  abierta_en: string;
}

interface AbrirCajaFormProps {
  tenantId: string;
  usuarioId: string;
  onAbiertaLocal: (sesion: SesionLocal) => void;
}

export function AbrirCajaForm({ tenantId, usuarioId, onAbiertaLocal }: AbrirCajaFormProps) {
  const router = useRouter();
  const powerSyncDb = React.useContext(PowerSyncContext);
  const offline = !useOnline();
  const [state, formAction] = useActionState<CajaResult, FormData>(abrirCaja, {});
  const [guardandoLocal, setGuardandoLocal] = React.useState(false);
  const [montoUsd, setMontoUsd] = React.useState("0.00");
  const [montoBs, setMontoBs] = React.useState("0.00");

  React.useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!offline) return;
    e.preventDefault();
    if (!powerSyncDb) {
      toast.error("Sin conexión y sin base local disponible. Inténtalo de nuevo en unos segundos.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const numero = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(",", ".")) || 0;
    const montoInicialUsd = numero(fd.get("monto_inicial_usd"));
    const montoInicialBs = numero(fd.get("monto_inicial_bs"));

    setGuardandoLocal(true);
    try {
      const { sesionId } = await abrirCajaLocal(powerSyncDb, {
        tenantId,
        usuarioId,
        montoInicialUsd,
        montoInicialBs,
      });
      toast.success("Caja abierta en este dispositivo. Se sincronizará al conectarte.");
      onAbiertaLocal({
        id: sesionId,
        monto_inicial_usd: montoInicialUsd,
        monto_inicial_bs: montoInicialBs,
        abierta_en: new Date().toISOString(),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo abrir la caja.");
    } finally {
      setGuardandoLocal(false);
    }
  }

  return (
    <Card className="mx-auto max-w-md space-y-4 p-6">
      <div className="flex items-center gap-3">
        <span className="bg-accent-500/12 text-accent-600 inline-flex size-11 items-center justify-center rounded-xl">
          <Wallet className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-heading font-medium">Caja cerrada</p>
          <p className="text-muted-foreground text-sm">Abre un turno con el efectivo inicial.</p>
        </div>
      </div>

      <form action={formAction} onSubmit={onSubmit} className="space-y-4" noValidate>
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

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="monto_inicial_usd">Efectivo inicial USD</Label>
            <input type="hidden" name="monto_inicial_usd" value={montoUsd} />
            <Input
              id="monto_inicial_usd"
              type="text"
              inputMode="numeric"
              value={formatMaskedAmount(montoUsd)}
              onChange={(e) => setMontoUsd(parseMaskedInput(e.target.value))}
              placeholder="0,00"
              className="text-right tabular-nums"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="monto_inicial_bs">Efectivo inicial Bs</Label>
            <input type="hidden" name="monto_inicial_bs" value={montoBs} />
            <Input
              id="monto_inicial_bs"
              type="text"
              inputMode="numeric"
              value={formatMaskedAmount(montoBs)}
              onChange={(e) => setMontoBs(parseMaskedInput(e.target.value))}
              placeholder="0,00"
              className="text-right tabular-nums"
              required
            />
          </div>
        </div>

        <p className="text-muted-foreground text-xs">
          Esto es solo el efectivo físico que hay en la gaveta HOY, para que cuadre el arqueo de
          este turno. Si es la primera vez que usas el sistema y quieres declarar el capital con el
          que arrancó tu negocio, eso se hace aparte con el botón <strong>Saldo inicial</strong>{" "}
          dentro de Caja — no lo repitas acá.
        </p>

        <SubmitButton disabled={guardandoLocal} className="w-full">
          {guardandoLocal ? "Abriendo…" : "Abrir caja"}
        </SubmitButton>
      </form>
    </Card>
  );
}
