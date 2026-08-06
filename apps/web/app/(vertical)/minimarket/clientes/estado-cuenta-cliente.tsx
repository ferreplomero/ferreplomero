"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Eye,
  MessageCircle,
  Pencil,
  Plus,
  ShoppingBag,
  Undo2,
  Wallet,
} from "lucide-react";
import { Button, Card } from "@arkiteq/ui";
import { fmtFechaHora } from "@/lib/minimarket/date-format";
import { ReciboVentaModal } from "@/components/minimarket/pos/recibo-venta-modal";
import { generarRecordatorioWhatsApp } from "./actions";
import type { EntradaEstadoCuenta, ClienteConSaldo } from "@/lib/minimarket/data/clientes";
import type { MovimientoCredito } from "@/lib/minimarket/data/creditos";

interface EstadoCuentaClienteProps {
  cliente: ClienteConSaldo;
  timeline: EntradaEstadoCuenta[];
  tasa: number;
  locale: string;
  tz: string;
  movimientosCredito: MovimientoCredito[];
}

const LABEL_METODO: Record<string, string> = {
  efectivo_bs: "Efectivo Bs",
  efectivo_usd: "Efectivo USD",
  pago_movil: "Pago móvil",
  transferencia: "Transferencia",
  zelle: "Zelle",
  tarjeta: "Tarjeta",
  cashea: "Cashea",
};

export function EstadoCuentaCliente({
  cliente,
  timeline,
  tasa,
  locale,
  tz,
  movimientosCredito,
}: EstadoCuentaClienteProps) {
  const [enviandoWa, setEnviandoWa] = React.useState(false);
  const [waError, setWaError] = React.useState<string | null>(null);
  const [reciboVentaId, setReciboVentaId] = React.useState<string | null>(null);

  const usd = (v: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(v);
  const bs = (v: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "VES" }).format(v);
  const fecha = (iso: string) => fmtFechaHora(iso, tz);

  const limiteDisponible = Math.max(0, cliente.limite_fiado_usd - cliente.saldo_usd);
  const pctUsado =
    cliente.limite_fiado_usd > 0
      ? Math.min(100, (cliente.saldo_usd / cliente.limite_fiado_usd) * 100)
      : 0;

  async function handleWhatsApp() {
    setEnviandoWa(true);
    setWaError(null);
    try {
      const res = await generarRecordatorioWhatsApp(cliente.id);
      if (res.error) {
        setWaError(res.error);
      } else if (res.url) {
        window.open(res.url, "_blank", "noopener,noreferrer");
      }
    } finally {
      setEnviandoWa(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Alertas */}
      {cliente.moroso ? (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            <strong>Moroso:</strong> tiene deuda pendiente hace más de 30 días.
          </span>
        </div>
      ) : pctUsado >= 85 ? (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            <strong>Cerca del límite:</strong> ha usado el {pctUsado.toFixed(0)}% de su crédito.
          </span>
        </div>
      ) : null}

      {/* Saldo a favor — excedente acreditado en una venta, separado por completo
          de la deuda de fiado. Solo se muestra si el cliente tiene alguno. */}
      {cliente.saldo_favor_usd > 0.001 ? (
        <Card className="flex items-center justify-between gap-3 border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <Wallet className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                Saldo a favor
              </p>
              <p className="text-xs text-emerald-700/80">
                Se puede aplicar como pago en su próxima compra.
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl font-bold tabular-nums text-emerald-700">
              {usd(cliente.saldo_favor_usd)}
            </p>
            <p className="text-sm tabular-nums text-emerald-700/80">
              {bs(cliente.saldo_favor_usd * tasa)}
            </p>
          </div>
        </Card>
      ) : null}

      {/* Cabecera saldo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="col-span-1 space-y-1 p-5">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">Saldo pendiente</p>
          <p className="text-heading font-display text-3xl font-bold tabular-nums">
            {usd(cliente.saldo_usd)}
          </p>
          <p className="text-muted-foreground text-sm tabular-nums">
            {bs(cliente.saldo_usd * tasa)}
          </p>
        </Card>

        <Card className="col-span-1 space-y-1 p-5">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">Límite de fiado</p>
          <p className="text-heading font-display text-3xl font-bold tabular-nums">
            {usd(cliente.limite_fiado_usd)}
          </p>
          <div className="bg-surface-2 mt-2 h-2 w-full overflow-hidden rounded-full">
            <div
              className={`h-full rounded-full transition-all ${
                pctUsado >= 100 ? "bg-red-500" : pctUsado >= 85 ? "bg-amber-400" : "bg-green-500"
              }`}
              style={{ width: `${pctUsado}%` }}
              aria-label={`${pctUsado.toFixed(0)}% utilizado`}
            />
          </div>
          <p className="text-muted-foreground text-xs">Disponible: {usd(limiteDisponible)}</p>
        </Card>

        <Card className="col-span-1 space-y-3 p-5">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">Acciones</p>
          <div className="space-y-2">
            {cliente.saldo_usd > 0 ? (
              <Link href={`/minimarket/clientes/${cliente.id}/abonar`} className="block">
                <Button className="w-full" size="sm">
                  <Plus className="mr-2 size-4" />
                  Registrar abono
                </Button>
              </Link>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleWhatsApp}
              disabled={enviandoWa || (!cliente.whatsapp && !cliente.telefono)}
            >
              <MessageCircle className="mr-2 size-4" />
              {enviandoWa ? "Generando..." : "Recordatorio WhatsApp"}
            </Button>
            <Link href={`/minimarket/clientes/${cliente.id}/editar`} className="block">
              <Button variant="ghost" size="sm" className="w-full">
                <Pencil className="mr-2 size-4" />
                Editar ficha
              </Button>
            </Link>
          </div>
          {waError ? <p className="text-danger text-xs">{waError}</p> : null}
          {!cliente.whatsapp && !cliente.telefono ? (
            <p className="text-muted-foreground text-xs">
              Agrega un teléfono/WhatsApp para enviar recordatorios.
            </p>
          ) : null}
        </Card>
      </div>

      {/* Datos del cliente */}
      <Card className="p-5">
        <h3 className="text-heading mb-3 font-medium">Datos del cliente</h3>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {cliente.cedula ? (
            <>
              <dt className="text-muted-foreground">Cédula</dt>
              <dd>{cliente.cedula}</dd>
            </>
          ) : null}
          {cliente.telefono ? (
            <>
              <dt className="text-muted-foreground">Teléfono</dt>
              <dd>{cliente.telefono}</dd>
            </>
          ) : null}
          {cliente.whatsapp ? (
            <>
              <dt className="text-muted-foreground">WhatsApp</dt>
              <dd>{cliente.whatsapp}</dd>
            </>
          ) : null}
          {cliente.direccion ? (
            <>
              <dt className="text-muted-foreground">Dirección</dt>
              <dd>{cliente.direccion}</dd>
            </>
          ) : null}
          {cliente.notas ? (
            <>
              <dt className="text-muted-foreground">Notas</dt>
              <dd className="sm:col-span-1">{cliente.notas}</dd>
            </>
          ) : null}
        </dl>
      </Card>

      {/* Timeline de movimientos */}
      <div className="space-y-2">
        <h3 className="text-heading font-medium">Estado de cuenta</h3>

        {timeline.length === 0 ? (
          <Card className="py-12 text-center">
            <p className="text-muted-foreground text-sm">
              Este cliente aún no tiene movimientos registrados.
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Movimiento</th>
                    <th className="px-4 py-3 text-right">Monto</th>
                    <th className="px-4 py-3 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {timeline.map((e) => (
                    <tr
                      key={e.id}
                      className={`hover:bg-surface-2 transition-colors ${
                        e.tipo === "fiado" ? "bg-red-50/30" : "bg-green-50/30"
                      }`}
                    >
                      <td className="text-muted-foreground px-4 py-3 text-xs">
                        {fecha(e.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {e.tipo === "fiado" ? (
                            <span className="inline-flex size-6 items-center justify-center rounded-full bg-red-100">
                              <ShoppingBag className="text-danger size-3" />
                            </span>
                          ) : (
                            <span className="inline-flex size-6 items-center justify-center rounded-full bg-green-100">
                              <Undo2 className="size-3 text-green-600" />
                            </span>
                          )}
                          <span>
                            {e.tipo === "fiado" ? (
                              <>
                                {e.numero_documento ? "Venta a fiado" : "Deuda registrada"}
                                {e.numero_documento ? (
                                  <span className="text-muted-foreground ml-1 text-xs">
                                    {e.numero_documento}
                                  </span>
                                ) : null}
                                {e.venta_id ? (
                                  <button
                                    type="button"
                                    onClick={() => setReciboVentaId(e.venta_id ?? null)}
                                    className="text-accent-600 hover:text-accent-700 ml-2 inline-flex items-center gap-1 align-middle text-xs font-medium hover:underline"
                                    aria-label={`Ver recibo de la venta ${e.numero_documento ?? ""}`}
                                  >
                                    <Eye className="size-3.5" aria-hidden />
                                    Ver recibo
                                  </button>
                                ) : null}
                                {e.estado === "pagado" ? (
                                  <span className="ml-2 rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">
                                    Pagado
                                  </span>
                                ) : null}
                                {!e.numero_documento && e.nota ? (
                                  <span className="text-muted-foreground block text-xs">
                                    {e.nota}
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              <>
                                Abono
                                {e.metodo ? (
                                  <span className="text-muted-foreground ml-1 text-xs">
                                    · {LABEL_METODO[e.metodo] ?? e.metodo}
                                  </span>
                                ) : null}
                                {e.igtf_usd && e.igtf_usd > 0 ? (
                                  <span className="ml-1 text-xs text-amber-600">
                                    +{usd(e.igtf_usd)} IGTF
                                  </span>
                                ) : null}
                              </>
                            )}
                          </span>
                        </div>
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-medium tabular-nums ${
                          e.tipo === "fiado" ? "text-danger" : "text-green-600"
                        }`}
                      >
                        {e.tipo === "fiado" ? "+" : "-"}
                        {usd(e.monto_usd)}
                      </td>
                      <td className="text-heading px-4 py-3 text-right tabular-nums">
                        {usd(e.saldo_corriente)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-border border-t">
                  <tr>
                    <td colSpan={3} className="text-muted-foreground px-4 py-3 text-sm">
                      Saldo actual
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-bold tabular-nums ${
                        cliente.saldo_usd > 0 ? "text-heading" : "text-green-600"
                      }`}
                    >
                      {usd(cliente.saldo_usd)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Historial de saldo a favor — completamente separado del timeline de
          fiado de arriba (relación inversa: aquí el negocio le debe al cliente). */}
      {movimientosCredito.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-heading font-medium">Historial de saldo a favor</h3>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Movimiento</th>
                    <th className="px-4 py-3 text-right">Monto USD</th>
                    <th className="px-4 py-3 text-right">Monto Bs</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {movimientosCredito.map((m) => {
                    const esOtorgado = m.tipo === "otorgado";
                    return (
                      <tr key={m.id} className="hover:bg-surface-2 transition-colors">
                        <td className="text-muted-foreground px-4 py-3 text-xs">
                          {fecha(m.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {esOtorgado ? (
                              <ArrowUpCircle className="size-4 shrink-0 text-emerald-600" />
                            ) : (
                              <ArrowDownCircle className="text-muted-foreground size-4 shrink-0" />
                            )}
                            <span>
                              {esOtorgado ? "Excedente acreditado" : "Usado como pago"}
                              {m.motivo ? (
                                <span className="text-muted-foreground ml-1 text-xs">
                                  · {m.motivo}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-medium tabular-nums ${
                            esOtorgado ? "text-emerald-600" : "text-muted-foreground"
                          }`}
                        >
                          {esOtorgado ? "+" : "−"}
                          {usd(m.monto_usd)}
                        </td>
                        <td className="text-muted-foreground px-4 py-3 text-right tabular-nums">
                          {bs(m.monto_bs)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      <ReciboVentaModal
        ventaId={reciboVentaId}
        onOpenChange={(open) => !open && setReciboVentaId(null)}
      />
    </div>
  );
}
