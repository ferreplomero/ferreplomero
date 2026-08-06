"use client";

import * as React from "react";
import { ArrowDownCircle, ArrowUpCircle, Lock, PiggyBank, Plus, Wallet } from "lucide-react";
import { Button, Card, Dialog, DialogContent } from "@arkiteq/ui";
import type { MovimientoCaja, ResumenCaja } from "@/lib/minimarket/data/caja";
import { fmtFechaHora } from "@/lib/minimarket/date-format";
import { MOTIVO_SALDO_INICIAL } from "@/lib/minimarket/data/saldos-iniciales";
import { MovimientoCajaForm } from "./movimiento-caja-form";
import { SaldoInicialCajaForm } from "./saldo-inicial-caja-form";
import { CerrarCajaForm } from "./cerrar-caja-form";

interface SesionResumen {
  id: string;
  monto_inicial_usd: number;
  monto_inicial_bs: number;
  abierta_en: string;
}

interface CajaClienteProps {
  sesion: SesionResumen;
  movimientos: MovimientoCaja[];
  resumen: ResumenCaja;
  locale: string;
  tz: string;
  tenantId: string;
  usuarioId: string;
  onMovimientoLocal: (movimiento: MovimientoCaja) => void;
  onCierreLocal: () => void;
}

const TIPO_LABEL: Record<MovimientoCaja["tipo"], string> = {
  ingreso: "Ingreso",
  egreso: "Egreso",
  retiro: "Retiro",
  venta: "Venta",
};

export function CajaCliente({
  sesion,
  movimientos,
  resumen,
  locale,
  tz,
  tenantId,
  usuarioId,
  onMovimientoLocal,
  onCierreLocal,
}: CajaClienteProps) {
  const [movOpen, setMovOpen] = React.useState(false);
  const [saldoInicialOpen, setSaldoInicialOpen] = React.useState(false);
  const [cerrarOpen, setCerrarOpen] = React.useState(false);

  const money = (valor: number, moneda: string) => {
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency: moneda }).format(valor);
    } catch {
      return `${moneda} ${valor.toFixed(2)}`;
    }
  };
  const fecha = { format: (d: Date) => fmtFechaHora(d.toISOString(), tz) };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="bg-success/12 text-success inline-flex size-11 items-center justify-center rounded-xl">
            <Wallet className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-heading font-medium">Caja abierta</p>
            <p className="text-muted-foreground text-sm">
              Desde {fecha.format(new Date(sesion.abierta_en))}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Button
            variant="outline"
            className="border-accent-300 text-accent-700 hover:bg-accent-500/10"
            onClick={() => setSaldoInicialOpen(true)}
          >
            <PiggyBank className="size-4" />
            Saldo inicial
          </Button>
          <Button variant="outline" onClick={() => setMovOpen(true)}>
            <Plus className="size-4" />
            Movimiento
          </Button>
          <Button onClick={() => setCerrarOpen(true)}>
            <Lock className="size-4" />
            Cerrar caja
          </Button>
        </div>
      </div>

      {/* Efectivo esperado */}
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            { label: "Efectivo esperado USD", valor: resumen.esperadoUsd, moneda: "USD" },
            { label: "Efectivo esperado Bs", valor: resumen.esperadoBs, moneda: "VES" },
          ] as const
        ).map((c) => (
          <Card key={c.label} className="p-4">
            <p className="text-muted-foreground text-xs">{c.label}</p>
            <p className="text-heading font-display text-2xl font-semibold tabular-nums">
              {money(c.valor, c.moneda)}
            </p>
          </Card>
        ))}
      </div>

      {/* Desglose */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            {
              label: "Ventas USD",
              valor: resumen.ventasUsd,
              moneda: "USD",
              Icon: ArrowUpCircle,
              tono: "text-success",
            },
            {
              label: "Ventas Bs",
              valor: resumen.ventasBs,
              moneda: "VES",
              Icon: ArrowUpCircle,
              tono: "text-success",
            },
            {
              label: "Ingresos",
              valor: resumen.ingresosUsd + resumen.ingresosBs,
              moneda: null,
              Icon: ArrowUpCircle,
              tono: "text-accent-600",
            },
            {
              label: "Egresos/retiros",
              valor: resumen.egresosUsd + resumen.egresosBs,
              moneda: null,
              Icon: ArrowDownCircle,
              tono: "text-warning",
            },
          ] as const
        ).map((c) => (
          <Card key={c.label} className="flex items-center gap-2 p-3">
            <c.Icon className={`size-5 ${c.tono}`} aria-hidden />
            <div className="min-w-0">
              <p className="text-muted-foreground truncate text-xs">{c.label}</p>
              <p className="text-heading text-sm font-semibold tabular-nums">
                {c.moneda ? money(c.valor, c.moneda) : c.valor.toFixed(2)}
              </p>
            </div>
          </Card>
        ))}
      </div>

      {/* Movimientos */}
      <Card className="overflow-hidden p-0">
        <div className="border-border text-heading border-b px-4 py-3 text-sm font-medium">
          Movimientos del turno
        </div>
        {movimientos.length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm">
            Sin movimientos. Las ventas en efectivo aparecen aquí.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Hora</th>
                  <th className="px-4 py-2.5 font-medium">Tipo</th>
                  <th className="px-4 py-2.5 font-medium">Motivo</th>
                  <th className="px-4 py-2.5 text-right font-medium">Monto</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => {
                  const suma = m.tipo === "ingreso" || m.tipo === "venta";
                  const esSaldoInicial = m.motivo === MOTIVO_SALDO_INICIAL;
                  return (
                    <tr key={m.id} className="border-border/70 border-b last:border-0">
                      <td className="text-muted-foreground whitespace-nowrap px-4 py-2.5">
                        {fecha.format(new Date(m.created_at))}
                      </td>
                      <td className="px-4 py-2.5">
                        {esSaldoInicial ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                            Saldo inicial
                          </span>
                        ) : (
                          TIPO_LABEL[m.tipo]
                        )}
                      </td>
                      <td className="text-muted-foreground px-4 py-2.5">{m.motivo ?? "—"}</td>
                      <td
                        className={`px-4 py-2.5 text-right tabular-nums ${suma ? "text-success" : "text-warning"}`}
                      >
                        {suma ? "+" : "−"}
                        {money(Math.abs(m.monto), m.moneda === "USD" ? "USD" : "VES")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={movOpen} onOpenChange={setMovOpen}>
        <DialogContent className="max-w-md">
          <MovimientoCajaForm
            sesionId={sesion.id}
            tenantId={tenantId}
            usuarioId={usuarioId}
            onDone={() => setMovOpen(false)}
            onRegistradoLocal={onMovimientoLocal}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={saldoInicialOpen} onOpenChange={setSaldoInicialOpen}>
        <DialogContent className="max-w-md">
          <SaldoInicialCajaForm sesionId={sesion.id} onDone={() => setSaldoInicialOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={cerrarOpen} onOpenChange={setCerrarOpen}>
        <DialogContent className="max-w-md">
          <CerrarCajaForm
            sesionId={sesion.id}
            tenantId={tenantId}
            esperadoUsd={resumen.esperadoUsd}
            esperadoBs={resumen.esperadoBs}
            locale={locale}
            onDone={() => setCerrarOpen(false)}
            onCerradaLocal={onCierreLocal}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
