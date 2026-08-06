import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  Award,
  BookOpen,
  CreditCard,
  DollarSign,
  Package,
  PackageX,
  Percent,
  ShoppingCart,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import {
  rangoPreset,
  getResumenPeriodo,
  getVentasPorDia,
  getVentasPorMetodo,
  getProductosMasVendidos,
  getInventarioReporte,
  getAlertasNegocio,
} from "@/lib/minimarket/data/reportes";
import { getFinanzasResumen } from "@/lib/minimarket/data/finanzas";
import {
  getResumenCartera,
  listClientes,
  getClientesMasRecurrentes,
} from "@/lib/minimarket/data/clientes";
import { getSesionAbierta, listMovimientosCaja, resumirCaja } from "@/lib/minimarket/data/caja";
import { listAvisosVigentes } from "@/lib/minimarket/data/avisos";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaLarga } from "@/lib/minimarket/date-format";
import { METODOS_PAGO } from "@/lib/minimarket/constants";
import { parseMetodosPago, tieneMedioPagoConfigurado } from "@/lib/minimarket/metodos-pago";
import { moduloPermitido, resolverContextoPermisos } from "@/lib/minimarket/permisos";
import { TableroHeader } from "@/components/minimarket/tablero/tablero-header";
import { MetricaCard } from "@/components/minimarket/tablero/metrica-card";
import { NegocioCard } from "@/components/minimarket/tablero/negocio-card";
import { CajaTile } from "@/components/minimarket/tablero/caja-tile";
import { TasaTablero } from "@/components/minimarket/tablero/tasa-tablero";
import { AvisosBienvenida } from "@/components/minimarket/tablero/avisos-bienvenida";
import { AvisosPlataforma } from "@/components/minimarket/tablero/avisos-plataforma";
import {
  PeriodoSelector,
  type PeriodoValue,
} from "@/components/minimarket/tablero/periodo-selector";
import { RankingCard, type RankingCardRow } from "@/components/minimarket/tablero/ranking-card";
import { VentasChart } from "@/components/minimarket/tablero/ventas-chart-cargador";
import { MetodoPagoChart } from "@/components/minimarket/tablero/metodo-pago-chart-cargador";
import { ProductosChart } from "@/components/minimarket/tablero/productos-chart-cargador";

export const metadata: Metadata = { title: "Tablero" };

const DELAY_BASE = 150;
const DELAY_STEP = 50;

function periodoValido(v: unknown): v is PeriodoValue {
  return v === "hoy" || v === "semana" || v === "mes";
}

export default async function TableroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const params = await searchParams;

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);
  const tz = await getTimezoneNegocio(supabase, tenantId);

  const periodoParam = periodoValido(params.periodo) ? params.periodo : "hoy";
  const desdeParam = typeof params.desde === "string" ? params.desde : undefined;
  const hastaParam = typeof params.hasta === "string" ? params.hasta : undefined;
  const personalizado = Boolean(desdeParam && hastaParam);
  const rango = personalizado
    ? { desde: desdeParam as string, hasta: hastaParam as string }
    : rangoPreset(periodoParam, tz);

  const [
    tasa,
    resumenPeriodo,
    finanzas,
    ventasDia,
    ventasMetodo,
    masVendidos,
    inventario,
    cartera,
    clientesRecurrentes,
    clientesConSaldo,
    alertasNegocio,
    sesionCaja,
    avisosPlataforma,
    configRes,
  ] = await Promise.all([
    getTasaVigente(supabase, tenantId),
    getResumenPeriodo(supabase, tenantId, rango, tz),
    getFinanzasResumen(supabase, tenantId, rango, tz),
    getVentasPorDia(supabase, tenantId, rango, tz),
    getVentasPorMetodo(supabase, tenantId, rango, tz),
    getProductosMasVendidos(supabase, tenantId, rango, tz, 5),
    getInventarioReporte(supabase, tenantId),
    getResumenCartera(supabase, tenantId),
    getClientesMasRecurrentes(supabase, tenantId, rango, tz, 5),
    listClientes(supabase, tenantId),
    getAlertasNegocio(supabase, tenantId, tz),
    getSesionAbierta(supabase, tenantId),
    listAvisosVigentes(supabase, session.user.id),
    supabase
      .from("mm_config_negocio")
      .select(
        "nombre_comercial, rif, direccion, logo_url, parametros, tipo_negocio, datos_completados_en, metodos_pago, aviso_caja_visto, aviso_fiscal_visto, aviso_pagos_visto, medios_saldos_completados_en",
      )
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  const movimientosCaja = sesionCaja
    ? await listMovimientosCaja(supabase, tenantId, sesionCaja.id)
    : [];
  const resumenCaja = sesionCaja ? resumirCaja(sesionCaja, movimientosCaja) : null;

  const config = configRes.data;
  const paramsNegocio = (config?.parametros as Record<string, unknown>) ?? {};
  const igtfActivo = paramsNegocio.igtf_activo !== false;
  const ivaActivo = Boolean(paramsNegocio.iva_activo ?? false);

  // Avisos de bienvenida (descartables): solo a quien de verdad puede
  // atenderlos (un cajero jamás debe ver "Configurar impuestos" si no puede
  // ni entrar a Configuración) y solo mientras el estado real siga siendo el
  // de "recién aprovisionado" — no dependen solo del flag, así que un negocio
  // que ya activó sus impuestos o ya cargó medios de pago deja de verlos aunque
  // nunca los haya descartado a mano.
  const permisos = await resolverContextoPermisos(supabase, tenantId, session.user.id);
  const puedeCaja = moduloPermitido("/minimarket/caja", permisos);
  const puedeConfigurar = moduloPermitido("/minimarket/configuracion", permisos);

  const cajaEnCero =
    Boolean(sesionCaja) &&
    Number(sesionCaja?.monto_inicial_usd ?? 0) === 0 &&
    Number(sesionCaja?.monto_inicial_bs ?? 0) === 0;
  const medioPagoConfigurado = tieneMedioPagoConfigurado(parseMetodosPago(config?.metodos_pago));

  const mostrarAvisoCaja = puedeCaja && !config?.aviso_caja_visto && cajaEnCero;
  const mostrarAvisoFiscal =
    puedeConfigurar && !config?.aviso_fiscal_visto && !igtfActivo && !ivaActivo;
  const mostrarAvisoPagos = puedeConfigurar && !config?.aviso_pagos_visto && !medioPagoConfigurado;

  const tasaValor = tasa?.valor ?? null;
  const fechaLarga = fmtFechaLarga(new Date().toISOString(), tz);

  type Alerta = { mensaje: string; href: string; nivel: "warning" | "danger" };
  const alertas: Alerta[] = [];
  if (params.acceso === "restringido") {
    alertas.push({
      mensaje:
        "Tu rol no tiene acceso a esa sección. Pídele al propietario o administrador que te asigne el rol correcto en Configuración.",
      href: "/minimarket",
      nivel: "warning",
    });
  }
  if (!sesionCaja) {
    alertas.push({
      mensaje: "No hay turno de caja abierto. Abre la caja para registrar ventas y movimientos.",
      href: "/minimarket/caja",
      nivel: "warning",
    });
  }
  if (alertasNegocio.productosBajoMinimo > 0) {
    alertas.push({
      mensaje: `${alertasNegocio.productosBajoMinimo} producto${alertasNegocio.productosBajoMinimo !== 1 ? "s" : ""} bajo el stock mínimo. Considera hacer una compra pronto.`,
      href: "/minimarket/inventario",
      nivel: "warning",
    });
  }
  if (alertasNegocio.clientesMorosos > 0) {
    alertas.push({
      mensaje: `${alertasNegocio.clientesMorosos} cliente${alertasNegocio.clientesMorosos !== 1 ? "s" : ""} con deuda de más de 30 días sin abonar.`,
      href: "/minimarket/fiado/morosos",
      nivel: "danger",
    });
  }
  // Aviso persistente (no descartable, a diferencia de `AvisosBienvenida`) de
  // la configuración obligatoria de medios de pago y saldo inicial —
  // migración 0106. Solo desaparece cuando de verdad se completa.
  if (puedeConfigurar && !config?.medios_saldos_completados_en) {
    alertas.push({
      mensaje:
        "Aún no configuraste tus medios de pago ni el saldo inicial de tu caja/cuentas — hazlo para que Bancos, Caja y Finanzas partan de cifras reales.",
      href: "/minimarket/configuracion/saldos-iniciales",
      nivel: "warning",
    });
  }

  const usd = (v: number) =>
    new Intl.NumberFormat(country.locale, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(v);

  const ticketPromedioStr =
    resumenPeriodo.numVentas > 0
      ? `${usd(resumenPeriodo.ticketPromedioUsd)} c/u`
      : "Sin ventas aún";

  const margenStr =
    resumenPeriodo.totalVentasUsd > 0
      ? `${((resumenPeriodo.utilidadEstimadaUsd / resumenPeriodo.totalVentasUsd) * 100).toFixed(1)}% margen estimado`
      : "Sin ventas aún";

  const clientesConDeudaStr = `${cartera.clientesConDeuda} cliente${cartera.clientesConDeuda !== 1 ? "s" : ""} con saldo`;

  // ── Tarjetas de métricas del período (multimoneda vía MetricaCard) ────────
  const metricas: {
    key: string;
    label: string;
    valor: number;
    tasa?: number;
    sub?: string;
    icon: ReactNode;
    href: string;
    formato?: "usd" | "entero";
  }[] = [
    {
      key: "ventas",
      label: "Ventas del período",
      valor: resumenPeriodo.totalVentasUsd,
      tasa: tasaValor ?? undefined,
      sub: `${resumenPeriodo.numVentas} venta${resumenPeriodo.numVentas !== 1 ? "s" : ""}`,
      icon: <TrendingUp className="size-5" aria-hidden />,
      href: "/minimarket/ventas",
    },
    {
      key: "ganancia",
      label: "Ganancia estimada",
      valor: resumenPeriodo.utilidadEstimadaUsd,
      tasa: tasaValor ?? undefined,
      sub: margenStr,
      icon: <TrendingUp className="size-5" aria-hidden />,
      href: "/minimarket/reportes",
    },
    {
      key: "ticket",
      label: "Ticket promedio",
      valor: resumenPeriodo.ticketPromedioUsd,
      tasa: tasaValor ?? undefined,
      sub: ticketPromedioStr,
      icon: <ShoppingCart className="size-5" aria-hidden />,
      href: "/minimarket/ventas",
    },
    ...(igtfActivo
      ? [
          {
            key: "igtf",
            label: "IGTF cobrado",
            valor: resumenPeriodo.igtfUsd,
            tasa: tasaValor ?? undefined,
            icon: (<Percent className="size-5" aria-hidden />) as ReactNode,
            href: "/minimarket/finanzas",
          },
        ]
      : []),
    ...(ivaActivo
      ? [
          {
            key: "iva",
            label: "IVA registrado",
            valor: finanzas.resumen.ivaRegistradoUsd,
            tasa: tasaValor ?? undefined,
            icon: (<DollarSign className="size-5" aria-hidden />) as ReactNode,
            href: "/minimarket/finanzas",
          },
        ]
      : []),
    {
      key: "fiado",
      label: "Fiado otorgado",
      valor: resumenPeriodo.fiadoOtorgadoUsd,
      tasa: tasaValor ?? undefined,
      icon: <CreditCard className="size-5" aria-hidden />,
      href: "/minimarket/fiado",
    },
    {
      key: "cartera",
      label: "Cartera por cobrar",
      valor: cartera.totalCarteraUsd,
      tasa: tasaValor ?? undefined,
      sub: clientesConDeudaStr,
      icon: <Users className="size-5" aria-hidden />,
      href: "/minimarket/fiado",
    },
  ];

  // ── Datos derivados para gráficas y tarjetas de resumen ────────────────────
  const ventasChartData = ventasDia.map((d) => ({ fecha: d.fecha, totalUsd: d.total_usd }));

  const metodoChartData = ventasMetodo.map((m) => ({
    metodo: m.metodo,
    label: METODOS_PAGO.find((x) => x.value === m.metodo)?.label ?? m.metodo,
    valorUsd: m.moneda === "USD" ? m.monto_total : tasaValor ? m.monto_total / tasaValor : 0,
  }));

  const productosChartData = masVendidos.map((p) => ({
    nombre: p.descripcion,
    ingresoUsd: p.ingreso_usd,
  }));

  const filasMasVendidos: RankingCardRow[] = masVendidos.map((p) => ({
    key: p.producto_id ?? p.descripcion,
    titulo: p.descripcion,
    subtitulo: `${p.unidades} unidad${p.unidades !== 1 ? "es" : ""}`,
    valor: usd(p.ingreso_usd),
  }));

  const stockBajo = inventario.items.filter((i) => i.bajo_minimo).slice(0, 5);
  const filasStockBajo: RankingCardRow[] = stockBajo.map((i) => ({
    key: i.id,
    titulo: i.nombre,
    subtitulo: i.categoria ?? undefined,
    valor: `${i.stock_actual} / mín. ${i.stock_minimo ?? 0}`,
    tono: "warning",
  }));

  const filasClientesRecurrentes: RankingCardRow[] = clientesRecurrentes.map((c) => ({
    key: c.cliente_id,
    titulo: c.nombre,
    subtitulo: `${c.num_compras} compra${c.num_compras !== 1 ? "s" : ""}`,
    valor: usd(c.total_usd),
  }));

  const topDeudores = clientesConSaldo
    .filter((c) => c.saldo_usd > 0.01)
    .sort((a, b) => b.saldo_usd - a.saldo_usd)
    .slice(0, 5);
  const filasDeudores: RankingCardRow[] = topDeudores.map((c) => ({
    key: c.id,
    titulo: c.nombre,
    subtitulo: c.moroso ? "Moroso (+30 días)" : undefined,
    valor: usd(c.saldo_usd),
    tono: "danger",
  }));

  const accesosRapidos = [
    { label: "Nueva venta", href: "/minimarket/pos", Icon: ShoppingCart, primary: true },
    { label: "Registrar compra", href: "/minimarket/compras/nueva", Icon: Package, primary: false },
    { label: "Registrar abono", href: "/minimarket/clientes", Icon: CreditCard, primary: false },
    { label: "Ver reportes", href: "/minimarket/reportes", Icon: BookOpen, primary: false },
  ];

  let delay = DELAY_BASE + DELAY_STEP * 2;

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-8">
      {/* 1. Encabezado de bienvenida */}
      <TableroHeader
        nombreNegocio={config?.nombre_comercial || session.activeTenant?.name || "Tu negocio"}
        fechaLarga={fechaLarga}
      />

      {/* 1.5 Avisos importantes publicados por el admin (/admin/avisos) */}
      <AvisosPlataforma avisos={avisosPlataforma} animationDelay={90} />

      {/* 2. Estado del negocio */}
      <NegocioCard config={config} animationDelay={100} />

      {/* 2.5 Avisos de bienvenida (descartables, no bloqueantes) */}
      <AvisosBienvenida
        mostrarCaja={mostrarAvisoCaja}
        mostrarFiscal={mostrarAvisoFiscal}
        mostrarPagos={mostrarAvisoPagos}
        animationDelay={110}
      />

      {/* 3. Alertas (solo si hay algo) */}
      {alertas.length > 0 ? (
        <div
          className="animate-fade-up space-y-2 motion-reduce:animate-none"
          style={{ animationDelay: "120ms" }}
        >
          {alertas.map((a, i) => (
            <Link
              key={i}
              href={a.href}
              className={[
                "flex items-center gap-3 rounded-xl border px-4 py-3.5 text-sm transition-colors",
                a.nivel === "danger"
                  ? "border-red-200 bg-red-50 text-red-800 hover:bg-red-100"
                  : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
              ].join(" ")}
            >
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              <span>{a.mensaje}</span>
              <span className="ml-auto shrink-0 font-semibold">Ver →</span>
            </Link>
          ))}
        </div>
      ) : null}

      {/* 4. Filtro de período */}
      <div
        className="animate-fade-up motion-reduce:animate-none"
        style={{ animationDelay: "140ms" }}
      >
        <PeriodoSelector
          basePath="/minimarket"
          periodoActivo={periodoParam}
          personalizado={personalizado}
          desde={rango.desde}
          hasta={rango.hasta}
        />
      </div>

      {/* 5. Métricas del período */}
      <section className="space-y-3">
        <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-widest">
          Resumen del período
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metricas.map((m, i) => (
            <MetricaCard
              key={m.key}
              label={m.label}
              valor={m.valor}
              tasa={m.tasa}
              sub={m.sub}
              iconEl={m.icon}
              href={m.href}
              formato={m.formato}
              animationDelay={DELAY_BASE + DELAY_STEP * i}
              locale={country.locale}
            />
          ))}
          <CajaTile
            abierta={Boolean(sesionCaja && resumenCaja)}
            esperadoUsd={resumenCaja?.esperadoUsd ?? 0}
            esperadoBs={resumenCaja?.esperadoBs ?? 0}
            locale={country.locale}
            animationDelay={DELAY_BASE + DELAY_STEP * metricas.length}
          />
        </div>
      </section>

      {/* 6. Gráficas */}
      <section className="space-y-3">
        <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-widest">
          Ventas del período
        </h2>

        <div
          className="bg-surface border-border animate-fade-up rounded-xl border p-5 motion-reduce:animate-none"
          style={{ animationDelay: `${(delay += DELAY_STEP)}ms` }}
        >
          <h3 className="text-heading mb-3 text-sm font-semibold">Ventas en el tiempo</h3>
          <VentasChart data={ventasChartData} locale={country.locale} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div
            className="bg-surface border-border animate-fade-up rounded-xl border p-5 motion-reduce:animate-none"
            style={{ animationDelay: `${(delay += DELAY_STEP)}ms` }}
          >
            <h3 className="text-heading mb-3 text-sm font-semibold">Por método de pago</h3>
            <MetodoPagoChart data={metodoChartData} locale={country.locale} />
          </div>
          <div
            className="bg-surface border-border animate-fade-up rounded-xl border p-5 motion-reduce:animate-none"
            style={{ animationDelay: `${(delay += DELAY_STEP)}ms` }}
          >
            <h3 className="text-heading mb-3 text-sm font-semibold">Productos más vendidos</h3>
            <ProductosChart data={productosChartData} locale={country.locale} />
          </div>
        </div>
      </section>

      {/* 7. Resumen del negocio */}
      <section className="space-y-3">
        <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-widest">
          Resumen del negocio
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <RankingCard
            titulo="Productos más vendidos"
            icono={<Award className="size-4" aria-hidden />}
            filas={filasMasVendidos}
            href="/minimarket/reportes"
            vacioTexto="Aún no hay ventas en este período."
            animationDelay={(delay += DELAY_STEP)}
          />
          <RankingCard
            titulo="Stock bajo / por agotarse"
            icono={<PackageX className="size-4" aria-hidden />}
            filas={filasStockBajo}
            href="/minimarket/inventario"
            vacioTexto="Todo el inventario está por encima del mínimo."
            animationDelay={(delay += DELAY_STEP)}
          />
          <RankingCard
            titulo="Clientes más recurrentes"
            icono={<UserCheck className="size-4" aria-hidden />}
            filas={filasClientesRecurrentes}
            href="/minimarket/clientes"
            vacioTexto="Aún no hay compras de clientes en este período."
            animationDelay={(delay += DELAY_STEP)}
          />
          <RankingCard
            titulo="Mayor deuda de fiado"
            icono={<AlertTriangle className="size-4" aria-hidden />}
            filas={filasDeudores}
            href="/minimarket/fiado"
            vacioTexto="No hay cuentas por cobrar pendientes."
            animationDelay={(delay += DELAY_STEP)}
          />
        </div>
      </section>

      {/* 8. Tasa del día */}
      <TasaTablero
        tasa={tasa ?? null}
        animationDelay={(delay += DELAY_STEP)}
        locale={country.locale}
      />

      {/* 9. Accesos rápidos */}
      <section
        className="animate-fade-up space-y-3 motion-reduce:animate-none"
        style={{ animationDelay: `${(delay += DELAY_STEP)}ms` }}
      >
        <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-widest">
          Accesos rápidos
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {accesosRapidos.map(({ label, href, Icon, primary }) => (
            <Link
              key={href}
              href={href}
              className={[
                "flex items-center justify-center gap-2.5 rounded-xl px-6 py-4 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
                primary
                  ? "bg-accent-500 hover:bg-accent-600 text-white shadow-sm"
                  : "border-border bg-surface hover:bg-surface-2 text-heading border",
              ].join(" ")}
            >
              <Icon className="size-[18px] shrink-0" aria-hidden />
              {label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
