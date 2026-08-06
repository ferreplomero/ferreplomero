"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Info, Receipt } from "lucide-react";
import { Button, Card, Label } from "@arkiteq/ui";
import { SubmitButton } from "@/components/auth/submit-button";
import { CampoMontoDual } from "@/components/minimarket/shared/campo-monto-dual";
import { METODOS_ABONO } from "@/lib/minimarket/constants";
import { esEfectivo } from "@/lib/minimarket/pos-calc";
import { esMetodoConCuenta } from "@/lib/minimarket/bancos";
import { getCuentaPredeterminada } from "@/lib/minimarket/data/bancos";
import type { MetodoPagoConfigItem } from "@/lib/minimarket/metodos-pago";
import type { MmCuentaBancaria, MmMetodoPago } from "@arkiteq/db";
import type { AbonoDeudaResult } from "./actions";
import { registrarAbonoDeuda } from "./actions";

interface AbonoDeudaFormProps {
  deudaId: string;
  descripcion: string;
  acreedor: string;
  saldoUsd: number;
  tasa: number;
  locale: string;
  /** Métodos de pago activos en Configuración — el selector solo muestra estos. */
  metodosPago: MetodoPagoConfigItem[];
  /** ¿Hay una caja abierta ahora mismo? Solo afecta el aviso al elegir efectivo. */
  cajaAbierta: boolean;
  /** Cuentas bancarias activas del tenant, para elegir de cuál sale el dinero
   * cuando el método es digital (pago móvil/transferencia/Zelle). */
  cuentasBancarias: MmCuentaBancaria[];
}

const SELECT_CLASS =
  "border-border bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2";

export function AbonoDeudaForm({
  deudaId,
  descripcion,
  acreedor,
  saldoUsd,
  tasa,
  locale,
  metodosPago,
  cajaAbierta,
  cuentasBancarias,
}: AbonoDeudaFormProps) {
  const [state, formAction] = useActionState<AbonoDeudaResult, FormData>(registrarAbonoDeuda, {});
  const [monto, setMonto] = React.useState("");

  const metodosActivos = React.useMemo(() => {
    const activosSet = new Set<MmMetodoPago>(
      metodosPago.filter((m) => m.activo).map((m) => m.metodo),
    );
    return METODOS_ABONO.filter((m) => activosSet.has(m.value));
  }, [metodosPago]);

  const [metodo, setMetodo] = React.useState<MmMetodoPago>(
    metodosActivos.find((m) => m.value === "efectivo_bs")?.value ??
      metodosActivos[0]?.value ??
      "efectivo_bs",
  );
  const [cuentaBancariaId, setCuentaBancariaId] = React.useState("");

  // Se resetea al CAMBIAR de método — mismo patrón que gasto-form.tsx.
  const esPrimerRender = React.useRef(true);
  React.useEffect(() => {
    if (esPrimerRender.current) {
      esPrimerRender.current = false;
      return;
    }
    setCuentaBancariaId("");
  }, [metodo]);
  const cuentasDelMetodo = React.useMemo(
    () => cuentasBancarias.filter((c) => c.metodo === metodo && c.activa),
    [cuentasBancarias, metodo],
  );
  const cuentaPredeterminada = esMetodoConCuenta(metodo)
    ? getCuentaPredeterminada(cuentasBancarias, metodo)
    : null;
  const cuentaResueltaId = cuentaBancariaId || cuentaPredeterminada?.id || "";
  const cuentaResuelta =
    cuentasDelMetodo.find((c) => c.id === cuentaResueltaId) ?? cuentaPredeterminada;
  const faltaCuentaDigital = esMetodoConCuenta(metodo) && !cuentaResuelta;
  const cajaCerrada = esEfectivo(metodo) && !cajaAbierta;

  const montoNum = parseFloat(monto) || 0;
  const saldoNuevo = Math.max(0, saldoUsd - montoNum);

  const usd = (v: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(v);
  const bs = (v: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "VES" }).format(v);

  if (state.ok && state.recibo) {
    const r = state.recibo;
    return (
      <Card className="mx-auto max-w-md space-y-4 p-6">
        <div className="flex items-center gap-3 text-green-600">
          <CheckCircle2 className="size-7" />
          <p className="font-semibold">Abono registrado</p>
        </div>

        <div className="bg-surface-2 space-y-2 rounded-lg p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Deuda</span>
            <span className="text-heading font-medium">{r.descripcion}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Acreedor</span>
            <span className="text-heading">{r.acreedor}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Abono</span>
            <span className="text-heading font-semibold tabular-nums">{usd(r.montoUsd)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">En bolívares</span>
            <span className="tabular-nums">{bs(r.montoBs)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Método</span>
            <span>{r.metodo}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tasa usada</span>
            <span className="tabular-nums">Bs {r.tasa.toFixed(2)}</span>
          </div>
          <div className="border-border my-1 border-t" />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Saldo anterior</span>
            <span className="tabular-nums text-amber-600">{usd(r.saldoAnterior)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span className="text-muted-foreground">Nuevo saldo</span>
            <span
              className={
                r.saldoNuevo <= 0 ? "tabular-nums text-green-600" : "text-heading tabular-nums"
              }
            >
              {usd(r.saldoNuevo)}
            </span>
          </div>
          {r.saldoNuevo <= 0 ? (
            <p className="text-center text-xs font-medium text-green-600">
              ¡Deuda saldada completamente!
            </p>
          ) : null}
        </div>

        <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
          Registrar otro abono
        </Button>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-md space-y-5 p-6">
      <div className="flex items-center gap-3">
        <span className="bg-accent-500/12 text-accent-600 inline-flex size-11 items-center justify-center rounded-xl">
          <Receipt className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-heading font-medium">Registrar abono</p>
          <p className="text-muted-foreground text-sm">
            {descripcion} — <span className="font-medium">{acreedor}</span>
          </p>
        </div>
      </div>

      <div className="bg-surface-2 rounded-lg px-4 py-3">
        <p className="text-muted-foreground text-xs">Saldo pendiente</p>
        <p className="text-heading font-display text-2xl font-semibold tabular-nums">
          {usd(saldoUsd)}
        </p>
        <p className="text-muted-foreground text-xs tabular-nums">{bs(saldoUsd * tasa)}</p>
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
        <input type="hidden" name="deuda_id" value={deudaId} />

        <CampoMontoDual
          id="monto_usd"
          label={
            <>
              Monto del abono (USD) <span className="text-danger">*</span>
            </>
          }
          name="monto_usd"
          valorUsd={monto}
          onChangeUsd={setMonto}
          tasa={tasa}
          required
        />
        {montoNum > 0 ? (
          <p className="text-muted-foreground -mt-2 text-xs tabular-nums">
            Tasa usada: Bs {tasa.toFixed(2)}
          </p>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="metodo">Método de pago</Label>
          <select
            id="metodo"
            name="metodo"
            value={metodo}
            onChange={(e) => setMetodo(e.target.value as MmMetodoPago)}
            className={SELECT_CLASS}
          >
            {metodosActivos.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          {esEfectivo(metodo) ? (
            cajaAbierta ? (
              <p className="text-muted-foreground text-xs">
                Se descontará automáticamente de la caja abierta.
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-amber-700">
                <Info className="size-3.5 shrink-0" aria-hidden />
                Necesitas abrir la caja antes de registrar este abono en efectivo.
              </p>
            )
          ) : (
            <>
              <input type="hidden" name="cuenta_bancaria_id" value={cuentaResueltaId} />
              {cuentasDelMetodo.length > 1 ? (
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="cuenta_bancaria_select">Cuenta de la que sale el dinero</Label>
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
              {faltaCuentaDigital ? (
                <p className="flex items-center gap-1.5 text-xs text-amber-700">
                  <Info className="size-3.5 shrink-0" aria-hidden />
                  No hay una cuenta configurada para este método — configúrala en Bancos antes de
                  registrar este abono.
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Se descontará de: {cuentaResuelta?.banco} — {cuentaResuelta?.titular}.
                </p>
              )}
            </>
          )}
        </div>

        {montoNum > 0 && montoNum <= saldoUsd ? (
          <div className="bg-surface-2 flex items-center justify-between rounded-lg px-4 py-3 text-sm">
            <span className="text-muted-foreground">Saldo tras el abono</span>
            <span
              className={`font-semibold tabular-nums ${saldoNuevo <= 0 ? "text-green-600" : "text-heading"}`}
            >
              {usd(saldoNuevo)}
            </span>
          </div>
        ) : null}

        <SubmitButton disabled={faltaCuentaDigital || cajaCerrada} className="w-full">
          Registrar abono
        </SubmitButton>
      </form>
    </Card>
  );
}
