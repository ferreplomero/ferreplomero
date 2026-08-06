"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Info, Lock, Sparkles } from "lucide-react";
import { Button, Card, Input, Label } from "@arkiteq/ui";
import { SubmitButton } from "@/components/auth/submit-button";
import { CampoMontoDual } from "@/components/minimarket/shared/campo-monto-dual";
import { METODOS_OTRO_INGRESO } from "@/lib/minimarket/constants";
import { esEfectivo } from "@/lib/minimarket/pos-calc";
import { esMetodoConCuenta } from "@/lib/minimarket/bancos";
import { getCuentaPredeterminada } from "@/lib/minimarket/data/bancos";
import type { MetodoPagoConfigItem } from "@/lib/minimarket/metodos-pago";
import type { MmCuentaBancaria, MmMetodoPago, MmOtroIngreso } from "@arkiteq/db";
import type { OtroIngresoResult } from "./actions";

interface OtroIngresoFormProps {
  action: (prev: OtroIngresoResult, formData: FormData) => Promise<OtroIngresoResult>;
  otroIngreso?: MmOtroIngreso | null;
  tasa: number;
  hoy: string;
  /** Métodos de pago activos en Configuración — el selector solo muestra estos. */
  metodosPago: MetodoPagoConfigItem[];
  /** ¿Hay una caja abierta ahora mismo? Solo afecta el aviso al elegir efectivo. */
  cajaAbierta: boolean;
  /** Cuentas bancarias activas del tenant, para elegir a cuál entra el dinero
   * cuando el método es digital (pago móvil/transferencia/Zelle/tarjeta). */
  cuentasBancarias: MmCuentaBancaria[];
  /**
   * true si este ingreso ya pasó por un cierre de caja: el monto y el método
   * quedan bloqueados (solo se puede corregir concepto/fecha/notas).
   */
  montoMetodoBloqueado?: boolean;
}

const SELECT_CLASS =
  "border-border bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60";

export function OtroIngresoForm({
  action,
  otroIngreso,
  tasa,
  hoy,
  metodosPago,
  cajaAbierta,
  cuentasBancarias,
  montoMetodoBloqueado,
}: OtroIngresoFormProps) {
  const router = useRouter();
  const [state, formAction] = useActionState<OtroIngresoResult, FormData>(action, {});
  const [montoUsd, setMontoUsd] = React.useState(otroIngreso ? String(otroIngreso.monto_usd) : "");
  const [cuentaBancariaId, setCuentaBancariaId] = React.useState(
    otroIngreso?.cuenta_bancaria_id ?? "",
  );

  const metodosActivos = React.useMemo(() => {
    const activosSet = new Set<MmMetodoPago>(
      metodosPago.filter((m) => m.activo).map((m) => m.metodo),
    );
    return METODOS_OTRO_INGRESO.filter((m) => activosSet.has(m.value));
  }, [metodosPago]);

  const metodoInicial: MmMetodoPago =
    otroIngreso?.metodo_pago && metodosActivos.some((m) => m.value === otroIngreso.metodo_pago)
      ? otroIngreso.metodo_pago
      : (metodosActivos.find((m) => m.value === "efectivo_bs")?.value ??
        metodosActivos[0]?.value ??
        "efectivo_bs");
  const [metodoPago, setMetodoPago] = React.useState<MmMetodoPago>(metodoInicial);

  React.useEffect(() => {
    if (state.ok && state.otroIngresoId) {
      router.push("/minimarket/reportes/otros-ingresos");
    }
  }, [state.ok, state.otroIngresoId, router]);

  // Mismo patrón que gasto-form.tsx: se resetea al CAMBIAR de método, se
  // muestra un selector solo si hay más de una cuenta activa para ese
  // método, y `esPrimerRender` evita borrar la cuenta ya guardada al editar.
  const esPrimerRender = React.useRef(true);
  React.useEffect(() => {
    if (esPrimerRender.current) {
      esPrimerRender.current = false;
      return;
    }
    setCuentaBancariaId("");
  }, [metodoPago]);
  const cuentasDelMetodo = React.useMemo(
    () => cuentasBancarias.filter((c) => c.metodo === metodoPago && c.activa),
    [cuentasBancarias, metodoPago],
  );
  const cuentaPredeterminada = esMetodoConCuenta(metodoPago)
    ? getCuentaPredeterminada(cuentasBancarias, metodoPago)
    : null;
  const cuentaResueltaId = cuentaBancariaId || cuentaPredeterminada?.id || "";
  const cuentaResuelta =
    cuentasDelMetodo.find((c) => c.id === cuentaResueltaId) ?? cuentaPredeterminada;
  const faltaCuentaDigital = esMetodoConCuenta(metodoPago) && !cuentaResuelta;

  const fe = state.fieldErrors ?? {};
  const bloqueado = Boolean(montoMetodoBloqueado);

  return (
    <Card className="mx-auto max-w-xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <span className="bg-accent-500/12 text-accent-600 inline-flex size-11 items-center justify-center rounded-xl">
          <Sparkles className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-heading font-medium">
            {otroIngreso ? "Editar otro ingreso" : "Nuevo otro ingreso"}
          </p>
          <p className="text-muted-foreground text-sm">
            {otroIngreso
              ? "Actualiza los datos de este ingreso."
              : "Dinero que entra sin ser una venta: aporte del dueño, venta de un activo, un reembolso, etc."}
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

      {bloqueado ? (
        <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          Este ingreso ya pasó por un cierre de caja: el monto y el método quedaron bloqueados para
          no descuadrar ese arqueo. Solo puedes corregir el concepto, la fecha o las notas.
        </p>
      ) : null}

      <form action={formAction} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="descripcion">
            Concepto <span className="text-danger">*</span>
          </Label>
          <Input
            id="descripcion"
            name="descripcion"
            placeholder="ej. Aporte del dueño para capital de trabajo"
            defaultValue={otroIngreso?.descripcion ?? ""}
            required
          />
          {fe.descripcion ? <p className="text-danger text-xs">{fe.descripcion}</p> : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fecha">
            Fecha <span className="text-danger">*</span>
          </Label>
          <Input
            id="fecha"
            name="fecha"
            type="date"
            defaultValue={otroIngreso?.fecha ?? hoy}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="metodo_pago">
            ¿A dónde entró el dinero? <span className="text-danger">*</span>
          </Label>
          {bloqueado ? (
            <>
              <p className="border-border bg-surface-2 text-heading flex h-10 items-center rounded-md border px-3 text-sm">
                {metodosActivos.find((m) => m.value === metodoInicial)?.label ?? metodoInicial}
              </p>
              <input type="hidden" name="metodo_pago" value={metodoInicial} />
            </>
          ) : (
            <>
              <select
                id="metodo_pago"
                name="metodo_pago"
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value as MmMetodoPago)}
                className={SELECT_CLASS}
                required
              >
                {metodosActivos.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              {fe.metodo_pago ? <p className="text-danger text-xs">{fe.metodo_pago}</p> : null}
              {esEfectivo(metodoPago) ? (
                cajaAbierta ? (
                  <p className="text-muted-foreground text-xs">
                    Se registrará automáticamente en la caja abierta.
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 text-xs text-amber-700">
                    <Info className="size-3.5 shrink-0" aria-hidden />
                    Necesitas abrir la caja antes de guardar este ingreso en efectivo.
                  </p>
                )
              ) : (
                <>
                  <input type="hidden" name="cuenta_bancaria_id" value={cuentaResueltaId} />
                  {cuentasDelMetodo.length > 1 ? (
                    <div className="space-y-1.5 pt-1">
                      <Label htmlFor="cuenta_bancaria_select">Cuenta que recibe el ingreso</Label>
                      <select
                        id="cuenta_bancaria_select"
                        value={cuentaResueltaId}
                        onChange={(e) => setCuentaBancariaId(e.target.value)}
                        className={SELECT_CLASS}
                      >
                        {cuentasDelMetodo.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.banco} — {c.titular}
                            {c.predeterminada ? " (predeterminada)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {fe.cuenta_bancaria_id ? (
                    <p className="text-danger text-xs">{fe.cuenta_bancaria_id}</p>
                  ) : faltaCuentaDigital ? (
                    <p className="flex items-center gap-1.5 text-xs text-amber-700">
                      <Info className="size-3.5 shrink-0" aria-hidden />
                      No hay una cuenta configurada para este método — configúrala en Bancos antes
                      de registrar este ingreso.
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      Se depositará en: {cuentaResuelta?.banco} — {cuentaResuelta?.titular}.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {bloqueado ? (
          <div className="space-y-1.5">
            <Label>Monto del ingreso (USD)</Label>
            <p className="border-border bg-surface-2 text-heading flex h-10 items-center rounded-md border px-3 text-sm tabular-nums">
              {new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD" }).format(
                otroIngreso ? Number(otroIngreso.monto_usd) : Number(montoUsd) || 0,
              )}
            </p>
            <input
              type="hidden"
              name="monto_usd"
              value={otroIngreso ? String(otroIngreso.monto_usd) : montoUsd}
            />
          </div>
        ) : (
          <CampoMontoDual
            id="monto_usd"
            label={
              <>
                Monto del ingreso (USD) <span className="text-danger">*</span>
              </>
            }
            name="monto_usd"
            valorUsd={montoUsd}
            onChangeUsd={setMontoUsd}
            tasa={tasa}
            required
          />
        )}
        {fe.monto_usd ? <p className="text-danger -mt-2 text-xs">{fe.monto_usd}</p> : null}

        <div className="space-y-1.5">
          <Label htmlFor="notas">Notas (opcional)</Label>
          <textarea
            id="notas"
            name="notas"
            rows={3}
            placeholder="Detalles adicionales"
            defaultValue={otroIngreso?.notas ?? ""}
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
          <SubmitButton disabled={!bloqueado && faltaCuentaDigital} className="w-full sm:w-auto">
            {otroIngreso ? "Guardar cambios" : "Registrar ingreso"}
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}
