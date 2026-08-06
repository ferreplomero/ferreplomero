import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  Download,
  FileText,
  Info,
  Landmark,
  Receipt,
  ShoppingBag,
  ShoppingCart,
} from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { rangoPreset } from "@/lib/minimarket/data/reportes";
import {
  getFinanzasResumen,
  getFinanzasCompras,
  getFinanzasGastos,
} from "@/lib/minimarket/data/finanzas";
import { METODOS_PAGO } from "@/lib/minimarket/constants";
import { GASTO_CATEGORIA_LABEL } from "@/lib/minimarket/data/ganancias";
import { fmtFechaCorta, fmtFechaHora } from "@/lib/minimarket/date-format";
import { getSesionAbierta, listMovimientosCaja, resumirCaja } from "@/lib/minimarket/data/caja";
import { listCuentasConSaldo, saldoNativo } from "@/lib/minimarket/data/bancos";
import { METODO_CUENTA_LABEL } from "@/lib/minimarket/bancos";
import { getResumenSaldosIniciales } from "@/lib/minimarket/data/saldos-iniciales";

export const metadata: Metadata = { title: "Finanzas" };

const LEYENDA =
  "Información de control interno para apoyo contable. No constituye una declaración fiscal ni un documento fiscal. Consulte a su contador para sus obligaciones ante el SENIAT.";

type Periodo = "hoy" | "semana" | "mes";
type Seccion = "ventas" | "compras" | "gastos";

function metodoLabel(metodo: string | null): string {
  if (!metodo || metodo === "sin_especificar") return "Sin especificar";
  return METODOS_PAGO.find((m) => m.value === metodo)?.label ?? metodo;
}

const METODO_CHIP: Record<string, string> = {
  efectivo_bs: "bg-blue-100 text-blue-800",
  efectivo_usd: "bg-green-100 text-green-800",
  pago_movil: "bg-purple-100 text-purple-800",
  transferencia: "bg-indigo-100 text-indigo-800",
  zelle: "bg-teal-100 text-teal-800",
  tarjeta: "bg-yellow-100 text-yellow-800",
  // Negro/amarillo — misma identidad de marca que en el selector de cobro.
  cashea: "bg-black text-[#FFCC00]",
  fiado: "bg-orange-100 text-orange-800",
};

export default async function FinanzasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const params = await searchParams;
  const periodoParam = (params.periodo ?? "mes") as Periodo;
  const desdeParam = params.desde;
  const hastaParam = params.hasta;
  const seccion: Seccion =
    params.seccion === "compras" ? "compras" : params.seccion === "gastos" ? "gastos" : "ventas";

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);
  const tz = await getTimezoneNegocio(supabase, tenantId);

  const rango =
    desdeParam && hastaParam
      ? { desde: desdeParam, hasta: hastaParam }
      : rangoPreset(periodoParam, tz);

  const [
    { resumen, porMetodo, ventas },
    { resumen: resumenCompras, porProveedor, compras },
    { resumen: resumenGastos, porMetodo: porMetodoGastos, gastos },
    configRes,
    sesionCaja,
    cuentasBancarias,
    saldosIniciales,
  ] = await Promise.all([
    getFinanzasResumen(supabase, tenantId, rango, tz),
    getFinanzasCompras(supabase, tenantId, rango, tz),
    getFinanzasGastos(supabase, tenantId, rango),
    supabase
      .from("mm_config_negocio")
      .select("parametros, nombre_comercial")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    getSesionAbierta(supabase, tenantId),
    listCuentasConSaldo(supabase, tenantId),
    getResumenSaldosIniciales(supabase, tenantId),
  ]);

  // "Cuánto tengo ahora mismo" — efectivo de la sesión de caja ABIERTA (si hay)
  // + saldo de cada cuenta bancaria. Es una foto del momento, no depende del
  // período seleccionado arriba (a diferencia del resto de esta página).
  const movimientosCajaAbierta = sesionCaja
    ? await listMovimientosCaja(supabase, tenantId, sesionCaja.id)
    : [];
  const resumenCajaAbierta = sesionCaja ? resumirCaja(sesionCaja, movimientosCajaAbierta) : null;

  const params2 = (configRes.data?.parametros as Record<string, unknown>) ?? {};
  const ivaActivo = Boolean(params2.iva_activo ?? false);
  const ivaPct = Number(params2.iva_pct ?? 16);
  const igtfActivo = params2.igtf_activo !== false;
  const negocioNombre = configRes.data?.nombre_comercial ?? "Mi negocio";
  // El cajero puede activar/desactivar IVA/IGTF puntualmente por venta desde
  // el POS (override que no toca esta configuración) — así que estas
  // secciones no deben ocultarse solo porque el default del negocio esté
  // apagado: se muestran si el default está activo O si de hecho se cobró
  // algo en el período (ventas o compras), para reflejar lo realmente
  // aplicado en cada venta y no solo el interruptor general.
  const mostrarIva =
    ivaActivo || resumen.ivaRegistradoUsd > 0.001 || resumenCompras.ivaPagadoUsd > 0.001;
  const mostrarIgtf =
    igtfActivo || resumen.igtfCobradoUsd > 0.001 || resumenCompras.igtfPagadoUsd > 0.001;

  const usd = (n: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(n);
  const bs = (n: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "VES" }).format(n);
  const fmtHora = (s: string) => fmtFechaHora(s, tz);

  // Saldo real de cada cuenta en su moneda nativa fija — nunca reconvertido
  // con la tasa del día (ver `saldoNativo`, corrige el bug donde "Total en
  // bancos" mezclaba Bs y USD como si todo fuera un solo número en dólares).
  const saldoNativoBs = (c: (typeof cuentasBancarias)[number]) => {
    const s = saldoNativo(c);
    return s.moneda === "VES" ? s.monto : 0;
  };
  const saldoNativoUsd = (c: (typeof cuentasBancarias)[number]) => {
    const s = saldoNativo(c);
    return s.moneda === "USD" ? s.monto : 0;
  };

  const periodos: { label: string; value: Periodo }[] = [
    { label: "Hoy", value: "hoy" },
    { label: "Esta semana", value: "semana" },
    { label: "Este mes", value: "mes" },
  ];

  const exportQuery = `desde=${rango.desde}&hasta=${rango.hasta}&seccion=${seccion}`;
  const diferenciaIva = resumen.ivaRegistradoUsd - resumenCompras.ivaPagadoUsd;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Encabezado */}
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Landmark className="text-accent-600 size-6" aria-hidden />
          <h1 className="font-display text-heading text-2xl font-semibold">Finanzas</h1>
        </div>
        <p className="text-muted-foreground">
          Control interno · resumen de apoyo contable para entregar a tu contador.
        </p>
      </header>

      {/* Leyenda legal — siempre visible */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
        <p className="text-sm leading-relaxed text-amber-800">{LEYENDA}</p>
      </div>

      {/* Selector de período */}
      <div className="flex flex-wrap items-center gap-2">
        {periodos.map((p) => {
          const isActive = !desdeParam && periodoParam === p.value;
          return (
            <Link
              key={p.value}
              href={`/minimarket/finanzas?periodo=${p.value}&seccion=${seccion}`}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-accent-500 text-white"
                  : "border-border text-muted-foreground hover:bg-surface-2 border"
              }`}
            >
              {p.label}
            </Link>
          );
        })}
        <span className="text-muted-foreground text-xs">
          {rango.desde === rango.hasta ? rango.desde : `${rango.desde} → ${rango.hasta}`}
        </span>
      </div>

      {/* Efectivo (caja) + dinero digital (bancos) — foto del momento actual, control total */}
      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-heading text-sm font-semibold">Dinero disponible ahora</p>
          <Link
            href="/minimarket/bancos"
            className="text-accent-600 hover:text-accent-700 text-xs font-medium"
          >
            Ver Bancos →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Efectivo en caja
            </p>
            <p className="text-heading font-display text-lg font-bold tabular-nums">
              {resumenCajaAbierta ? usd(resumenCajaAbierta.esperadoUsd) : "—"}
            </p>
            <p className="text-muted-foreground text-xs tabular-nums">
              {resumenCajaAbierta ? bs(resumenCajaAbierta.esperadoBs) : "Caja cerrada"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">Total en bancos</p>
            <p className="text-heading font-display text-lg font-bold tabular-nums">
              {bs(cuentasBancarias.reduce((s, c) => s + saldoNativoBs(c), 0))}
            </p>
            <p className="text-muted-foreground text-xs tabular-nums">
              {usd(cuentasBancarias.reduce((s, c) => s + saldoNativoUsd(c), 0))} · Zelle
            </p>
          </div>
        </div>
        {cuentasBancarias.length > 0 ? (
          <div className="border-border grid gap-2 border-t pt-3 sm:grid-cols-2">
            {cuentasBancarias.map((c) => {
              const s = saldoNativo(c);
              return (
                <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground truncate">
                    {c.banco} ·{" "}
                    {METODO_CUENTA_LABEL[c.metodo as keyof typeof METODO_CUENTA_LABEL] ?? c.metodo}
                  </span>
                  <span
                    className={`shrink-0 font-medium tabular-nums ${s.monto < 0 ? "text-danger" : "text-heading"}`}
                  >
                    {s.moneda === "USD" ? usd(s.monto) : bs(s.monto)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
      </Card>

      {/* Capital inicial declarado — NUNCA es venta ni ganancia, se muestra
          aparte para que quede identificado (ver migración 0106). Suma
          TODO el histórico, no depende del período seleccionado arriba. USD
          y Bs se muestran SIEMPRE por separado (mismo criterio que "Dinero
          disponible ahora" arriba) — nunca blended en un solo número, porque
          cada moneda es la nativa fija de su cuenta/caja de origen. */}
      {saldosIniciales.totalUsd > 0 || saldosIniciales.totalBs > 0 ? (
        <Card className="space-y-1 p-5">
          <p className="text-heading text-sm font-semibold">Capital inicial declarado</p>
          <p className="text-heading font-display text-lg font-bold tabular-nums">
            {usd(saldosIniciales.totalUsd)}
          </p>
          <p className="text-muted-foreground text-xs tabular-nums">
            {bs(saldosIniciales.totalBs)}
          </p>
          <p className="text-muted-foreground text-xs">
            Saldo con el que arrancó el negocio en caja y cuentas bancarias — no es una venta ni una
            ganancia, es capital declarado.{" "}
            <Link href="/minimarket/configuracion/saldos-iniciales" className="hover:underline">
              Ver detalle →
            </Link>
          </p>
        </Card>
      ) : null}

      {/* Comparativo IVA ventas vs compras — siempre visible, resumen para el contador */}
      <Card className="space-y-3 p-5">
        <p className="text-heading text-sm font-semibold">IVA: ventas vs. compras (referencia)</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              IVA cobrado en ventas
            </p>
            <p className="text-heading font-display text-lg font-bold tabular-nums">
              {mostrarIva ? usd(resumen.ivaRegistradoUsd) : "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              IVA pagado en compras
            </p>
            <p className="text-heading font-display text-lg font-bold tabular-nums">
              {mostrarIva ? usd(resumenCompras.ivaPagadoUsd) : "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Diferencia (solo referencia)
            </p>
            <p className="text-heading font-display text-lg font-bold tabular-nums">
              {mostrarIva ? usd(diferenciaIva) : "—"}
            </p>
          </div>
        </div>
        <p className="text-muted-foreground border-border border-t pt-2 text-xs leading-relaxed">
          Esta diferencia es solo una referencia informativa — <strong>NO</strong> es el IVA neto a
          enterar al SENIAT. El cálculo real del impuesto a pagar/declarar lo determina su contador,
          considerando otros factores (créditos/débitos fiscales, retenciones, períodos de
          declaración, etc.). Consulte siempre a su contador.
        </p>
      </Card>

      {/* Selector Ventas / Compras */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/minimarket/finanzas?periodo=${periodoParam}&seccion=ventas${desdeParam ? `&desde=${desdeParam}&hasta=${hastaParam}` : ""}`}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            seccion === "ventas"
              ? "bg-heading text-white"
              : "border-border text-muted-foreground hover:bg-surface-2 border"
          }`}
        >
          <ShoppingCart className="size-3.5" aria-hidden />
          Ventas
        </Link>
        <Link
          href={`/minimarket/finanzas?periodo=${periodoParam}&seccion=compras${desdeParam ? `&desde=${desdeParam}&hasta=${hastaParam}` : ""}`}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            seccion === "compras"
              ? "bg-heading text-white"
              : "border-border text-muted-foreground hover:bg-surface-2 border"
          }`}
        >
          <ShoppingBag className="size-3.5" aria-hidden />
          Compras
        </Link>
        <Link
          href={`/minimarket/finanzas?periodo=${periodoParam}&seccion=gastos${desdeParam ? `&desde=${desdeParam}&hasta=${hastaParam}` : ""}`}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            seccion === "gastos"
              ? "bg-heading text-white"
              : "border-border text-muted-foreground hover:bg-surface-2 border"
          }`}
        >
          <Receipt className="size-3.5" aria-hidden />
          Gastos
        </Link>
      </div>

      {seccion === "ventas" ? (
        <>
          {/* Tarjetas resumen — ventas */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="space-y-1 p-5">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Total ventas
              </p>
              <p className="text-heading font-display text-xl font-bold tabular-nums">
                {usd(resumen.totalVentasUsd)}
              </p>
              <p className="text-muted-foreground text-xs tabular-nums">
                {bs(resumen.totalVentasBs)}
              </p>
              <p className="text-muted-foreground text-xs">{resumen.numVentas} ventas</p>
            </Card>

            <Card className="space-y-1 p-5">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                IGTF cobrado
              </p>
              {mostrarIgtf ? (
                <>
                  <p className="text-heading font-display text-xl font-bold tabular-nums">
                    {usd(resumen.igtfCobradoUsd)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Sobre {usd(resumen.totalDivisaUsd)} en divisa
                  </p>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground font-display text-xl font-bold">—</p>
                  <p className="text-muted-foreground text-xs">IGTF desactivado en Configuración</p>
                </>
              )}
            </Card>

            <Card className="space-y-1 p-5">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                IVA registrado en ventas
              </p>
              {mostrarIva ? (
                <>
                  <p className="text-heading font-display text-xl font-bold tabular-nums">
                    {usd(resumen.ivaRegistradoUsd)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {ivaPct} % sobre subtotal de ventas
                  </p>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground font-display text-xl font-bold">—</p>
                  <p className="text-muted-foreground text-xs">IVA desactivado en Configuración</p>
                </>
              )}
            </Card>

            <Card className="space-y-1 p-5">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Total cobrado en divisa
              </p>
              <p className="text-heading font-display text-xl font-bold tabular-nums">
                {usd(resumen.totalDivisaUsd)}
              </p>
              <p className="text-muted-foreground text-xs">Base del IGTF (USD efectivo + Zelle)</p>
            </Card>
          </div>

          {/* Tabla de ventas del período */}
          <Card className="overflow-hidden p-0">
            <div className="border-border border-b px-5 py-4">
              <p className="text-heading text-sm font-semibold">
                Ventas del período{" "}
                <span className="text-muted-foreground font-normal">({resumen.numVentas})</span>
              </p>
              <p className="text-muted-foreground text-xs">
                Haz clic en cualquier venta para ver el detalle completo con productos y pagos.
              </p>
            </div>
            {ventas.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3">Número</th>
                      <th className="px-4 py-3">Fecha / hora</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3 text-right">Total USD / Bs</th>
                      {mostrarIva && <th className="px-4 py-3 text-right">IVA registrado</th>}
                      {mostrarIgtf && <th className="px-4 py-3 text-right">IGTF cobrado</th>}
                      <th className="px-4 py-3">Métodos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {ventas.map((v) => (
                      <tr
                        key={v.id}
                        className="hover:bg-surface-2 group cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/minimarket/ventas/${v.id}`}
                            className="text-accent-600 font-mono text-xs font-semibold hover:underline"
                          >
                            {v.numero ?? "—"}
                          </Link>
                        </td>
                        <td className="text-muted-foreground px-4 py-3 text-xs tabular-nums">
                          <Link
                            href={`/minimarket/ventas/${v.id}`}
                            className="hover:text-heading block"
                          >
                            {fmtHora(v.created_at)}
                          </Link>
                        </td>
                        <td className="text-heading px-4 py-3">
                          <Link
                            href={`/minimarket/ventas/${v.id}`}
                            className="block hover:underline"
                          >
                            {v.cliente_nombre ?? (
                              <span className="text-muted-foreground font-normal">
                                Consumidor final
                              </span>
                            )}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/minimarket/ventas/${v.id}`} className="block">
                            <p className="text-heading font-medium tabular-nums">
                              {usd(v.total_usd)}
                            </p>
                            <p className="text-muted-foreground text-xs tabular-nums">
                              {bs(v.total_bs)}
                            </p>
                          </Link>
                        </td>
                        {mostrarIva && (
                          <td className="px-4 py-3 text-right">
                            {v.iva_usd > 0 ? (
                              <span className="text-heading tabular-nums">{usd(v.iva_usd)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        )}
                        {mostrarIgtf && (
                          <td className="px-4 py-3 text-right">
                            {v.igtf_usd > 0 ? (
                              <span className="text-heading tabular-nums">{usd(v.igtf_usd)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {v.metodos.map((m) => (
                              <span
                                key={m}
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${METODO_CHIP[m] ?? "bg-surface-2 text-heading"}`}
                              >
                                {metodoLabel(m)}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground p-8 text-center text-sm">
                No hay ventas en el período seleccionado.
              </p>
            )}
          </Card>

          {/* Desglose por método de pago */}
          <Card className="overflow-hidden p-0">
            <div className="border-border border-b px-5 py-4">
              <p className="text-heading text-sm font-semibold">Desglose por método de pago</p>
              <p className="text-muted-foreground text-xs">
                Montos convertidos a USD usando la tasa de cada pago.
              </p>
            </div>
            {porMetodo.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-5 py-3">Método</th>
                      <th className="px-5 py-3 text-right">Total USD</th>
                      <th className="px-5 py-3 text-right">Total Bs</th>
                      <th className="px-5 py-3 text-right"># Pagos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {porMetodo.map((m) => (
                      <tr key={m.metodo} className="hover:bg-surface-2 transition-colors">
                        <td className="text-heading px-5 py-3 font-medium">
                          {metodoLabel(m.metodo)}
                        </td>
                        <td className="text-heading px-5 py-3 text-right tabular-nums">
                          {usd(m.totalUsd)}
                        </td>
                        <td className="text-muted-foreground px-5 py-3 text-right tabular-nums">
                          {bs(m.totalBs)}
                        </td>
                        <td className="text-muted-foreground px-5 py-3 text-right tabular-nums">
                          {m.numPagos}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground p-8 text-center text-sm">
                No hay ventas en el período seleccionado.
              </p>
            )}
          </Card>

          {/* Nota informativa sobre el IVA */}
          {mostrarIva && (
            <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <Info className="mt-0.5 size-4 shrink-0 text-blue-600" aria-hidden />
              <p className="text-sm text-blue-800">
                El <strong>IVA registrado en ventas</strong> ({ivaPct} %) refleja el impuesto
                incluido en los totales de venta. El cálculo real del IVA neto a enterar al SENIAT
                (ventas−compras) lo determina su contador, no este sistema.
              </p>
            </div>
          )}
        </>
      ) : seccion === "compras" ? (
        <>
          {/* Tarjetas resumen — compras */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="space-y-1 p-5">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Total compras
              </p>
              <p className="text-heading font-display text-xl font-bold tabular-nums">
                {usd(resumenCompras.totalComprasUsd)}
              </p>
              <p className="text-muted-foreground text-xs tabular-nums">
                {bs(resumenCompras.totalComprasBs)}
              </p>
              <p className="text-muted-foreground text-xs">
                {resumenCompras.numCompras} compra{resumenCompras.numCompras !== 1 ? "s" : ""}{" "}
                recibidas
              </p>
            </Card>

            <Card className="space-y-1 p-5">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                IGTF pagado
              </p>
              {mostrarIgtf ? (
                <>
                  <p className="text-heading font-display text-xl font-bold tabular-nums">
                    {usd(resumenCompras.igtfPagadoUsd)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Sobre {usd(resumenCompras.totalDivisaUsd)} pagado en divisa
                  </p>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground font-display text-xl font-bold">—</p>
                  <p className="text-muted-foreground text-xs">IGTF desactivado en Configuración</p>
                </>
              )}
            </Card>

            <Card className="space-y-1 p-5">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                IVA pagado en compras
              </p>
              {mostrarIva ? (
                <>
                  <p className="text-heading font-display text-xl font-bold tabular-nums">
                    {usd(resumenCompras.ivaPagadoUsd)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {ivaPct} % sobre el costo de mercancía
                  </p>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground font-display text-xl font-bold">—</p>
                  <p className="text-muted-foreground text-xs">IVA desactivado en Configuración</p>
                </>
              )}
            </Card>

            <Card className="space-y-1 p-5">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Total pagado en divisa
              </p>
              <p className="text-heading font-display text-xl font-bold tabular-nums">
                {usd(resumenCompras.totalDivisaUsd)}
              </p>
              <p className="text-muted-foreground text-xs">Base del IGTF (USD efectivo + Zelle)</p>
            </Card>
          </div>

          {/* Tabla de compras del período */}
          <Card className="overflow-hidden p-0">
            <div className="border-border border-b px-5 py-4">
              <p className="text-heading text-sm font-semibold">
                Compras del período{" "}
                <span className="text-muted-foreground font-normal">
                  ({resumenCompras.numCompras})
                </span>
              </p>
              <p className="text-muted-foreground text-xs">
                Solo compras ya recibidas. Haz clic en cualquiera para ver el detalle con productos.
              </p>
            </div>
            {compras.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3">Fecha / hora</th>
                      <th className="px-4 py-3">Proveedor</th>
                      <th className="px-4 py-3 text-right">Total USD / Bs</th>
                      {mostrarIva && <th className="px-4 py-3 text-right">IVA pagado</th>}
                      {mostrarIgtf && <th className="px-4 py-3 text-right">IGTF pagado</th>}
                      <th className="px-4 py-3">Método</th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {compras.map((c) => (
                      <tr
                        key={c.id}
                        className="hover:bg-surface-2 group cursor-pointer transition-colors"
                      >
                        <td className="text-muted-foreground px-4 py-3 text-xs tabular-nums">
                          <Link
                            href={`/minimarket/compras/${c.id}`}
                            className="hover:text-heading block"
                          >
                            {fmtHora(c.created_at)}
                          </Link>
                        </td>
                        <td className="text-heading px-4 py-3">
                          <Link
                            href={`/minimarket/compras/${c.id}`}
                            className="block hover:underline"
                          >
                            {c.proveedor_nombre ?? (
                              <span className="text-muted-foreground font-normal">
                                Sin proveedor
                              </span>
                            )}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/minimarket/compras/${c.id}`} className="block">
                            <p className="text-heading font-medium tabular-nums">
                              {usd(c.total_usd)}
                            </p>
                            <p className="text-muted-foreground text-xs tabular-nums">
                              {bs(c.total_bs)}
                            </p>
                          </Link>
                        </td>
                        {mostrarIva && (
                          <td className="px-4 py-3 text-right">
                            {c.iva_usd > 0 ? (
                              <span className="text-heading tabular-nums">{usd(c.iva_usd)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        )}
                        {mostrarIgtf && (
                          <td className="px-4 py-3 text-right">
                            {c.igtf_usd > 0 ? (
                              <span className="text-heading tabular-nums">{usd(c.igtf_usd)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          {c.metodo_pago ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${METODO_CHIP[c.metodo_pago] ?? "bg-surface-2 text-heading"}`}
                            >
                              {metodoLabel(c.metodo_pago)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground p-8 text-center text-sm">
                No hay compras recibidas en el período seleccionado.
              </p>
            )}
          </Card>

          {/* Desglose por proveedor */}
          <Card className="overflow-hidden p-0">
            <div className="border-border border-b px-5 py-4">
              <p className="text-heading text-sm font-semibold">Desglose por proveedor</p>
              <p className="text-muted-foreground text-xs">
                Total pagado (mercancía + IVA + IGTF) por proveedor en el período.
              </p>
            </div>
            {porProveedor.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-5 py-3">Proveedor</th>
                      <th className="px-5 py-3 text-right">Total USD</th>
                      <th className="px-5 py-3 text-right"># Compras</th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {porProveedor.map((p) => (
                      <tr
                        key={p.proveedorId ?? "sin-proveedor"}
                        className="hover:bg-surface-2 transition-colors"
                      >
                        <td className="text-heading px-5 py-3 font-medium">{p.proveedorNombre}</td>
                        <td className="text-heading px-5 py-3 text-right tabular-nums">
                          {usd(p.totalUsd)}
                        </td>
                        <td className="text-muted-foreground px-5 py-3 text-right tabular-nums">
                          {p.numCompras}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground p-8 text-center text-sm">
                No hay compras recibidas en el período seleccionado.
              </p>
            )}
          </Card>

          {/* Nota informativa sobre el IVA de compras */}
          {mostrarIva && (
            <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <Info className="mt-0.5 size-4 shrink-0 text-blue-600" aria-hidden />
              <p className="text-sm text-blue-800">
                El <strong>IVA pagado en compras</strong> ({ivaPct} %) refleja el impuesto que este
                negocio pagó a sus proveedores. Su contador determina si corresponde tomarlo como
                crédito fiscal y cómo se compensa contra el IVA cobrado en ventas.
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Tarjetas resumen — gastos */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="space-y-1 p-5">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Total gastos
              </p>
              <p className="text-heading font-display text-xl font-bold tabular-nums">
                {usd(resumenGastos.totalGastosUsd)}
              </p>
              <p className="text-muted-foreground text-xs">
                {resumenGastos.numGastos} gasto{resumenGastos.numGastos !== 1 ? "s" : ""}
              </p>
            </Card>

            <Card className="space-y-1 p-5">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Pagado en efectivo (caja)
              </p>
              <p className="text-heading font-display text-xl font-bold tabular-nums">
                {usd(resumenGastos.totalEfectivoUsd)}
              </p>
              <p className="text-muted-foreground text-xs">Descontado de la caja física</p>
            </Card>

            <Card className="space-y-1 p-5">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Pagado por método digital
              </p>
              <p className="text-heading font-display text-xl font-bold tabular-nums">
                {usd(resumenGastos.totalDigitalUsd)}
              </p>
              <p className="text-muted-foreground text-xs">
                Pago móvil, transferencia, Zelle o tarjeta — no toca la caja
              </p>
            </Card>
          </div>

          {/* Tabla de gastos del período */}
          <Card className="overflow-hidden p-0">
            <div className="border-border border-b px-5 py-4">
              <p className="text-heading text-sm font-semibold">
                Gastos del período{" "}
                <span className="text-muted-foreground font-normal">
                  ({resumenGastos.numGastos})
                </span>
              </p>
              <p className="text-muted-foreground text-xs">
                Alquiler, sueldos, servicios y demás gastos operativos registrados en el período.
              </p>
            </div>
            {gastos.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3">Gasto</th>
                      <th className="px-4 py-3">Categoría</th>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3 text-right">Monto</th>
                      <th className="px-4 py-3">Origen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {gastos.map((g) => (
                      <tr key={g.id} className="hover:bg-surface-2 transition-colors">
                        <td className="text-heading px-4 py-3">
                          <Link
                            href={`/minimarket/reportes/gastos/${g.id}/editar`}
                            className="hover:underline"
                          >
                            {g.descripcion}
                          </Link>
                        </td>
                        <td className="text-muted-foreground px-4 py-3">
                          {GASTO_CATEGORIA_LABEL[
                            g.categoria as keyof typeof GASTO_CATEGORIA_LABEL
                          ] ?? g.categoria}
                        </td>
                        <td className="text-muted-foreground px-4 py-3 text-xs tabular-nums">
                          {fmtFechaCorta(g.fecha, "UTC")}
                        </td>
                        <td className="text-heading px-4 py-3 text-right font-medium tabular-nums">
                          {usd(g.monto_usd)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${METODO_CHIP[g.metodo_pago ?? ""] ?? "bg-surface-2 text-heading"}`}
                          >
                            {metodoLabel(g.metodo_pago)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground p-8 text-center text-sm">
                No hay gastos registrados en el período seleccionado.
              </p>
            )}
          </Card>

          {/* Desglose por origen */}
          <Card className="overflow-hidden p-0">
            <div className="border-border border-b px-5 py-4">
              <p className="text-heading text-sm font-semibold">Desglose por origen del dinero</p>
              <p className="text-muted-foreground text-xs">
                Efectivo Bs/USD descuenta la caja; el resto solo queda registrado para control.
              </p>
            </div>
            {porMetodoGastos.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-5 py-3">Origen</th>
                      <th className="px-5 py-3 text-right">Total USD</th>
                      <th className="px-5 py-3 text-right"># Gastos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {porMetodoGastos.map((m) => (
                      <tr key={m.metodo} className="hover:bg-surface-2 transition-colors">
                        <td className="text-heading px-5 py-3 font-medium">
                          {metodoLabel(m.metodo)}
                        </td>
                        <td className="text-heading px-5 py-3 text-right tabular-nums">
                          {usd(m.totalUsd)}
                        </td>
                        <td className="text-muted-foreground px-5 py-3 text-right tabular-nums">
                          {m.numGastos}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground p-8 text-center text-sm">
                No hay gastos registrados en el período seleccionado.
              </p>
            )}
          </Card>
        </>
      )}

      {/* Exportar — solo Ventas/Compras: la ruta /finanzas/exportar aún no
          genera PDF/CSV de Gastos (fuera de este alcance). */}
      {seccion !== "gastos" && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-muted-foreground text-sm font-medium">
            Exportar {seccion === "ventas" ? "ventas" : "compras"} del período:
          </p>
          <Link
            href={`/minimarket/finanzas/exportar?tipo=pdf&${exportQuery}&negocio=${encodeURIComponent(negocioNombre)}&tz=${tz}`}
            target="_blank"
            className="border-border text-heading hover:bg-surface-2 inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors"
          >
            <FileText className="size-4" aria-hidden />
            Exportar PDF
          </Link>
          <Link
            href={`/minimarket/finanzas/exportar?tipo=csv&${exportQuery}`}
            className="border-border text-heading hover:bg-surface-2 inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors"
          >
            <Download className="size-4" aria-hidden />
            Exportar CSV
          </Link>
          <p className="text-muted-foreground text-xs">
            El documento exportado incluye la leyenda de control interno y NO constituye una
            declaración fiscal.
          </p>
        </div>
      )}
    </div>
  );
}
