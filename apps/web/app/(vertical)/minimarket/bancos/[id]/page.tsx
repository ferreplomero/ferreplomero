import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  listMovimientosCuenta,
  listCuentasConSaldo,
  saldoNativo,
} from "@/lib/minimarket/data/bancos";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaHora } from "@/lib/minimarket/date-format";
import { esMetodoConCuenta, METODO_CUENTA_LABEL, RUTA_TIPO_CUENTA } from "@/lib/minimarket/bancos";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { MOTIVO_SALDO_INICIAL } from "@/lib/minimarket/data/saldos-iniciales";
import { CuentaDetalleAcciones } from "@/components/minimarket/bancos/cuenta-detalle-cliente";

export const metadata: Metadata = { title: "Cuenta bancaria" };

// "ingreso"/"egreso" cubren varios orígenes (depósito manual, vuelto
// entregado, gasto operativo pagado desde esta cuenta, otro ingreso, ajustes
// de edición/eliminación) — la columna "Motivo" de la tabla ya distingue cuál
// es cuál, así que la etiqueta del tipo se mantiene genérica a propósito.
const TIPO_LABEL: Record<string, string> = {
  venta: "Ingreso por venta",
  ingreso: "Ingreso",
  egreso: "Egreso",
  retiro: "Retiro",
};

export default async function CuentaBancariaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);

  const [cuentas, movimientos, tz, tasa] = await Promise.all([
    listCuentasConSaldo(supabase, tenantId),
    listMovimientosCuenta(supabase, tenantId, id),
    getTimezoneNegocio(supabase, tenantId),
    getTasaVigente(supabase, tenantId),
  ]);

  const cuenta = cuentas.find((c) => c.id === id);
  if (!cuenta) notFound();

  const saldo = saldoNativo(cuenta);

  const money = (valor: number, moneda: string) => {
    try {
      return new Intl.NumberFormat(country.locale, { style: "currency", currency: moneda }).format(
        valor,
      );
    } catch {
      return `${moneda} ${valor.toFixed(2)}`;
    }
  };

  const cuentaLabel = `${cuenta.banco} (${METODO_CUENTA_LABEL[cuenta.metodo as keyof typeof METODO_CUENTA_LABEL] ?? cuenta.metodo})`;
  // Vuelve al tipo de la cuenta (ej. Pago Móvil), no a un listado general que
  // ya no existe como vista mezclada — cada tipo vive en su propia página.
  const volverHref = esMetodoConCuenta(cuenta.metodo)
    ? `/minimarket/bancos/${RUTA_TIPO_CUENTA[cuenta.metodo]}`
    : "/minimarket/bancos";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={volverHref}
          className="text-muted-foreground hover:text-heading inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" />
          {METODO_CUENTA_LABEL[cuenta.metodo as keyof typeof METODO_CUENTA_LABEL] ?? "Bancos"}
        </Link>
      </div>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">{cuenta.banco}</h1>
          <p className="text-muted-foreground text-sm">
            {METODO_CUENTA_LABEL[cuenta.metodo as keyof typeof METODO_CUENTA_LABEL] ??
              cuenta.metodo}
            {cuenta.predeterminada ? " · Predeterminada" : ""} · {cuenta.titular}
            {cuenta.telefono ? ` · ${cuenta.telefono}` : ""}
            {cuenta.cuenta ? ` · ${cuenta.cuenta}` : ""}
          </p>
        </div>
        <CuentaDetalleAcciones
          cuentaId={cuenta.id}
          cuentaLabel={cuentaLabel}
          monedaNativa={saldo.moneda}
          tasaVigente={tasa?.valor ?? null}
          esCashea={cuenta.metodo === "cashea"}
        />
      </header>

      <Card className="flex items-center justify-between gap-3 p-4">
        <p className="text-heading text-sm font-medium">Saldo actual</p>
        <div className="text-right">
          <p
            className={`text-lg font-semibold tabular-nums ${saldo.monto < 0 ? "text-danger" : "text-heading"}`}
          >
            {money(saldo.monto, saldo.moneda === "USD" ? "USD" : "VES")}
          </p>
          <p className="text-muted-foreground text-xs">
            Saldo real en {saldo.moneda === "USD" ? "dólares" : "bolívares"} — no cambia con la
            tasa.
          </p>
        </div>
      </Card>
      {saldo.monto < 0 ? (
        <p className="bg-danger/10 text-danger rounded-lg px-4 py-3 text-sm">
          Esta cuenta tiene saldo negativo — revisa el historial abajo para entender por qué.
        </p>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="border-border text-heading border-b px-4 py-3 text-sm font-medium">
          Historial de movimientos
        </div>
        {movimientos.length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm">
            Todavía no hay movimientos en esta cuenta.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Fecha</th>
                  <th className="px-4 py-2.5 font-medium">Tipo</th>
                  <th className="px-4 py-2.5 font-medium">Motivo</th>
                  <th className="px-4 py-2.5 text-right font-medium">Monto USD</th>
                  <th className="px-4 py-2.5 text-right font-medium">Monto Bs</th>
                  <th className="px-4 py-2.5 text-right font-medium">Tasa</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => {
                  const esIngreso = m.tipo === "venta" || m.tipo === "ingreso";
                  const esSaldoInicial = m.motivo === MOTIVO_SALDO_INICIAL;
                  return (
                    <tr key={m.id} className="border-border/70 border-b last:border-0">
                      <td className="text-muted-foreground whitespace-nowrap px-4 py-2.5">
                        {fmtFechaHora(m.created_at, tz)}
                      </td>
                      <td className="px-4 py-2.5">
                        {esSaldoInicial ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                            Saldo inicial
                          </span>
                        ) : (
                          (TIPO_LABEL[m.tipo] ?? m.tipo)
                        )}
                      </td>
                      <td className="text-muted-foreground px-4 py-2.5">{m.motivo ?? "—"}</td>
                      <td
                        className={`px-4 py-2.5 text-right tabular-nums ${esIngreso ? "text-success" : "text-danger"}`}
                      >
                        {esIngreso ? "+" : "−"}
                        {money(m.monto_usd, "USD")}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {money(m.monto_bs, "VES")}
                      </td>
                      <td className="text-muted-foreground px-4 py-2.5 text-right tabular-nums">
                        {m.tasa_usada ? m.tasa_usada.toFixed(2) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
