import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { getCompraConItems } from "@/lib/minimarket/data/compras";
import { METODOS_COMPRA } from "@/lib/minimarket/constants";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaCorta, fmtFechaLarga } from "@/lib/minimarket/date-format";
import { parseMetodosPago } from "@/lib/minimarket/metodos-pago";
import { getSesionAbierta } from "@/lib/minimarket/data/caja";
import { listCuentasBancarias } from "@/lib/minimarket/data/bancos";
import { CompraAcciones } from "./compra-acciones";
import { RegistrarPagoCompra } from "./registrar-pago-compra";

function metodoLabel(metodo: string | null): string | null {
  if (!metodo) return null;
  return METODOS_COMPRA.find((m) => m.value === metodo)?.label ?? metodo;
}

interface Props {
  params: Promise<{ id: string }>;
}

// `generateMetadata` y la página se ejecutan por separado — sin memoizar,
// getCompraConItems + getTimezoneNegocio se pedían dos veces en cada carga.
// cache() dedupe por tenantId+id dentro de la misma request (mismo patrón que
// getSessionContext en lib/auth/session.ts).
const cargarCompraDetalle = cache(async (tenantId: string, id: string) => {
  const supabase = await createClient();
  const [compra, tz] = await Promise.all([
    getCompraConItems(supabase, tenantId, id),
    getTimezoneNegocio(supabase, tenantId),
  ]);
  return { compra, tz };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const session = await getSessionContext();
  if (!session?.activeTenant?.id) return { title: "Compra" };
  const { compra: c, tz } = await cargarCompraDetalle(session.activeTenant.id, id);
  return { title: c ? `Compra ${fmtFechaCorta(c.fecha, tz)}` : "Compra" };
}

const ESTADO_BADGE: Record<string, { label: string; cls: string }> = {
  borrador: { label: "Pendiente de recibir", cls: "bg-amber-100 text-amber-700" },
  recibida: { label: "Recibida", cls: "bg-green-100 text-green-700" },
  anulada: { label: "Anulada", cls: "bg-surface-2 text-heading" },
};

export default async function CompraDetallePage({ params }: Props) {
  const { id } = await params;

  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/inicio");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);

  const [{ compra, tz }, tasa, configMetodosRes, sesion, cuentasBancarias] = await Promise.all([
    cargarCompraDetalle(tenantId, id),
    getTasaVigente(supabase, tenantId),
    supabase
      .from("mm_config_negocio")
      .select("metodos_pago")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    getSesionAbierta(supabase, tenantId),
    listCuentasBancarias(supabase, tenantId),
  ]);

  if (!compra) notFound();

  const tasaValor = tasa?.valor ?? 1;
  const usd = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(v);
  const bs = (v: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "VES" }).format(v);

  const badge = ESTADO_BADGE[compra.estado] ?? {
    label: "Pendiente de recibir",
    cls: "bg-amber-100 text-amber-700",
  };

  const metodosPago = parseMetodosPago(configMetodosRes.data?.metodos_pago);
  const pendienteDePago = compra.metodo_pago === "credito_proveedor" && !compra.pagada;
  const totalPagado = Number(compra.total_usd) + Number(compra.iva_usd) + Number(compra.igtf_usd);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/minimarket/compras"
          className="text-muted-foreground hover:text-heading mb-2 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Compras
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-heading text-2xl font-semibold">
              Compra — {fmtFechaLarga(compra.fecha, tz)}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                {badge.label}
              </span>
              {compra.proveedor_nombre ? (
                <span className="text-muted-foreground text-sm">{compra.proveedor_nombre}</span>
              ) : null}
            </div>
          </div>
          <CompraAcciones compraId={compra.id} estado={compra.estado} />
        </div>
      </header>

      {/* Info general */}
      <Card className="grid gap-4 p-5 sm:grid-cols-3">
        <div>
          <p className="text-muted-foreground text-xs">Proveedor</p>
          <p className="text-heading mt-0.5 font-medium">
            {compra.proveedor_nombre ? (
              <Link
                href={`/minimarket/compras/proveedores/${compra.proveedor_id}`}
                className="text-accent-600 hover:underline"
              >
                {compra.proveedor_nombre}
              </Link>
            ) : (
              "Sin proveedor"
            )}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Sucursal</p>
          <p className="text-heading mt-0.5 font-medium">{compra.sucursal_nombre ?? "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Fecha</p>
          <p className="text-heading mt-0.5 font-medium tabular-nums">
            {fmtFechaLarga(compra.fecha, tz)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Método de pago</p>
          <p className="text-heading mt-0.5 font-medium">
            {metodoLabel(compra.metodo_pago) ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Estado de pago</p>
          <p className="mt-0.5">
            {pendienteDePago ? (
              <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                Pendiente de pago
              </span>
            ) : (
              <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                Pagada
              </span>
            )}
          </p>
        </div>
        {compra.notas ? (
          <div className="sm:col-span-3">
            <p className="text-muted-foreground text-xs">Notas</p>
            <p className="text-heading mt-0.5 whitespace-pre-line text-sm">{compra.notas}</p>
          </div>
        ) : null}
      </Card>

      {pendienteDePago && compra.estado !== "anulada" ? (
        <Card className="flex flex-col gap-3 border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-amber-800">
              Esta compra quedó pendiente de pago al proveedor
            </p>
            <p className="mt-0.5 text-sm text-amber-700">
              No se ha descontado nada de caja ni bancos todavía — se registrará cuando confirmes el
              pago. Monto a pagar: <strong>{usd(totalPagado)}</strong> (
              {bs(totalPagado * tasaValor)}
              ).
            </p>
          </div>
          <RegistrarPagoCompra
            compraId={compra.id}
            metodosPago={metodosPago}
            cajaAbierta={Boolean(sesion)}
            cuentasBancarias={cuentasBancarias}
          />
        </Card>
      ) : null}

      {/* Ítems */}
      <Card className="overflow-hidden p-0">
        <div className="border-border border-b px-4 py-3">
          <p className="text-heading text-sm font-medium">
            {compra.items.length} producto{compra.items.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
                <th className="px-4 py-3 text-right">Costo unit.</th>
                <th className="px-4 py-3 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {compra.items.map((item) => {
                const subtotal = item.cantidad * item.costo_unitario_usd;
                return (
                  <tr key={item.id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-heading font-medium">
                        {item.producto_nombre ?? "Producto eliminado"}
                      </p>
                      {item.producto_codigo ? (
                        <p className="text-muted-foreground text-xs">{item.producto_codigo}</p>
                      ) : null}
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-right tabular-nums">
                      {item.cantidad}
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-right tabular-nums">
                      {usd(item.costo_unitario_usd)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-heading font-medium tabular-nums">{usd(subtotal)}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-border border-t">
              <tr>
                <td colSpan={3} className="text-muted-foreground px-4 py-3 text-right text-sm">
                  Subtotal (mercancía)
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="text-heading tabular-nums">{usd(Number(compra.total_usd))}</p>
                </td>
              </tr>
              {Number(compra.iva_usd) > 0 ? (
                <tr>
                  <td colSpan={3} className="text-muted-foreground px-4 py-3 text-right text-sm">
                    IVA pagado
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="text-heading tabular-nums">{usd(Number(compra.iva_usd))}</p>
                  </td>
                </tr>
              ) : null}
              {Number(compra.igtf_usd) > 0 ? (
                <tr>
                  <td colSpan={3} className="text-muted-foreground px-4 py-3 text-right text-sm">
                    IGTF pagado
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="text-heading tabular-nums">{usd(Number(compra.igtf_usd))}</p>
                  </td>
                </tr>
              ) : null}
              <tr>
                <td colSpan={3} className="px-4 py-3 text-right text-sm font-medium">
                  Total pagado
                </td>
                <td className="px-4 py-3 text-right">
                  {(() => {
                    const totalPagado =
                      Number(compra.total_usd) + Number(compra.iva_usd) + Number(compra.igtf_usd);
                    return (
                      <>
                        <p className="text-heading font-display text-lg font-bold tabular-nums">
                          {usd(totalPagado)}
                        </p>
                        <p className="text-muted-foreground text-xs tabular-nums">
                          {bs(totalPagado * tasaValor)}
                        </p>
                      </>
                    );
                  })()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
