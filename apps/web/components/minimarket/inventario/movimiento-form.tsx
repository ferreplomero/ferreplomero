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
import {
  registrarMovimiento,
  type ActionResult,
} from "@/app/(vertical)/minimarket/inventario/actions";
import { registrarMovimientoInventarioLocal } from "@/lib/minimarket/powersync/registrar-producto-local";
import type { TipoMovimientoInventario } from "@/lib/minimarket/inventario-calc";
import { useOnline } from "@/lib/minimarket/use-online";

export interface MovimientoFormProps {
  producto: { id: string; nombre: string };
  sucursales: { id: string; nombre: string }[];
  tenantId: string;
  usuarioId: string;
  onDone: () => void;
}

const SELECT_CLASS =
  "border-border bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2";

const TIPOS = [
  { value: "entrada", label: "Entrada (suma al stock)" },
  { value: "salida", label: "Salida (resta del stock)" },
  { value: "merma", label: "Merma (resta del stock)" },
  { value: "ajuste", label: "Ajuste (delta con signo)" },
];

export function MovimientoForm({
  producto,
  sucursales,
  tenantId,
  usuarioId,
  onDone,
}: MovimientoFormProps) {
  const router = useRouter();
  const powerSyncDb = React.useContext(PowerSyncContext);
  const offline = !useOnline();
  const [state, formAction] = useActionState<ActionResult, FormData>(registrarMovimiento, {});
  const [tipo, setTipo] = React.useState<TipoMovimientoInventario>("entrada");
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
    const fd = new FormData(e.currentTarget);
    const cantidad = Number(String(fd.get("cantidad") ?? "").replace(",", "."));
    if (!Number.isFinite(cantidad) || cantidad === 0) {
      toast.error("La cantidad no puede ser cero.");
      return;
    }
    const sucursalId = (fd.get("sucursal_id") as string) || sucursales[0]?.id;
    if (!sucursalId) {
      toast.error("No hay una sucursal configurada.");
      return;
    }

    setGuardandoLocal(true);
    try {
      await registrarMovimientoInventarioLocal(powerSyncDb, {
        tenantId,
        usuarioId,
        sucursalId,
        productoId: producto.id,
        tipo,
        cantidad,
        motivo: (fd.get("motivo") as string) || null,
      });
      toast.success("Movimiento guardado en este dispositivo. Se sincronizará al conectarte.");
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
        <DialogTitle>Movimiento de inventario</DialogTitle>
        <DialogDescription>
          {producto.nombre} · el stock se recalcula a partir de los movimientos.
        </DialogDescription>
      </DialogHeader>

      <input type="hidden" name="producto_id" value={producto.id} />

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

      <div className="space-y-2">
        <Label htmlFor="tipo">Tipo de movimiento</Label>
        <select
          id="tipo"
          name="tipo"
          className={SELECT_CLASS}
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoMovimientoInventario)}
        >
          {TIPOS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cantidad">Cantidad</Label>
          <Input
            id="cantidad"
            name="cantidad"
            type="number"
            step="0.001"
            inputMode="decimal"
            placeholder={tipo === "ajuste" ? "-2 o 5" : "10"}
            aria-invalid={Boolean(state.fieldErrors?.cantidad)}
            required
          />
          {state.fieldErrors?.cantidad ? (
            <p className="text-danger text-xs">{state.fieldErrors.cantidad}</p>
          ) : (
            <p className="text-muted-foreground text-xs">
              {tipo === "ajuste"
                ? "Usa signo: positivo suma, negativo resta."
                : "Ingresa una cantidad positiva."}
            </p>
          )}
        </div>

        {sucursales.length > 1 ? (
          <div className="space-y-2">
            <Label htmlFor="sucursal_id">Sucursal</Label>
            <select id="sucursal_id" name="sucursal_id" className={SELECT_CLASS}>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
        ) : sucursales.length === 1 ? (
          <input type="hidden" name="sucursal_id" value={sucursales[0]?.id ?? ""} />
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="motivo">Motivo (opcional)</Label>
        <Input id="motivo" name="motivo" placeholder="Compra, conteo, vencimiento…" />
      </div>

      <DialogFooter>
        <SubmitButton disabled={guardandoLocal}>
          {guardandoLocal ? "Guardando…" : "Registrar movimiento"}
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}
