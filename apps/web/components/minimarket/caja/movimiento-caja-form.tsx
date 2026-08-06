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
import type { MmCajaMovTipo } from "@arkiteq/db";
import { SubmitButton } from "@/components/auth/submit-button";
import { registrarMovimientoCaja, type CajaResult } from "@/app/(vertical)/minimarket/caja/actions";
import { registrarMovimientoCajaLocal } from "@/lib/minimarket/powersync/registrar-caja-local";
import type { MovimientoCaja } from "@/lib/minimarket/data/caja";
import { useOnline } from "@/lib/minimarket/use-online";
import { formatMaskedAmount, parseMaskedInput } from "@/lib/minimarket/currency-mask";

const SELECT_CLASS =
  "border-border bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2";

interface MovimientoCajaFormProps {
  sesionId: string;
  tenantId: string;
  usuarioId: string;
  onDone: () => void;
  onRegistradoLocal: (movimiento: MovimientoCaja) => void;
}

export function MovimientoCajaForm({
  sesionId,
  tenantId,
  usuarioId,
  onDone,
  onRegistradoLocal,
}: MovimientoCajaFormProps) {
  const router = useRouter();
  const powerSyncDb = React.useContext(PowerSyncContext);
  const offline = !useOnline();
  const [state, formAction] = useActionState<CajaResult, FormData>(registrarMovimientoCaja, {});
  const [guardandoLocal, setGuardandoLocal] = React.useState(false);
  const [monto, setMonto] = React.useState("");

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
    const fd = new FormData(e.currentTarget);
    const tipo = (fd.get("tipo") as MmCajaMovTipo) || "ingreso";
    const moneda = fd.get("moneda") === "USD" ? "USD" : "VES";
    const monto = Number(String(fd.get("monto") ?? "").replace(",", "."));
    if (!Number.isFinite(monto) || monto <= 0) {
      toast.error("El monto debe ser mayor que cero.");
      return;
    }
    const motivo = (fd.get("motivo") as string) || null;

    setGuardandoLocal(true);
    try {
      await registrarMovimientoCajaLocal(powerSyncDb, {
        tenantId,
        usuarioId,
        sesionId,
        tipo,
        monto,
        moneda,
        motivo,
      });
      toast.success("Movimiento guardado en este dispositivo. Se sincronizará al conectarte.");
      onRegistradoLocal({
        id: crypto.randomUUID(),
        tipo,
        monto,
        moneda,
        motivo,
        created_at: new Date().toISOString(),
      });
      onDone();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `No se pudo guardar: ${err.message}`
          : "No se pudo guardar el movimiento.",
      );
    } finally {
      setGuardandoLocal(false);
    }
  }

  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>Movimiento de caja</DialogTitle>
        <DialogDescription>Registra un ingreso, egreso o retiro de efectivo.</DialogDescription>
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

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="tipo">Tipo</Label>
          <select id="tipo" name="tipo" className={SELECT_CLASS} defaultValue="ingreso">
            <option value="ingreso">Ingreso</option>
            <option value="egreso">Egreso</option>
            <option value="retiro">Retiro</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="moneda">Moneda</Label>
          <select id="moneda" name="moneda" className={SELECT_CLASS} defaultValue="VES">
            <option value="VES">Bolívares</option>
            <option value="USD">Dólares</option>
          </select>
        </div>
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

      <div className="space-y-2">
        <Label htmlFor="motivo">Motivo (opcional)</Label>
        <Input id="motivo" name="motivo" placeholder="Pago a proveedor, vuelto…" />
      </div>

      <DialogFooter>
        <SubmitButton disabled={guardandoLocal}>
          {guardandoLocal ? "Guardando…" : "Registrar"}
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}
