import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, History, ImageIcon, LineChart, Store } from "lucide-react";
import { Button, Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getProductoDetalle, type MovimientoConDetalle } from "@/lib/minimarket/data/inventario";
import { sucursalesPermitidas } from "@/lib/minimarket/sucursal-acceso";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaHora, fmtFechaCorta } from "@/lib/minimarket/date-format";
import { margenSobreCosto, opcionesImpuesto } from "@/lib/minimarket/producto-opciones";

export const metadata: Metadata = { title: "Detalle de producto" };

const ETIQUETA_MOV: Record<MovimientoConDetalle["tipo"], { texto: string; clase: string }> = {
  entrada: { texto: "Entrada", clase: "bg-success/12 text-success" },
  salida: { texto: "Salida", clase: "bg-warning/15 text-warning" },
  merma: { texto: "Merma", clase: "bg-danger/12 text-danger" },
  ajuste: { texto: "Ajuste", clase: "bg-accent-500/12 text-accent-600" },
};

export default async function ProductoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);

  const sucursales = await sucursalesPermitidas(supabase, tenantId, session.user.id);
  const [detalle, tasa, tz] = await Promise.all([
    getProductoDetalle(supabase, tenantId, id, sucursales),
    getTasaVigente(supabase, tenantId),
    getTimezoneNegocio(supabase, tenantId),
  ]);
  if (!detalle) notFound();

  const { producto, stockPorSucursal, precios, movimientos } = detalle;
  const valorTasa = tasa ? tasa.valor : null;

  const money = (valor: number, moneda: string) => {
    try {
      return new Intl.NumberFormat(country.locale, { style: "currency", currency: moneda }).format(
        valor,
      );
    } catch {
      return `${moneda} ${valor.toFixed(2)}`;
    }
  };
  const bs = (usd: number) => (valorTasa ? money(usd * valorTasa, "VES") : null);
  const fechaHora = { format: (d: Date) => fmtFechaHora(d.toISOString(), tz) };
  const fechaCorta = { format: (d: Date) => fmtFechaCorta(d.toISOString(), tz) };

  const margen = margenSobreCosto(Number(producto.costo_usd), Number(producto.precio_usd));
  const impuestoLabel =
    opcionesImpuesto(country).find((o) => o.id === producto.impuesto_id)?.label ??
    producto.impuesto_id;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/minimarket/inventario">
            <ArrowLeft className="size-4" />
            Inventario
          </Link>
        </Button>

        {/* Cabecera del producto */}
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
          <div className="bg-surface-2 border-border relative size-24 shrink-0 overflow-hidden rounded-lg border">
            {producto.imagen_url ? (
              <Image
                src={producto.imagen_url}
                alt={producto.nombre}
                width={96}
                height={96}
                className="size-24 object-cover"
              />
            ) : (
              <div className="text-muted-foreground/60 flex size-full items-center justify-center">
                <ImageIcon className="size-7" aria-hidden />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-heading text-2xl font-semibold">
                {producto.nombre}
              </h1>
              {!producto.activo ? (
                <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
                  Inactivo
                </span>
              ) : producto.bajo_minimo ? (
                <span className="bg-warning/15 text-warning inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
                  Bajo mínimo
                </span>
              ) : (
                <span className="bg-success/12 text-success inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
                  En stock
                </span>
              )}
            </div>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {producto.codigo ? <span>SKU: {producto.codigo}</span> : null}
              <span>{producto.categoria_nombre ?? "Sin categoría"}</span>
              <span>{producto.tipo_venta === "granel" ? "A granel" : "Por unidad"}</span>
              <span>Unidad: {producto.unidad}</span>
            </div>
            {(producto.etiquetas ?? []).length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {(producto.etiquetas ?? []).map((t) => (
                  <span
                    key={t}
                    className="bg-accent-500/10 text-accent-600 rounded-full px-2 py-0.5 text-xs font-medium"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            {producto.codigos.length > 0 ? (
              <p className="text-muted-foreground text-xs">
                Códigos de barras:{" "}
                <span className="tabular-nums">{producto.codigos.join(" · ")}</span>
              </p>
            ) : null}
          </div>
        </Card>
      </div>

      {/* Datos comerciales */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DatoCard
          label="Precio de compra"
          valor={Number(producto.costo_usd) > 0 ? money(Number(producto.costo_usd), "USD") : "—"}
          sub={Number(producto.costo_usd) > 0 ? bs(Number(producto.costo_usd)) : null}
        />
        <DatoCard
          label="Precio de venta"
          valor={money(Number(producto.precio_usd), "USD")}
          sub={bs(Number(producto.precio_usd))}
        />
        <DatoCard
          label="Margen"
          valor={margen === null ? "—" : `${margen.toFixed(1)}%`}
          sub={`Ganancia ${money(Number(producto.precio_usd) - Number(producto.costo_usd), "USD")}`}
        />
        <DatoCard
          label="Stock total"
          valor={`${producto.stock_actual} ${producto.unidad}`}
          sub={producto.stock_minimo ? `Mínimo ${producto.stock_minimo}` : "Sin mínimo"}
        />
      </section>

      {/* Fiscal / proveedor */}
      <Card className="grid gap-4 p-5 sm:grid-cols-3">
        <Dato label="Impuesto" valor={impuestoLabel} />
        <Dato label="IGTF en divisa" valor={producto.aplica_igtf ? "Aplica (3%)" : "No aplica"} />
        <Dato label="Proveedor habitual" valor={producto.proveedor_nombre ?? "—"} />
      </Card>

      {/* Stock por sucursal */}
      {stockPorSucursal.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-heading flex items-center gap-2 font-medium">
            <Store className="text-accent-600 size-4" aria-hidden />
            Stock por sucursal
          </h2>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 font-medium">Sucursal</th>
                    <th className="px-4 py-3 text-right font-medium">Stock</th>
                    <th className="px-4 py-3 text-right font-medium">Mínimo</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {stockPorSucursal.map((s) => {
                    const bajo = s.stock_minimo > 0 && s.stock_actual <= s.stock_minimo;
                    return (
                      <tr key={s.sucursal_id} className="border-border/70 border-b last:border-0">
                        <td className="text-heading px-4 py-3">{s.sucursal_nombre}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {s.stock_actual}{" "}
                          <span className="text-muted-foreground">{producto.unidad}</span>
                        </td>
                        <td className="text-muted-foreground px-4 py-3 text-right tabular-nums">
                          {s.stock_minimo || "—"}
                        </td>
                        <td className="px-4 py-3">
                          {bajo ? (
                            <span className="bg-warning/15 text-warning inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
                              Bajo mínimo
                            </span>
                          ) : (
                            <span className="bg-success/12 text-success inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
                              En stock
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      ) : null}

      {/* Histórico de precios */}
      <section className="space-y-3">
        <h2 className="text-heading flex items-center gap-2 font-medium">
          <LineChart className="text-accent-600 size-4" aria-hidden />
          Histórico de precios
        </h2>
        {precios.length === 0 ? (
          <Card className="text-muted-foreground p-6 text-center text-sm">
            Aún no hay cambios de precio registrados.
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 font-medium">Vigente desde</th>
                    <th className="px-4 py-3 text-right font-medium">Precio (USD)</th>
                    <th className="px-4 py-3 text-right font-medium">Precio (Bs)</th>
                  </tr>
                </thead>
                <tbody>
                  {precios.map((p, i) => (
                    <tr
                      key={`${p.vigente_desde}-${i}`}
                      className="border-border/70 border-b last:border-0"
                    >
                      <td className="text-muted-foreground whitespace-nowrap px-4 py-3">
                        {fechaCorta.format(new Date(p.vigente_desde))}
                        {i === 0 ? (
                          <span className="bg-accent-500/12 text-accent-600 ml-2 rounded-full px-1.5 py-0.5 text-xs font-medium">
                            Actual
                          </span>
                        ) : null}
                      </td>
                      <td className="text-heading px-4 py-3 text-right tabular-nums">
                        {money(p.precio_usd, "USD")}
                      </td>
                      <td className="text-muted-foreground px-4 py-3 text-right tabular-nums">
                        {bs(p.precio_usd) ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* Histórico de movimientos */}
      <section className="space-y-3">
        <h2 className="text-heading flex items-center gap-2 font-medium">
          <History className="text-accent-600 size-4" aria-hidden />
          Movimientos del producto
        </h2>
        {movimientos.length === 0 ? (
          <Card className="text-muted-foreground p-6 text-center text-sm">
            Este producto aún no tiene movimientos de inventario.
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 text-right font-medium">Cantidad</th>
                    <th className="px-4 py-3 font-medium">Sucursal</th>
                    <th className="px-4 py-3 font-medium">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m) => {
                    const etq = ETIQUETA_MOV[m.tipo];
                    return (
                      <tr key={m.id} className="border-border/70 border-b last:border-0">
                        <td className="text-muted-foreground whitespace-nowrap px-4 py-3">
                          {fechaHora.format(new Date(m.created_at))}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${etq.clase}`}
                          >
                            {etq.texto}
                          </span>
                        </td>
                        <td
                          className={`px-4 py-3 text-right tabular-nums ${m.cantidad < 0 ? "text-danger" : "text-success"}`}
                        >
                          {m.cantidad > 0 ? "+" : ""}
                          {m.cantidad}
                        </td>
                        <td className="text-muted-foreground px-4 py-3">{m.sucursal_nombre}</td>
                        <td className="text-muted-foreground px-4 py-3">{m.motivo ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}

function DatoCard({ label, valor, sub }: { label: string; valor: string; sub?: string | null }) {
  return (
    <Card className="space-y-1 p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-heading font-display text-lg font-semibold tabular-nums">{valor}</p>
      {sub ? <p className="text-muted-foreground text-xs tabular-nums">{sub}</p> : null}
    </Card>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-heading font-medium">{valor}</p>
    </div>
  );
}
