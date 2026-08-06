"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, PackageCheck } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Skeleton,
} from "@arkiteq/ui";
import {
  anularVentaConDevolucionAction,
  getVentaParaAnularAction,
  type VentaParaAnularAction,
} from "@/app/(vertical)/minimarket/ventas/actions";
import { formatMaskedAmount, parseMaskedInput } from "@/lib/minimarket/currency-mask";
import { esEfectivo } from "@/lib/minimarket/pos-calc";
import { esMetodoConCuenta, monedaNativaCuenta } from "@/lib/minimarket/bancos";
import { getCuentaPredeterminada } from "@/lib/minimarket/data/bancos";
import { METODOS_PAGO } from "@/lib/minimarket/constants";
import type { MmCuentaBancaria, MmMetodoPago } from "@arkiteq/db";

/** Métodos válidos para devolver dinero — sin fiado (no es dinero real) ni
 * Cashea (el negocio no puede "devolver" a través de Cashea). */
const METODOS_DEVOLUCION: MmMetodoPago[] = [
  "efectivo_bs",
  "efectivo_usd",
  "pago_movil",
  "transferencia",
  "tarjeta",
  "zelle",
];

const SELECT_CLASS =
  "border-border bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2";

function metodoLabel(metodo: MmMetodoPago): string {
  return METODOS_PAGO.find((m) => m.value === metodo)?.label ?? metodo;
}

/**
 * Id de la cuenta predeterminada de este método ("" si el método no usa
 * cuenta o no hay ninguna configurada) — se llama SIEMPRE que cambia el
 * método (carga inicial y cada `onChange` del select) para que el ESTADO
 * (`cuentaBancariaId`), no solo lo que se ve en pantalla, quede con la
 * predeterminada ya elegida. Antes el estado nacía en "" y solo la UI
 * mostraba la predeterminada (vía un fallback en el render), así que el
 * botón de confirmar creía que faltaba elegir cuenta hasta que el cajero
 * tocaba el selector a mano.
 */
function cuentaPredeterminadaId(metodo: MmMetodoPago, cuentas: MmCuentaBancaria[]): string {
  if (!esMetodoConCuenta(metodo)) return "";
  return getCuentaPredeterminada(cuentas, metodo)?.id ?? "";
}

interface Props {
  ventaId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AnularVentaDialog({ ventaId, open, onOpenChange }: Props) {
  const router = useRouter();
  const [cargando, setCargando] = React.useState(false);
  const [datos, setDatos] = React.useState<VentaParaAnularAction | null>(null);
  const [cargaError, setCargaError] = React.useState<string | null>(null);

  const [enviando, setEnviando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ventaYaAnulada, setVentaYaAnulada] = React.useState(false);

  const [metodo, setMetodo] = React.useState<MmMetodoPago>("efectivo_bs");
  const [cuentaBancariaId, setCuentaBancariaId] = React.useState("");
  const [monto, setMonto] = React.useState("");

  // Se piden los datos recién al abrir — no hace falta cargarlos por
  // adelantado en cada fila del historial de ventas.
  React.useEffect(() => {
    if (!open) {
      setDatos(null);
      setCargaError(null);
      setError(null);
      setVentaYaAnulada(false);
      return;
    }
    let cancelado = false;
    setCargando(true);
    void getVentaParaAnularAction(ventaId).then((result) => {
      if (cancelado) return;
      setCargando(false);
      if (!result.ok || !result.venta) {
        setCargaError(result.error ?? "No se pudo cargar la información de la venta.");
        return;
      }
      setDatos(result);
      const activosSet = new Set<MmMetodoPago>(
        (result.metodosPago ?? []).filter((m) => m.activo).map((m) => m.metodo),
      );
      const metodosActivos = METODOS_DEVOLUCION.filter((m) => activosSet.has(m));
      const primerPagoReal = result.venta.pagosReales[0] ?? null;
      const metodoInicial: MmMetodoPago =
        primerPagoReal && metodosActivos.includes(primerPagoReal.metodo)
          ? primerPagoReal.metodo
          : (metodosActivos[0] ?? "efectivo_bs");
      setMetodo(metodoInicial);
      setCuentaBancariaId(cuentaPredeterminadaId(metodoInicial, result.cuentasBancarias ?? []));
    });
    return () => {
      cancelado = true;
    };
  }, [open, ventaId]);

  const venta = datos?.venta;
  const cajaAbierta = datos?.cajaAbierta ?? false;
  const locale = datos?.locale ?? "es-VE";

  const metodosActivos = React.useMemo(() => {
    const activos = new Set<MmMetodoPago>(
      (datos?.metodosPago ?? []).filter((m) => m.activo).map((m) => m.metodo),
    );
    return METODOS_DEVOLUCION.filter((m) => activos.has(m));
  }, [datos]);

  const montoRealPagadoUsd = venta?.montoRealPagadoUsd ?? 0;
  const tasaUsada = venta?.tasaUsada ?? 0;
  const hayDevolucion = montoRealPagadoUsd > 0.009;

  const cuentasBancarias = React.useMemo(() => datos?.cuentasBancarias ?? [], [datos]);
  const cuentasDelMetodo = React.useMemo(
    () => cuentasBancarias.filter((c) => c.metodo === metodo && c.activa),
    [cuentasBancarias, metodo],
  );
  const cuentaPredeterminada = esMetodoConCuenta(metodo)
    ? getCuentaPredeterminada(cuentasBancarias, metodo)
    : null;
  const cuentaResueltaId = cuentaBancariaId || cuentaPredeterminada?.id || "";

  const monedaMetodo: "USD" | "VES" = esMetodoConCuenta(metodo)
    ? monedaNativaCuenta(metodo)
    : metodo === "efectivo_usd"
      ? "USD"
      : "VES";
  const montoMaxNativo =
    monedaMetodo === "USD"
      ? montoRealPagadoUsd
      : Math.round(montoRealPagadoUsd * tasaUsada * 100) / 100;

  // Monto por defecto = el total real pagado, convertido a la moneda del
  // método elegido — se recalcula al cambiar el método (para no pisar lo que
  // el cajero ya haya escrito a mano) o al terminar de cargar los datos.
  React.useEffect(() => {
    if (!venta || !hayDevolucion) return;
    setMonto(montoMaxNativo.toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metodo, Boolean(venta)]);

  const montoNum = parseFloat(monto) || 0;

  const usd = (n: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(n);
  const bs = (n: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "VES" }).format(n);

  const necesitaCuenta = esMetodoConCuenta(metodo);
  const faltaElegirCuenta = necesitaCuenta && cuentasDelMetodo.length > 1 && !cuentaBancariaId;
  const sinCuentaConfigurada = necesitaCuenta && cuentasDelMetodo.length === 0;
  const cajaCerrada = esEfectivo(metodo) && !cajaAbierta;

  const puedeConfirmar =
    !!venta &&
    venta.puedeAnular &&
    (!hayDevolucion ||
      (montoNum > 0 &&
        montoNum <= montoMaxNativo + 0.01 &&
        !faltaElegirCuenta &&
        !sinCuentaConfigurada &&
        !cajaCerrada));

  async function confirmar() {
    setEnviando(true);
    setError(null);
    const result = await anularVentaConDevolucionAction(
      ventaId,
      hayDevolucion
        ? {
            metodo,
            cuenta_bancaria_id: necesitaCuenta ? cuentaResueltaId : undefined,
            monto: montoNum,
          }
        : null,
    );
    setEnviando(false);

    if (result.devolucionFallida) {
      setError(result.error ?? "La venta se anuló, pero la devolución no se pudo registrar.");
      setVentaYaAnulada(true);
      return;
    }
    if (result.error) {
      setError(result.error);
      return;
    }

    onOpenChange(false);
    router.refresh();
  }

  function cerrar() {
    const huboExito = ventaYaAnulada;
    onOpenChange(false);
    if (huboExito) router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !enviando && (o ? onOpenChange(o) : cerrar())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Anular venta {venta?.numero ?? ""}</DialogTitle>
          <DialogDescription>Esta acción no se puede deshacer.</DialogDescription>
        </DialogHeader>

        {cargando ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : cargaError ? (
          <p
            role="alert"
            className="bg-danger/10 text-danger flex items-center gap-2 rounded-md px-3 py-2.5 text-sm"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {cargaError}
          </p>
        ) : venta ? (
          <>
            <div className="border-border bg-surface-2 flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm">
              <PackageCheck className="text-accent-600 mt-0.5 size-4 shrink-0" aria-hidden />
              <p>El stock de los productos de esta venta vuelve al inventario.</p>
            </div>

            {error ? (
              <p
                role="alert"
                className="bg-danger/10 text-danger flex items-center gap-2 rounded-md px-3 py-2.5 text-sm"
              >
                <AlertCircle className="size-4 shrink-0" aria-hidden />
                {error}
              </p>
            ) : null}

            {!venta.puedeAnular ? (
              <p className="border-danger/30 bg-danger/10 text-danger rounded-md border px-3 py-2.5 text-sm">
                {venta.motivoBloqueo}
              </p>
            ) : ventaYaAnulada ? null : !hayDevolucion ? (
              <div className="border-border bg-surface-2 rounded-md border px-3 py-2.5 text-sm">
                {venta.fiadoMontoUsd ? (
                  <p>
                    Esta venta fue completamente fiada — no hay dinero que devolver. Se cancelará la
                    deuda pendiente de {usd(venta.fiadoMontoUsd)}.
                  </p>
                ) : (
                  <p>Esta venta no tiene dinero real pagado que devolver.</p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                  <p>
                    Se va a devolver <strong>{usd(montoRealPagadoUsd)}</strong> al cliente.
                  </p>
                  {venta.igtfUsd > 0.009 ? (
                    <p className="text-xs">
                      De ese monto, {usd(venta.igtfUsd)} corresponden a IGTF. El monto de abajo es
                      editable — el tratamiento del IGTF en una devolución es un criterio fiscal,
                      valídalo con tu contador.
                    </p>
                  ) : null}
                  {venta.fiadoMontoUsd ? (
                    <p className="text-xs">
                      Además se cancelará {usd(venta.fiadoMontoUsd)} de deuda fiada pendiente.
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="devolucion_metodo">Devolver por</Label>
                  <select
                    id="devolucion_metodo"
                    value={metodo}
                    onChange={(e) => {
                      const nuevoMetodo = e.target.value as MmMetodoPago;
                      setMetodo(nuevoMetodo);
                      setCuentaBancariaId(cuentaPredeterminadaId(nuevoMetodo, cuentasBancarias));
                    }}
                    className={SELECT_CLASS}
                  >
                    {metodosActivos.map((m) => (
                      <option key={m} value={m}>
                        {metodoLabel(m)}
                      </option>
                    ))}
                  </select>
                </div>

                {necesitaCuenta && cuentasDelMetodo.length > 1 ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="devolucion_cuenta">Cuenta de la que sale</Label>
                    <select
                      id="devolucion_cuenta"
                      value={cuentaResueltaId}
                      onChange={(e) => setCuentaBancariaId(e.target.value)}
                      className={SELECT_CLASS}
                    >
                      {cuentasDelMetodo.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.banco} — {c.titular}
                          {c.predeterminada ? " (predeterminada)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {sinCuentaConfigurada ? (
                  <p className="text-danger flex items-center gap-2 text-xs">
                    <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                    No hay ninguna cuenta configurada para este método — configúrala en
                    Configuración → Métodos de pago, o elige otro método.
                  </p>
                ) : null}

                {cajaCerrada ? (
                  <p className="text-danger flex items-center gap-2 text-xs">
                    <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                    No hay una caja abierta — ábrela primero, o elige un método digital.
                  </p>
                ) : null}

                <div className="space-y-1.5">
                  <Label htmlFor="devolucion_monto">
                    Monto a devolver ({monedaMetodo === "USD" ? "USD" : "Bs"})
                  </Label>
                  <Input
                    id="devolucion_monto"
                    type="text"
                    inputMode="numeric"
                    value={formatMaskedAmount(monto)}
                    onChange={(e) => setMonto(parseMaskedInput(e.target.value))}
                    className="text-right tabular-nums"
                  />
                  <p className="text-muted-foreground text-xs tabular-nums">
                    Máximo: {monedaMetodo === "USD" ? usd(montoMaxNativo) : bs(montoMaxNativo)}
                  </p>
                </div>
              </div>
            )}
          </>
        ) : null}

        <DialogFooter>
          {ventaYaAnulada || !venta?.puedeAnular ? (
            <Button onClick={cerrar}>Cerrar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={cerrar} disabled={enviando}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={confirmar} disabled={enviando || !puedeConfirmar}>
                {enviando ? "Anulando…" : "Anular venta"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
