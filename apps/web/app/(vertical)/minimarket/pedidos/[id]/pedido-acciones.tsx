"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Banknote, Check, PackageCheck, X } from "lucide-react";
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@arkiteq/ui";
import type { MmMetodoPago, MmPedidoPublicoEstado } from "@arkiteq/db";
import { esMetodoConCuenta } from "@/lib/minimarket/bancos";
import { calcularExcedenteBs, computeCobro } from "@/lib/minimarket/pos-calc";
import { bs, metodoLabel, usd } from "@/lib/minimarket/recibo-formato";
import {
  cobrarPedidoLocal,
  confirmarDisponibilidad,
  cotizarCobroLocal,
  marcarEntregado,
  rechazarPedido,
  verificarPagoYRegistrar,
  type CotizacionCobro,
  type PedidoActionResult,
} from "../actions";

interface CuentaOpcion {
  id: string;
  metodo: MmMetodoPago;
  banco: string;
  predeterminada: boolean;
}

function mensajeError(r: PedidoActionResult): string {
  const base = r.error ?? "No se pudo completar la acción.";
  return r.faltantes && r.faltantes.length > 0
    ? `${base} Productos que ya no alcanzan: ${r.faltantes.join(", ")}.`
    : base;
}

/** Diálogo de cobro propio de Pedidos (no es el del POS): método real, total
 * recalculado con tasa y precios vigentes, monto recibido y vuelto. */
function CobroDialog({
  abierto,
  onOpenChange,
  pedidoId,
  metodoCliente,
  metodosLocal,
  cuentas,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  pedidoId: string;
  metodoCliente: string;
  metodosLocal: MmMetodoPago[];
  cuentas: CuentaOpcion[];
}) {
  const router = useRouter();
  const inicial = (metodosLocal.find((m) => m === metodoCliente) ??
    metodosLocal[0] ??
    null) as MmMetodoPago | null;
  const [metodo, setMetodo] = React.useState<MmMetodoPago | null>(inicial);
  const [cuentaId, setCuentaId] = React.useState<string | null>(null);
  const [cot, setCot] = React.useState<CotizacionCobro | null>(null);
  const [recibido, setRecibido] = React.useState("");
  const [vueltoMoneda, setVueltoMoneda] = React.useState<"USD" | "VES">("VES");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const esEfectivo = metodo === "efectivo_bs" || metodo === "efectivo_usd";
  const cuentasMetodo = metodo ? cuentas.filter((c) => c.metodo === metodo) : [];

  React.useEffect(() => {
    if (!abierto || !metodo) return;
    let vigente = true;
    setCot(null);
    setError(null);
    const pred =
      cuentas.find((c) => c.metodo === metodo && c.predeterminada) ??
      cuentas.find((c) => c.metodo === metodo);
    setCuentaId(pred?.id ?? null);
    setVueltoMoneda(metodo === "efectivo_usd" ? "USD" : "VES");
    cotizarCobroLocal(pedidoId, metodo).then((r) => {
      if (!vigente) return;
      setCot(r);
      if (r.ok && r.montoMetodo !== undefined) setRecibido(r.montoMetodo.toFixed(2));
    });
    return () => {
      vigente = false;
    };
  }, [abierto, metodo, pedidoId, cuentas]);

  const montoNum = Number(recibido.replace(",", "."));
  // Vista previa con las MISMAS funciones del diálogo de cobro del POS.
  const preview =
    cot?.ok && metodo && cot.tasa && cot.subtotalUsd !== undefined && Number.isFinite(montoNum)
      ? (() => {
          const monto = esEfectivo ? montoNum : (cot.montoMetodo ?? 0);
          const pagos = [{ metodo, monto: String(monto) }];
          const c = computeCobro({
            pagos,
            subtotalNeto: cot.subtotalUsd,
            tasa: cot.tasa,
            cantidadLineas: cot.cantidadLineas ?? 1,
            clienteId: null,
            igtfActivo: cot.igtfActivo,
            ivaActivo: cot.ivaActivo,
            ivaPct: cot.ivaPct,
            subtotalGravado: cot.subtotalGravado,
            subtotalSujetoIgtf: cot.subtotalSujetoIgtf,
          });
          return { ...c, excedenteBs: calcularExcedenteBs(pagos, cot.tasa, c.totalBs) };
        })()
      : null;

  function cobrar() {
    if (!metodo || !cot?.ok) return;
    setError(null);
    startTransition(async () => {
      const r = await cobrarPedidoLocal({
        pedidoId,
        metodo,
        cuentaBancariaId: esMetodoConCuenta(metodo) ? cuentaId : null,
        montoRecibido: esEfectivo ? montoNum : (cot.montoMetodo ?? 0),
        vueltoMoneda,
      });
      if (r.error) return setError(mensajeError(r));
      onOpenChange(false);
      router.refresh();
    });
  }

  const monedaMetodo = metodo === "efectivo_usd" || metodo === "zelle" ? "USD" : "VES";
  const fmt = (n: number, m: "USD" | "VES") => (m === "USD" ? usd(n) : bs(n));

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cobrar pedido</DialogTitle>
          <DialogDescription>
            El total se recalcula con la tasa y los precios vigentes. Al cobrar se registra una
            venta normal (caja, bancos e inventario).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Método de pago real</Label>
            <div className="flex flex-wrap gap-2">
              {metodosLocal.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={metodo === m}
                  onClick={() => setMetodo(m)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    metodo === m
                      ? "border-accent-500 bg-accent-50 text-accent-700 font-medium"
                      : "border-border"
                  }`}
                >
                  {metodoLabel(m)}
                </button>
              ))}
            </div>
          </div>

          {metodo && esMetodoConCuenta(metodo) ? (
            <div className="space-y-1">
              <Label htmlFor="cuenta-cobro">Cuenta que recibe el pago</Label>
              {cuentasMetodo.length === 0 ? (
                <p className="text-danger text-sm">
                  No hay cuentas activas para {metodoLabel(metodo)}. Regístrala en Bancos.
                </p>
              ) : (
                <select
                  id="cuenta-cobro"
                  className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
                  value={cuentaId ?? ""}
                  onChange={(e) => setCuentaId(e.target.value)}
                >
                  {cuentasMetodo.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.banco}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : null}

          {!cot ? (
            <p className="text-muted-foreground text-sm">Calculando total…</p>
          ) : !cot.ok ? (
            <p className="text-danger text-sm">
              {mensajeError({ error: cot.error, faltantes: cot.faltantes })}
            </p>
          ) : (
            <div className="bg-surface-2 space-y-1 rounded-lg p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{usd(cot.subtotalUsd ?? 0)}</span>
              </div>
              {(preview?.ivaUsd ?? 0) > 0 ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IVA</span>
                  <span className="tabular-nums">{usd(preview?.ivaUsd ?? 0)}</span>
                </div>
              ) : null}
              {(preview?.igtf ?? 0) > 0 ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IGTF (3 %)</span>
                  <span className="tabular-nums">{usd(preview?.igtf ?? 0)}</span>
                </div>
              ) : null}
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span className="tabular-nums">
                  {usd(preview?.totalUsd ?? cot.totalUsd ?? 0)} (
                  {bs(preview?.totalBs ?? cot.totalBs ?? 0)})
                </span>
              </div>
              <p className="text-muted-foreground text-xs">
                Tasa: Bs. {(cot.tasa ?? 0).toFixed(2)} / USD
              </p>
            </div>
          )}

          {cot?.ok && esEfectivo ? (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label htmlFor="monto-recibido">
                  Monto recibido ({monedaMetodo === "USD" ? "USD" : "Bs"})
                </Label>
                <Input
                  id="monto-recibido"
                  inputMode="decimal"
                  value={recibido}
                  onChange={(e) => setRecibido(e.target.value.replace(/[^\d.,]/g, ""))}
                />
              </div>
              {preview && preview.faltante > 0.02 ? (
                <p className="text-danger text-sm">
                  Falta{" "}
                  {fmt(
                    monedaMetodo === "USD" ? preview.faltante : preview.faltante * (cot.tasa ?? 0),
                    monedaMetodo,
                  )}
                  .
                </p>
              ) : preview && preview.vuelto > 0.001 ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    Vuelto: {vueltoMoneda === "USD" ? usd(preview.vuelto) : bs(preview.excedenteBs)}
                  </p>
                  <div className="flex gap-2">
                    {(["VES", "USD"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={vueltoMoneda === m}
                        onClick={() => setVueltoMoneda(m)}
                        className={`rounded-full border px-3 py-1 text-xs ${
                          vueltoMoneda === m ? "border-accent-500 bg-accent-50" : "border-border"
                        }`}
                      >
                        Vuelto en {m === "USD" ? "dólares" : "bolívares"}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="text-danger text-sm">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={cobrar}
            disabled={
              pending ||
              !cot?.ok ||
              !preview?.puedeConfirmar ||
              (metodo !== null && esMetodoConCuenta(metodo) && !cuentaId)
            }
          >
            <Banknote className="size-4" />
            {pending ? "Registrando…" : "Cobrar y registrar venta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PedidoAcciones({
  pedidoId,
  estado,
  ventaId,
  metodoCliente,
  metodosLocal,
  cuentas,
}: {
  pedidoId: string;
  estado: MmPedidoPublicoEstado;
  ventaId: string | null;
  metodoCliente: string;
  metodosLocal: MmMetodoPago[];
  cuentas: CuentaOpcion[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [rechazando, setRechazando] = React.useState(false);
  const [motivo, setMotivo] = React.useState("");
  const [cobroAbierto, setCobroAbierto] = React.useState(false);

  function ejecutar(fn: () => Promise<PedidoActionResult>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.error) return setError(mensajeError(r));
      setRechazando(false);
      router.refresh();
    });
  }

  const puedeRechazar =
    !ventaId &&
    (estado === "pendiente" || estado === "pago_reportado" || estado === "para_pagar_local");

  return (
    <Card className="space-y-3 p-4">
      <p className="text-heading text-sm font-medium">Acciones</p>

      {estado === "pago_reportado" ? (
        <Button
          className="w-full"
          disabled={pending}
          onClick={() => ejecutar(() => verificarPagoYRegistrar(pedidoId))}
        >
          <Check className="size-4" />
          Verificar pago y registrar venta
        </Button>
      ) : null}
      {estado === "pendiente" ? (
        <Button
          className="w-full"
          disabled={pending}
          onClick={() => ejecutar(() => confirmarDisponibilidad(pedidoId))}
        >
          <Check className="size-4" />
          Confirmar disponibilidad
        </Button>
      ) : null}
      {estado === "para_pagar_local" ? (
        <Button className="w-full" disabled={pending} onClick={() => setCobroAbierto(true)}>
          <Banknote className="size-4" />
          Cobrar
        </Button>
      ) : null}
      {estado === "aceptado_validado" && ventaId ? (
        <Button
          className="w-full"
          disabled={pending}
          onClick={() => ejecutar(() => marcarEntregado(pedidoId))}
        >
          <PackageCheck className="size-4" />
          Marcar como entregado
        </Button>
      ) : null}
      {estado === "aceptado_validado" && !ventaId ? (
        <p className="text-warning text-sm">
          El pedido se está procesando o quedó sin venta enlazada. Revisa el Historial de Ventas.
        </p>
      ) : null}
      {estado === "rechazado" || estado === "completado" ? (
        <p className="text-muted-foreground text-sm">Este pedido ya está cerrado.</p>
      ) : null}

      {puedeRechazar ? (
        rechazando ? (
          <div className="space-y-2">
            <textarea
              aria-label="Motivo del rechazo"
              className="border-border bg-background w-full rounded-md border p-2 text-sm"
              rows={3}
              maxLength={300}
              placeholder="Motivo del rechazo (lo verá el cliente)"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="danger"
                disabled={pending}
                onClick={() => ejecutar(() => rechazarPedido({ pedidoId, motivo }))}
              >
                Rechazar pedido
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRechazando(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setRechazando(true)}>
            <X className="size-4" />
            Rechazar
          </Button>
        )
      ) : null}

      {error ? <p className="text-danger text-sm">{error}</p> : null}

      {estado === "para_pagar_local" ? (
        <CobroDialog
          abierto={cobroAbierto}
          onOpenChange={setCobroAbierto}
          pedidoId={pedidoId}
          metodoCliente={metodoCliente}
          metodosLocal={metodosLocal}
          cuentas={cuentas}
        />
      ) : null}
    </Card>
  );
}
