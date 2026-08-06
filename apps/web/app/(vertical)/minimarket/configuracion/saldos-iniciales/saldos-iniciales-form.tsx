"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle } from "lucide-react";
import { Button, Card, cn } from "@arkiteq/ui";
import type { MmCuentaBancaria } from "@arkiteq/db";
import {
  METODO_CUENTA_LABEL,
  monedaNativaCuenta,
  type MetodoConCuenta,
} from "@/lib/minimarket/bancos";
import { CuentasBancariasPanel } from "../cuentas-bancarias-panel";
import { guardarMediosSaldosIniciales } from "./actions";

interface Props {
  cuentas: MmCuentaBancaria[];
  cajaAbierta: boolean;
  /** Tasa Bs/USD vigente del negocio, o null si nunca se registró — sin
   * tasa no se puede ofrecer la conversión en vivo (solo entrada directa en
   * Bs para los métodos nacionales). */
  tasaVigente: number | null;
}

// Cashea no aplica al saldo inicial (regla de negocio) — se excluye a
// propósito de esta lista, aunque sí es un método con cuenta bancaria en el
// resto de la app (ver `METODOS_CON_CUENTA` en lib/minimarket/bancos.ts).
const DIGITALES: MetodoConCuenta[] = ["pago_movil", "transferencia", "tarjeta", "zelle"];

const INPUT =
  "border-border bg-background text-heading w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-offset-1 focus:ring-accent-400";
const LABEL = "text-muted-foreground block text-xs font-medium uppercase tracking-wide";

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

function numeroDe(texto: string): number {
  const n = Number(texto.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Monto de saldo inicial para una cuenta digital. Zelle es SIEMPRE USD (sin
 * conversión — regla permanente: Zelle no admite Bs). El resto (pago móvil,
 * transferencia, tarjeta, Cashea) son bancos NACIONALES: el saldo se GUARDA
 * siempre en Bs (moneda nativa fija de la cuenta, ver `monedaNativaCuenta`),
 * pero el usuario puede escribir el monto en Bs o en USD — al escribir en
 * USD se convierte a Bs con la tasa vigente y ESO es lo que viaja en el
 * campo `saldo_{id}` que la acción del servidor ya espera; el servidor no
 * cambia en absoluto, solo recibe el monto en Bs listo.
 */
function MontoCuentaInput({
  id,
  tasaVigente,
}: {
  id: MetodoConCuenta;
  tasaVigente: number | null;
}) {
  const esUsd = monedaNativaCuenta(id) === "USD";
  const [modo, setModo] = React.useState<"bs" | "usd">("bs");
  const [texto, setTexto] = React.useState("0");

  if (esUsd) {
    return (
      <div className="space-y-1">
        <label htmlFor={`saldo_${id}`} className={LABEL}>
          ¿Cuánto tenías en esta cuenta (USD) antes de empezar a usar el sistema?
        </label>
        <input
          id={`saldo_${id}`}
          name={`saldo_${id}`}
          inputMode="decimal"
          defaultValue="0"
          className={INPUT}
        />
        <p className="text-muted-foreground text-xs">Zelle siempre queda registrado en dólares.</p>
      </div>
    );
  }

  const numero = numeroDe(texto);
  const montoBs = modo === "bs" ? numero : tasaVigente ? redondear(numero * tasaVigente) : 0;
  const montoUsdEquivalente =
    modo === "usd" ? numero : tasaVigente ? redondear(numero / tasaVigente) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`saldo_${id}_visible`} className={LABEL}>
          ¿Cuánto tenías en esta cuenta antes de empezar a usar el sistema?
        </label>
        <div className="border-border flex shrink-0 overflow-hidden rounded-md border text-xs">
          <button
            type="button"
            onClick={() => setModo("bs")}
            className={cn(
              "px-2 py-1 font-medium transition-colors",
              modo === "bs" ? "bg-accent-500 text-white" : "bg-background text-muted-foreground",
            )}
          >
            Bs
          </button>
          <button
            type="button"
            onClick={() => setModo("usd")}
            disabled={!tasaVigente}
            className={cn(
              "px-2 py-1 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              modo === "usd" ? "bg-accent-500 text-white" : "bg-background text-muted-foreground",
            )}
          >
            USD
          </button>
        </div>
      </div>
      <input
        id={`saldo_${id}_visible`}
        inputMode="decimal"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        className={INPUT}
      />
      {/* El servidor SIEMPRE recibe el monto ya en Bs bajo este nombre — el
          campo visible de arriba puede estar en USD, pero lo que se guarda
          como saldo de la cuenta es siempre en bolívares (moneda nativa
          fija, ver monedaNativaCuenta). */}
      <input type="hidden" name={`saldo_${id}`} value={montoBs} />
      <p className="text-muted-foreground text-xs">
        {modo === "bs" ? (
          tasaVigente ? (
            <>
              Se registrará como <strong>Bs.S {montoBs.toLocaleString("es-VE")}</strong> — equivale
              a hoy a USD {montoUsdEquivalente.toLocaleString("es-VE")} (tasa {tasaVigente}).
            </>
          ) : (
            <>
              Se registrará como <strong>Bs.S {montoBs.toLocaleString("es-VE")}</strong>.
            </>
          )
        ) : (
          <>
            Se registrará como <strong>Bs.S {montoBs.toLocaleString("es-VE")}</strong> (USD{" "}
            {numero.toLocaleString("es-VE")} × tasa {tasaVigente}) — el saldo de esta cuenta siempre
            queda fijo en bolívares.
          </>
        )}
      </p>
      {!tasaVigente ? (
        <p className="text-xs text-amber-600">
          No hay tasa de cambio registrada — solo puedes escribir el monto directo en Bs.
        </p>
      ) : null}
    </div>
  );
}

export function SaldosInicialesForm({ cuentas, cajaAbierta, tasaVigente }: Props) {
  const [state, action, pending] = useActionState(guardarMediosSaldosIniciales, {});

  const [efectivoBs, setEfectivoBs] = React.useState(false);
  const [efectivoUsd, setEfectivoUsd] = React.useState(false);
  const [digitales, setDigitales] = React.useState<Set<MetodoConCuenta>>(new Set());

  function alternarDigital(id: MetodoConCuenta) {
    setDigitales((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const algunoSeleccionado = efectivoBs || efectivoUsd || digitales.size > 0;

  return (
    <form action={action} className="space-y-4">
      {state.error ? (
        <p
          role="alert"
          className="bg-danger/10 text-danger flex items-center gap-2 rounded-md px-3 py-2.5 text-sm"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2.5 text-sm text-green-700">
          <CheckCircle className="size-4 shrink-0" aria-hidden />
          Configuración guardada.
        </p>
      ) : null}

      {/* Efectivo — usa el efectivo YA existente en la sesión de caja abierta,
          nunca abre otra (ver actions.ts). Sin conversión: Efectivo Bs se
          declara en Bs, Efectivo USD se declara en USD, cada uno en su
          propia moneda. */}
      <Card className="space-y-3 p-4">
        <p className="text-heading text-sm font-semibold">Efectivo</p>
        {!cajaAbierta ? (
          <p className="text-muted-foreground text-xs">
            No tienes la caja abierta —{" "}
            <Link href="/minimarket/caja" className="text-accent-600 hover:underline">
              ábrela primero
            </Link>{" "}
            para declarar saldo en efectivo. Puedes continuar solo con medios digitales por ahora.
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="border-border space-y-2 rounded-lg border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="medio_efectivo_bs"
                value="1"
                checked={efectivoBs}
                disabled={!cajaAbierta}
                onChange={(e) => setEfectivoBs(e.target.checked)}
                className="accent-accent-500 size-4"
              />
              Efectivo Bs
            </label>
            {efectivoBs ? (
              <div className="space-y-1">
                <label htmlFor="saldo_efectivo_bs" className={LABEL}>
                  ¿Cuánto tenías en caja en Bs antes de empezar a usar el sistema?
                </label>
                <input
                  id="saldo_efectivo_bs"
                  name="saldo_efectivo_bs"
                  inputMode="decimal"
                  defaultValue="0"
                  className={INPUT}
                />
              </div>
            ) : null}
          </div>
          <div className="border-border space-y-2 rounded-lg border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="medio_efectivo_usd"
                value="1"
                checked={efectivoUsd}
                disabled={!cajaAbierta}
                onChange={(e) => setEfectivoUsd(e.target.checked)}
                className="accent-accent-500 size-4"
              />
              Efectivo USD
            </label>
            {efectivoUsd ? (
              <div className="space-y-1">
                <label htmlFor="saldo_efectivo_usd" className={LABEL}>
                  ¿Cuánto tenías en caja en USD antes de empezar a usar el sistema?
                </label>
                <input
                  id="saldo_efectivo_usd"
                  name="saldo_efectivo_usd"
                  inputMode="decimal"
                  defaultValue="0"
                  className={INPUT}
                />
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      {/* Digitales — cada uno reutiliza el mismo panel de cuentas bancarias
          que ya existe en Configuración (crear/editar/predeterminada). Pago
          móvil/transferencia/tarjeta/Cashea son bancos nacionales: el saldo
          SIEMPRE queda en Bs, con opción de escribirlo en USD (conversión en
          vivo). Zelle es siempre USD, sin conversión. */}
      {DIGITALES.map((id) => {
        const activo = digitales.has(id);
        const cuentasMetodo = cuentas.filter((c) => c.metodo === id && c.activa);
        return (
          <Card key={id} className="space-y-3 p-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name={`medio_${id}`}
                value="1"
                checked={activo}
                onChange={() => alternarDigital(id)}
                className="accent-accent-500 size-4"
              />
              {METODO_CUENTA_LABEL[id]}
            </label>
            {activo ? (
              <div className="border-border space-y-3 border-t pt-3">
                <div className="space-y-1">
                  <label htmlFor={`cuenta_${id}`} className={LABEL}>
                    Cuenta bancaria <span className="text-danger">*</span>
                  </label>
                  <select id={`cuenta_${id}`} name={`cuenta_${id}`} required className={INPUT}>
                    <option value="">Selecciona una cuenta…</option>
                    {cuentasMetodo.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.banco} · {c.titular}
                      </option>
                    ))}
                  </select>
                  {cuentasMetodo.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      Aún no tienes ninguna cuenta de {METODO_CUENTA_LABEL[id]}. Créala abajo y
                      luego selecciónala aquí.
                    </p>
                  ) : null}
                </div>
                <CuentasBancariasPanel metodo={id} cuentas={cuentasMetodo} />
                <MontoCuentaInput id={id} tasaVigente={tasaVigente} />
              </div>
            ) : null}
          </Card>
        );
      })}

      <div className="flex justify-end pt-2">
        <Button type="submit" size="lg" disabled={pending || !algunoSeleccionado}>
          {pending ? "Guardando…" : "Guardar configuración"}
        </Button>
      </div>
    </form>
  );
}
