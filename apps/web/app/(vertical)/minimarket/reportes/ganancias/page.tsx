import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  DollarSign,
  Package,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaHora, fmtFechaLarga } from "@/lib/minimarket/date-format";
import { rangoPreset } from "@/lib/minimarket/data/reportes";
import { getResumenGanancias } from "@/lib/minimarket/data/ganancias";
import { getResumenSaldosIniciales } from "@/lib/minimarket/data/saldos-iniciales";
import { METODOS_PAGO } from "@/lib/minimarket/constants";
import {
  PeriodoSelector,
  type PeriodoValue,
} from "@/components/minimarket/tablero/periodo-selector";
import { GananciasChart } from "@/components/minimarket/reportes/ganancias-chart-cargador";
import { ReportesTabs } from "../reportes-tabs";

export const metadata: Metadata = { title: "Ganancias" };

const ORIGEN_LABEL: Record<string, string> = {
  caja: "Egreso de caja",
  deuda: "Abono a deuda operativa",
  manual: "Gasto operativo",
};

function metodoLabelGanancias(metodo: string): string {
  return METODOS_PAGO.find((m) => m.value === metodo)?.label ?? metodo;
}

function periodoValido(v: unknown): v is PeriodoValue {
  return v === "hoy" || v === "semana" || v === "mes";
}

export default async function GananciasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/inicio");

  const params = await searchParams;

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);
  const tz = await getTimezoneNegocio(supabase, tenantId);

  const periodoParam = periodoValido(params.periodo) ? params.periodo : "mes";
  const desdeParam = typeof params.desde === "string" ? params.desde : undefined;
  const hastaParam = typeof params.hasta === "string" ? params.hasta : undefined;
  const personalizado = Boolean(desdeParam && hastaParam);
  const rango = personalizado
    ? { desde: desdeParam as string, hasta: hastaParam as string }
    : rangoPreset(periodoParam, tz);

  const [resumen, tasa, saldosIniciales] = await Promise.all([
    getResumenGanancias(supabase, tenantId, rango, tz),
    getTasaVigente(supabase, tenantId),
    getResumenSaldosIniciales(supabase, tenantId),
  ]);

  const tasaValor = tasa?.valor ?? 1;
  const usd = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(v);
  const bs = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "VES" }).format(v);

  const tarjetas = [
    {
      label: "Ingresos por ventas",
      valor: resumen.ingresosUsd,
      Icon: TrendingUp,
      cls: "text-heading",
    },
    {
      label: "Costo de mercancía vendida",
      valor: -resumen.costoMercanciaUsd,
      Icon: Package,
      cls: "text-amber-600",
    },
    {
      label: "= Ganancia bruta",
      valor: resumen.gananciaBrutaUsd,
      Icon: TrendingUp,
      cls: resumen.gananciaBrutaUsd >= 0 ? "text-heading" : "text-danger",
      destacado: true,
    },
    {
      label: "Otros ingresos (no son ventas)",
      valor: resumen.otrosIngresosUsd,
      Icon: DollarSign,
      cls: "text-heading",
    },
    {
      label: "Gastos del período",
      valor: -resumen.gastosTotalUsd,
      Icon: TrendingDown,
      cls: "text-red-600",
    },
    {
      label: "= Ganancia neta",
      valor: resumen.gananciaNetaUsd,
      Icon: Wallet,
      cls: resumen.gananciaNetaUsd >= 0 ? "text-green-600" : "text-danger",
      destacado: true,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ReportesTabs activo="/minimarket/reportes/ganancias" />

      <header className="space-y-3">
        <div className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">Ganancias</h1>
          <p className="text-muted-foreground">
            Cuánto gana realmente el negocio en el período: ingresos, costo de mercancía, gastos y
            ganancia neta.
          </p>
        </div>
        <PeriodoSelector
          basePath="/minimarket/reportes/ganancias"
          periodoActivo={personalizado ? "mes" : periodoParam}
          personalizado={personalizado}
          desde={rango.desde}
          hasta={rango.hasta}
        />
        <p className="text-muted-foreground text-sm">
          {rango.desde === rango.hasta
            ? fmtFechaLarga(`${rango.desde}T12:00:00.000Z`, "UTC")
            : `${rango.desde} — ${rango.hasta}`}{" "}
          · {resumen.numVentas} venta{resumen.numVentas !== 1 ? "s" : ""}
        </p>
      </header>

      {/* Capital inicial declarado — aparte de la cascada de abajo a
          propósito: NUNCA se suma a "Ingresos por ventas" ni a "Ganancia
          neta" (a diferencia de "Otros ingresos"), es solo capital
          declarado con el que arrancó el negocio (ver migración 0106). Suma
          TODO el histórico, no depende del período elegido arriba. USD y Bs
          se muestran por separado — nunca blended en un solo número, cada
          uno es la moneda nativa fija de su cuenta/caja de origen. */}
      {saldosIniciales.totalUsd > 0 || saldosIniciales.totalBs > 0 ? (
        <Card className="flex items-center justify-between gap-3 border-blue-200 bg-blue-50 p-4">
          <div>
            <p className="text-sm font-semibold text-blue-900">Capital inicial declarado</p>
            <p className="text-xs text-blue-800">
              No es venta ni ganancia — el saldo con el que arrancó el negocio en caja y cuentas
              bancarias. No forma parte de la cascada de abajo.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-display text-lg font-bold tabular-nums text-blue-900">
              {usd(saldosIniciales.totalUsd)}
            </p>
            <p className="text-xs tabular-nums text-blue-800">{bs(saldosIniciales.totalBs)}</p>
          </div>
        </Card>
      ) : null}

      {/* Cascada ingresos -> costo -> bruta -> gastos -> neta */}
      <Card className="divide-border divide-y p-0">
        {tarjetas.map(({ label, valor, Icon, cls, destacado }) => (
          <div
            key={label}
            className={`flex items-center justify-between gap-3 px-5 py-4 ${destacado ? "bg-surface-2/60" : ""}`}
          >
            <div className="flex items-center gap-3">
              <span className="bg-accent-500/12 text-accent-600 inline-flex size-9 items-center justify-center rounded-lg">
                <Icon className="size-4" aria-hidden />
              </span>
              <p
                className={`text-sm ${destacado ? "text-heading font-semibold" : "text-muted-foreground"}`}
              >
                {label}
              </p>
            </div>
            <div className="text-right">
              <p className={`font-display text-lg font-semibold tabular-nums ${cls}`}>
                {valor < 0 ? `−${usd(Math.abs(valor))}` : usd(valor)}
              </p>
              <p className="text-muted-foreground text-xs tabular-nums">
                {valor < 0 ? `−${bs(Math.abs(valor) * tasaValor)}` : bs(valor * tasaValor)}
              </p>
            </div>
          </div>
        ))}
      </Card>

      {/* Nota honesta — obligatoria, nunca oculta */}
      <Card className="space-y-2 border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
          <div className="space-y-1.5 text-sm text-amber-800">
            <p className="font-medium">
              Ganancia neta según ventas, costos y gastos registrados — registra todo para mayor
              precisión.
            </p>
            <ul className="list-disc space-y-1 pl-4 text-xs">
              <li>
                El <strong>costo de mercancía vendida</strong> usa el costo ACTUAL de cada producto
                (no existe un costo histórico congelado por venta). Si tus costos cambiaron desde
                que vendiste, esta cifra es una aproximación, igual que la &ldquo;Utilidad
                estimada&rdquo; del Resumen general.
              </li>
              <li>
                Los <strong>gastos</strong> incluyen egresos de caja, abonos a deudas marcadas como
                &ldquo;gasto operativo&rdquo; y los{" "}
                <Link href="/minimarket/reportes/gastos" className="underline">
                  gastos operativos que registres aquí
                </Link>
                . Si tienes gastos que no pasan por ninguno de estos (ej. una transferencia sin
                registrar), la ganancia neta no los está considerando todavía.
              </li>
              <li>
                Los{" "}
                <Link href="/minimarket/reportes/otros-ingresos" className="underline">
                  otros ingresos
                </Link>{" "}
                (dinero que entra sin ser una venta) se suman directo a la ganancia neta, nunca a
                &ldquo;Ingresos por ventas&rdquo; ni al número de ventas del período.
              </li>
            </ul>
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-heading font-medium">Comparativo del período</h2>
        <GananciasChart
          ingresosUsd={resumen.ingresosUsd}
          costoMercanciaUsd={resumen.costoMercanciaUsd}
          gastosTotalUsd={resumen.gastosTotalUsd}
          gananciaNetaUsd={resumen.gananciaNetaUsd}
          locale={country.locale}
        />
      </Card>

      {/* Desglose del costo de mercancía por producto */}
      <Card className="overflow-hidden p-0">
        <div className="border-border flex items-center gap-2 border-b px-4 py-3">
          <Package className="text-muted-foreground size-4" />
          <p className="text-heading text-sm font-medium">
            Costo de mercancía vendida — {resumen.detalleProductos.length} producto
            {resumen.detalleProductos.length !== 1 ? "s" : ""}
          </p>
        </div>
        {resumen.detalleProductos.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm">
            No hay ventas con productos en este período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3 text-right">Cantidad</th>
                  <th className="px-4 py-3 text-right">Ingreso</th>
                  <th className="px-4 py-3 text-right">Costo</th>
                  <th className="px-4 py-3 text-right">Margen</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {resumen.detalleProductos.map((p) => (
                  <tr
                    key={p.producto_id ?? p.descripcion}
                    className="hover:bg-surface-2 transition-colors"
                  >
                    <td className="text-heading px-4 py-3 font-medium">{p.descripcion}</td>
                    <td className="text-muted-foreground px-4 py-3 text-right tabular-nums">
                      {p.cantidad}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{usd(p.ingresoUsd)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-600">
                      {usd(p.costoUsd)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {usd(p.ingresoUsd - p.costoUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Desglose de gastos */}
      <Card className="overflow-hidden p-0">
        <div className="border-border flex items-center gap-2 border-b px-4 py-3">
          <Receipt className="text-muted-foreground size-4" />
          <p className="text-heading text-sm font-medium">
            Gastos del período — {resumen.detalleGastos.length} movimiento
            {resumen.detalleGastos.length !== 1 ? "s" : ""}
          </p>
        </div>
        {resumen.detalleGastos.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-muted-foreground text-sm">Sin gastos registrados en este período.</p>
            <Link
              href="/minimarket/reportes/gastos/nuevo"
              className="text-accent-600 mt-1 inline-block text-sm hover:underline"
            >
              Registrar un gasto →
            </Link>
          </div>
        ) : (
          <div className="divide-border divide-y">
            {resumen.detalleGastos.map((g) => (
              <div
                key={`${g.origen}-${g.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="text-heading truncate font-medium">{g.descripcion}</p>
                  <p className="text-muted-foreground text-xs">
                    {ORIGEN_LABEL[g.origen] ?? g.origen}
                    {g.categoria ? ` · ${g.categoria}` : ""} ·{" "}
                    {g.origen === "manual" ? g.fecha : fmtFechaHora(g.fecha, tz)}
                  </p>
                </div>
                <p className="shrink-0 font-medium tabular-nums text-red-600">{usd(g.montoUsd)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Desglose de otros ingresos (no son ventas) */}
      <Card className="overflow-hidden p-0">
        <div className="border-border flex items-center gap-2 border-b px-4 py-3">
          <DollarSign className="text-muted-foreground size-4" />
          <p className="text-heading text-sm font-medium">
            Otros ingresos del período — {resumen.detalleOtrosIngresos.length} movimiento
            {resumen.detalleOtrosIngresos.length !== 1 ? "s" : ""}
          </p>
        </div>
        {resumen.detalleOtrosIngresos.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-muted-foreground text-sm">
              Sin otros ingresos registrados en este período.
            </p>
            <Link
              href="/minimarket/reportes/otros-ingresos/nuevo"
              className="text-accent-600 mt-1 inline-block text-sm hover:underline"
            >
              Registrar un otro ingreso →
            </Link>
          </div>
        ) : (
          <div className="divide-border divide-y">
            {resumen.detalleOtrosIngresos.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="text-heading truncate font-medium">{i.descripcion}</p>
                  <p className="text-muted-foreground text-xs">
                    {metodoLabelGanancias(i.metodoPago)} · {i.fecha}
                  </p>
                </div>
                <p className="shrink-0 font-medium tabular-nums text-green-600">
                  {usd(i.montoUsd)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <DollarSign className="size-3.5" aria-hidden />
        Información de control interno para apoyo a la gestión del negocio. No constituye una
        declaración fiscal.
      </p>
    </div>
  );
}
