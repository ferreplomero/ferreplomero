"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Receipt, WifiOff } from "lucide-react";
import { Button, Card, Label, LeyendaNoFiscal, toast } from "@arkiteq/ui";
import { PowerSyncContext } from "@powersync/react";
import { SubmitButton } from "@/components/auth/submit-button";
import { IGTF_RATE, METODOS_ABONO, causaIgtf } from "@/lib/minimarket/constants";
import { esMetodoConCuenta } from "@/lib/minimarket/bancos";
import { getCuentaPredeterminada } from "@/lib/minimarket/data/bancos";
import { registrarAbonoLocal } from "@/lib/minimarket/powersync/registrar-cliente-local";
import { useOnline } from "@/lib/minimarket/use-online";
import { CampoMontoDual } from "@/components/minimarket/shared/campo-monto-dual";
import type { MmCuentaBancaria, MmMetodoPago } from "@arkiteq/db";
import type { AbonoResult } from "./actions";
import { registrarAbono } from "./actions";

interface AbonoFormProps {
  clienteId: string;
  clienteNombre: string;
  saldoUsd: number;
  tasa: number;
  locale: string;
  tenantId: string;
  usuarioId: string;
  sucursalId: string;
  /** Config del negocio (mm_config_negocio.parametros.igtf_activo) — si está
   * desactivado, el abono en divisa nunca cobra IGTF, ni en el preview ni en
   * el registro (server o local/offline). */
  igtfActivo: boolean;
  /** Cuentas bancarias activas del tenant, para elegir a dónde entra el
   * abono cuando el método tiene cuenta (pago móvil/transferencia/Zelle/
   * tarjeta) y hay más de una configurada. */
  cuentasBancarias: MmCuentaBancaria[];
}

const SELECT_CLASS =
  "border-border bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2";

export function AbonoForm({
  clienteId,
  clienteNombre,
  saldoUsd,
  tasa,
  locale,
  tenantId,
  usuarioId,
  sucursalId,
  igtfActivo,
  cuentasBancarias,
}: AbonoFormProps) {
  const powerSyncDb = React.useContext(PowerSyncContext);
  const offline = !useOnline();
  const [state, formAction] = useActionState<AbonoResult, FormData>(registrarAbono, {});
  const [monto, setMonto] = React.useState("");
  const [metodo, setMetodo] = React.useState<MmMetodoPago>("efectivo_bs");
  const [cuentaBancariaId, setCuentaBancariaId] = React.useState("");
  const [guardandoLocal, setGuardandoLocal] = React.useState(false);
  const [reciboLocal, setReciboLocal] = React.useState<NonNullable<AbonoResult["recibo"]> | null>(
    null,
  );

  const montoNum = parseFloat(monto) || 0;
  const esEnDivisa = igtfActivo && causaIgtf(metodo);
  const igtfUsd = esEnDivisa ? Math.round(montoNum * IGTF_RATE * 100) / 100 : 0;
  const montoBs = Math.round(montoNum * tasa * 100) / 100;
  const saldoNuevo = Math.max(0, saldoUsd - montoNum);

  // A qué cuenta entra el dinero — solo online, mismo criterio que el diálogo
  // de cobro del POS (pos-cliente.tsx): sin conexión no se elige cuenta
  // específica, el abono se registra igual y el ingreso a Bancos queda
  // pendiente de registrar manualmente si aplica.
  const cuentasDelMetodo = React.useMemo(
    () => cuentasBancarias.filter((c) => c.metodo === metodo),
    [cuentasBancarias, metodo],
  );
  const cuentaPredeterminada = esMetodoConCuenta(metodo)
    ? getCuentaPredeterminada(cuentasBancarias, metodo)
    : null;
  const cuentaResueltaId = cuentaBancariaId || cuentaPredeterminada?.id || "";
  const cuentaResuelta =
    cuentasDelMetodo.find((c) => c.id === cuentaResueltaId) ?? cuentaPredeterminada;

  React.useEffect(() => {
    setCuentaBancariaId("");
  }, [metodo]);

  const usd = (v: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(v);
  const bs = (v: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "VES" }).format(v);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!offline) return;
    e.preventDefault();
    if (!powerSyncDb) {
      toast.error("Sin conexión y sin base local disponible. Inténtalo de nuevo en unos segundos.");
      return;
    }
    if (!(montoNum > 0)) {
      toast.error("El monto debe ser mayor a cero.");
      return;
    }
    if (montoNum > saldoUsd + 0.001) {
      toast.error(
        `El abono ($${montoNum.toFixed(2)}) supera el saldo del cliente ($${saldoUsd.toFixed(2)}).`,
      );
      return;
    }

    setGuardandoLocal(true);
    try {
      await registrarAbonoLocal(powerSyncDb, {
        tenantId,
        usuarioId,
        sucursalId,
        clienteId,
        clienteNombre,
        montoUsd: montoNum,
        metodo,
        igtfUsd,
        tasa,
      });
      setReciboLocal({
        clienteNombre,
        montoUsd: montoNum,
        montoBs,
        igtfUsd,
        metodo: METODOS_ABONO.find((m) => m.value === metodo)?.label ?? metodo,
        tasa,
        saldoAnterior: saldoUsd,
        saldoNuevo,
        fecha: new Date().toISOString(),
      });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `No se pudo guardar: ${err.message}`
          : "No se pudo guardar el abono.",
      );
    } finally {
      setGuardandoLocal(false);
    }
  }

  const recibo = state.ok ? state.recibo : reciboLocal;

  if (recibo) {
    const r = recibo;
    return (
      <Card className="mx-auto max-w-md space-y-4 p-6">
        <div className="flex items-center gap-3 text-green-600">
          <CheckCircle2 className="size-7" />
          <p className="font-semibold">Abono registrado</p>
        </div>

        <div className="bg-surface-2 space-y-2 rounded-lg p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cliente</span>
            <span className="text-heading font-medium">{r.clienteNombre}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Abono</span>
            <span className="text-heading font-semibold tabular-nums">{usd(r.montoUsd)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">En bolívares</span>
            <span className="tabular-nums">{bs(r.montoBs)}</span>
          </div>
          {r.igtfUsd > 0 ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">IGTF (3%)</span>
              <span className="tabular-nums text-amber-600">{usd(r.igtfUsd)}</span>
            </div>
          ) : null}
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

        {r.avisoCaja ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            {r.avisoCaja}
          </p>
        ) : null}

        <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
          Registrar otro abono
        </Button>
        <LeyendaNoFiscal className="pt-1 opacity-70" />
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
            Cliente: <span className="font-medium">{clienteNombre}</span>
          </p>
        </div>
      </div>

      {/* Saldo actual */}
      <div className="bg-surface-2 rounded-lg px-4 py-3">
        <p className="text-muted-foreground text-xs">Saldo pendiente</p>
        <p className="text-heading font-display text-2xl font-semibold tabular-nums">
          {usd(saldoUsd)}
        </p>
        <p className="text-muted-foreground text-xs tabular-nums">{bs(saldoUsd * tasa)}</p>
      </div>

      {offline ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800"
        >
          <WifiOff className="size-4 shrink-0" aria-hidden />
          <span>
            <strong>Sin conexión</strong> — el abono se guarda en este dispositivo y se sube solo
            cuando vuelva la señal.
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

      <form action={formAction} onSubmit={onSubmit} className="space-y-4" noValidate>
        <input type="hidden" name="cliente_id" value={clienteId} />
        <input type="hidden" name="cuenta_bancaria_id" value={!offline ? cuentaResueltaId : ""} />

        {/* Monto */}
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

        {/* Método */}
        <div className="space-y-1.5">
          <Label htmlFor="metodo">Método de pago</Label>
          <select
            id="metodo"
            name="metodo"
            value={metodo}
            onChange={(e) => setMetodo(e.target.value as MmMetodoPago)}
            className={SELECT_CLASS}
          >
            {METODOS_ABONO.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Cuenta que recibe el abono — solo online y solo si hay más de una
            cuenta activa para este método; con una sola (o ninguna) queda
            asignada en silencio, igual que en el diálogo de cobro del POS. */}
        {!offline && esMetodoConCuenta(metodo) && cuentasDelMetodo.length > 1 ? (
          <div className="space-y-1.5">
            <Label htmlFor="cuenta_bancaria_select">Cuenta que recibe el abono</Label>
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

        {/* A dónde entra el dinero — lenguaje simple, sin tecnicismos. */}
        {montoNum > 0 ? (
          <p className="text-muted-foreground text-xs">
            {esMetodoConCuenta(metodo)
              ? offline
                ? "Sin conexión: este ingreso no se podrá asignar a una cuenta bancaria automáticamente, regístralo manualmente en Bancos cuando puedas."
                : cuentaResuelta
                  ? `Este abono entra a: ${cuentaResuelta.banco} — ${cuentaResuelta.titular}.`
                  : "No hay una cuenta configurada para este método: el ingreso no quedará reflejado en Bancos."
              : "Este abono entra a la Caja."}
          </p>
        ) : null}

        {/* Preview IGTF */}
        {esEnDivisa && montoNum > 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm">
            <p className="font-medium text-amber-800">IGTF aplicable (3%)</p>
            <p className="tabular-nums text-amber-700">
              El cliente debe abonar {usd(igtfUsd)} adicionales por pagar en divisa.
            </p>
          </div>
        ) : null}

        {/* Preview saldo resultante */}
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

        <SubmitButton disabled={guardandoLocal} className="w-full">
          {guardandoLocal ? "Guardando…" : "Registrar abono"}
        </SubmitButton>
      </form>
    </Card>
  );
}
