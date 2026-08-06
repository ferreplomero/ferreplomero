import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DollarSign, FileText, Receipt, ShoppingBag, TrendingUp } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import type { MmMetodoPago } from "@arkiteq/db";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listVentas } from "@/lib/minimarket/data/ventas";
import { listClientes } from "@/lib/minimarket/data/clientes";
import { METODOS_PAGO } from "@/lib/minimarket/constants";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fechaEnTz, fmtFechaHora, hoyEnTz } from "@/lib/minimarket/date-format";
import { BotonAnular } from "@/components/minimarket/ventas/boton-anular";

export const metadata: Metadata = { title: "Historial de ventas" };

const METODOS_VALIDOS = new Set(METODOS_PAGO.map((m) => m.value));

function metodoLabel(metodo: string): string {
  return METODOS_PAGO.find((m) => m.value === metodo)?.label ?? metodo;
}

function buildUrl(
  base: Record<string, string | undefined>,
  overrides: Record<string, string | undefined>,
): string {
  const p = new URLSearchParams();
  const merged = { ...base, ...overrides };
  for (const [k, v] of Object.entries(merged)) {
    if (v) p.set(k, v);
  }
  return `/minimarket/ventas?${p.toString()}`;
}

function estadoBadge(v: {
  estado: "completada" | "anulada";
  fiado_estado: "abierto" | "pagado" | "anulado" | null;
}): { label: string; cls: string } {
  if (v.estado === "anulada")
    return { label: "Anulada", cls: "bg-red-100 text-red-600 line-through" };
  if (v.fiado_estado === "abierto") return { label: "Fiada", cls: "bg-orange-100 text-orange-700" };
  if (v.fiado_estado === "pagado") return { label: "Pagada", cls: "bg-green-100 text-green-800" };
  return { label: "Pagada", cls: "bg-green-100 text-green-800" };
}

export default async function VentasHistorialPage({
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

  const hoy = hoyEnTz(tz);
  const haceTreintaDias = fechaEnTz(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    tz,
  );

  const raw = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");

  const desde = raw("desde") || haceTreintaDias;
  const hasta = raw("hasta") || hoy;
  const metodoRaw = raw("metodo");
  const metodo = (METODOS_VALIDOS.has(metodoRaw as MmMetodoPago) ? metodoRaw : "") as
    MmMetodoPago | "";
  const clienteIdFiltro = raw("cliente_id");
  const estadoRaw = raw("estado");
  const estadoFiltro = (estadoRaw === "completada" || estadoRaw === "anulada" ? estadoRaw : "") as
    "completada" | "anulada" | "";
  const folioFiltro = raw("folio");
  const page = Math.max(1, parseInt(raw("page") || "1", 10));

  const currentParams: Record<string, string | undefined> = {
    desde,
    hasta,
    metodo: metodo || undefined,
    cliente_id: clienteIdFiltro || undefined,
    estado: estadoFiltro || undefined,
    folio: folioFiltro || undefined,
  };

  const [resultado, clientes] = await Promise.all([
    listVentas(supabase, tenantId, tz, {
      desde,
      hasta,
      metodo,
      cliente_id: clienteIdFiltro,
      estado: estadoFiltro,
      folio: folioFiltro,
      page,
      per_page: 50,
    }),
    listClientes(supabase, tenantId),
  ]);

  const usd = (n: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(n);
  const bs = (n: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "VES" }).format(n);
  const fechaHoraStr = (s: string) => fmtFechaHora(s, tz);

  const tarjetas = [
    {
      label: "Total del período",
      valor: usd(resultado.sum_total_usd),
      sub: `${resultado.total} venta${resultado.total !== 1 ? "s" : ""}`,
      Icon: TrendingUp,
    },
    {
      label: "Ticket promedio",
      valor: resultado.total > 0 ? usd(resultado.sum_total_usd / resultado.total) : usd(0),
      sub: "por venta",
      Icon: ShoppingBag,
    },
    {
      label: "IGTF cobrado",
      valor: usd(resultado.sum_igtf_usd),
      sub: "3% pagos en divisa",
      Icon: DollarSign,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-heading text-2xl font-semibold">Historial de ventas</h1>
        <p className="text-muted-foreground">
          Consulta, filtra y anula ventas registradas en el sistema.
        </p>
      </header>

      {/* Filtros */}
      <Card className="p-4">
        <form method="GET" action="/minimarket/ventas" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="f-folio" className="text-muted-foreground text-xs font-medium">
              Buscar por folio
            </label>
            <input
              id="f-folio"
              type="text"
              name="folio"
              defaultValue={folioFiltro}
              placeholder="R-000001"
              className="border-border text-heading focus:ring-accent-500 bg-background rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="f-desde" className="text-muted-foreground text-xs font-medium">
              Desde
            </label>
            <input
              id="f-desde"
              type="date"
              name="desde"
              defaultValue={desde}
              className="border-border text-heading focus:ring-accent-500 bg-background rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="f-hasta" className="text-muted-foreground text-xs font-medium">
              Hasta
            </label>
            <input
              id="f-hasta"
              type="date"
              name="hasta"
              defaultValue={hasta}
              className="border-border text-heading focus:ring-accent-500 bg-background rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="f-metodo" className="text-muted-foreground text-xs font-medium">
              Método
            </label>
            <select
              id="f-metodo"
              name="metodo"
              defaultValue={metodo}
              className="border-border text-heading focus:ring-accent-500 bg-background rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
            >
              <option value="">Todos</option>
              {METODOS_PAGO.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="f-cliente" className="text-muted-foreground text-xs font-medium">
              Cliente
            </label>
            <select
              id="f-cliente"
              name="cliente_id"
              defaultValue={clienteIdFiltro}
              className="border-border text-heading focus:ring-accent-500 bg-background max-w-[180px] rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
            >
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="f-estado" className="text-muted-foreground text-xs font-medium">
              Estado
            </label>
            <select
              id="f-estado"
              name="estado"
              defaultValue={estadoFiltro}
              className="border-border text-heading focus:ring-accent-500 bg-background rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
            >
              <option value="">Todos</option>
              <option value="completada">Completada / Fiada</option>
              <option value="anulada">Anulada</option>
            </select>
          </div>
          <button
            type="submit"
            className="bg-accent-500 hover:bg-accent-600 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors"
          >
            Filtrar
          </button>
          <Link
            href="/minimarket/ventas"
            className="border-border text-muted-foreground hover:text-heading rounded-md border px-4 py-2 text-sm transition-colors"
          >
            Limpiar
          </Link>
        </form>
      </Card>

      {/* Resumen */}
      <section className="grid gap-3 sm:grid-cols-3">
        {tarjetas.map(({ label, valor, sub, Icon }) => (
          <Card key={label} className="flex items-center gap-3 p-4">
            <span className="bg-accent-500/12 text-accent-600 inline-flex size-10 shrink-0 items-center justify-center rounded-xl">
              <Icon className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-muted-foreground text-xs">{label}</p>
              <p className="text-heading font-display text-lg font-semibold tabular-nums">
                {valor}
              </p>
              <p className="text-muted-foreground text-xs tabular-nums">{sub}</p>
            </div>
          </Card>
        ))}
      </section>

      {/* Tabla */}
      {resultado.ventas.length === 0 ? (
        <Card className="py-16 text-center">
          <Receipt className="text-muted-foreground mx-auto mb-3 size-10" />
          <p className="text-heading font-medium">Sin ventas en este período</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Ajusta los filtros o registra ventas desde Nueva venta.
          </p>
          <Link
            href="/minimarket/ventas/nueva"
            className="bg-accent-500 hover:bg-accent-600 mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white"
          >
            Nueva venta
          </Link>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <p className="text-heading text-sm font-medium">
              {resultado.total} venta{resultado.total !== 1 ? "s" : ""}
              {resultado.pages > 1 ? ` · página ${resultado.page} de ${resultado.pages}` : ""}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Nº</th>
                  <th className="px-4 py-3">Fecha y hora</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Método(s)</th>
                  <th className="px-4 py-3 text-right">Items</th>
                  <th className="px-4 py-3 text-right">IGTF</th>
                  <th className="px-4 py-3 text-right">Total USD</th>
                  <th className="px-4 py-3 text-right">Total Bs</th>
                  <th className="px-4 py-3">Cajero</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {resultado.ventas.map((v) => {
                  const badge = estadoBadge(v);
                  return (
                    <tr key={v.id} className="hover:bg-surface-2 transition-colors">
                      <td className="text-muted-foreground px-4 py-3 font-mono text-xs">
                        {v.numero ?? "—"}
                      </td>
                      <td className="text-muted-foreground px-4 py-3 text-xs tabular-nums">
                        {fechaHoraStr(v.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        {v.cliente_nombre ? (
                          <Link
                            href={`/minimarket/clientes/${v.cliente_id}`}
                            className="text-accent-600 hover:underline"
                          >
                            {v.cliente_nombre}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Consumidor</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-muted-foreground text-xs">
                          {v.metodos.map(metodoLabel).join(", ") || "—"}
                        </span>
                      </td>
                      <td className="text-muted-foreground px-4 py-3 text-right tabular-nums">
                        {v.num_items}
                      </td>
                      <td className="text-muted-foreground px-4 py-3 text-right tabular-nums">
                        {v.igtf_usd > 0 ? usd(v.igtf_usd) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-heading font-medium tabular-nums">{usd(v.total_usd)}</p>
                      </td>
                      <td className="text-muted-foreground px-4 py-3 text-right tabular-nums">
                        {bs(v.total_bs)}
                      </td>
                      <td className="text-muted-foreground px-4 py-3 text-xs">
                        {v.cajero_nombre ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/minimarket/ventas/${v.id}`}
                            className="text-accent-600 text-xs hover:underline"
                          >
                            <FileText className="mr-0.5 inline size-3.5" />
                            Detalle
                          </Link>
                          {v.estado === "completada" ? <BotonAnular ventaId={v.id} /> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {resultado.pages > 1 ? (
            <div className="border-border flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground text-sm">
                Página {resultado.page} de {resultado.pages} · {resultado.total} resultado
                {resultado.total !== 1 ? "s" : ""}
              </p>
              <div className="flex gap-2">
                {resultado.page > 1 ? (
                  <Link
                    href={buildUrl(currentParams, { page: String(resultado.page - 1) })}
                    className="border-border text-heading hover:bg-surface-2 rounded-md border px-3 py-1.5 text-sm transition-colors"
                  >
                    ← Anterior
                  </Link>
                ) : (
                  <span className="border-border text-muted-foreground rounded-md border px-3 py-1.5 text-sm opacity-40">
                    ← Anterior
                  </span>
                )}
                {resultado.page < resultado.pages ? (
                  <Link
                    href={buildUrl(currentParams, { page: String(resultado.page + 1) })}
                    className="border-border text-heading hover:bg-surface-2 rounded-md border px-3 py-1.5 text-sm transition-colors"
                  >
                    Siguiente →
                  </Link>
                ) : (
                  <span className="border-border text-muted-foreground rounded-md border px-3 py-1.5 text-sm opacity-40">
                    Siguiente →
                  </span>
                )}
              </div>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
