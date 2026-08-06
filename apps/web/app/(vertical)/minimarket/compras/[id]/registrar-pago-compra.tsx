"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Info } from "lucide-react";
import { Button, Dialog, DialogContent, Label } from "@arkiteq/ui";
import { esEfectivo } from "@/lib/minimarket/pos-calc";
import { esMetodoConCuenta } from "@/lib/minimarket/bancos";
import { getCuentaPredeterminada } from "@/lib/minimarket/data/bancos";
import { METODOS_GASTO } from "@/lib/minimarket/constants";
import type { MetodoPagoConfigItem } from "@/lib/minimarket/metodos-pago";
import type { MmCuentaBancaria, MmMetodoPago } from "@arkiteq/db";
import { pagarCompra } from "../actions";

const SELECT_CLASS =
  "border-border bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2";

interface RegistrarPagoCompraProps {
  compraId: string;
  /** Métodos de pago activos en Configuración — sin "credito_proveedor" (ya
   * es como está registrada la compra, no tiene sentido volver a elegirlo). */
  metodosPago: MetodoPagoConfigItem[];
  cajaAbierta: boolean;
  cuentasBancarias: MmCuentaBancaria[];
}

/**
 * Botón + diálogo para registrar el pago real de una compra que se recibió
 * "a crédito" (metodo_pago = credito_proveedor, pagada = false) — elige el
 * método real y, si aplica, la cuenta bancaria, y llama a `pagarCompra`
 * (mismo mecanismo de egreso que usa crearCompra, ver compras/actions.ts).
 */
export function RegistrarPagoCompra({
  compraId,
  metodosPago,
  cajaAbierta,
  cuentasBancarias,
}: RegistrarPagoCompraProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [cuentaBancariaId, setCuentaBancariaId] = React.useState("");

  const metodosActivos = React.useMemo(() => {
    const activosSet = new Set<MmMetodoPago>(
      metodosPago.filter((m) => m.activo).map((m) => m.metodo),
    );
    return METODOS_GASTO.filter((m) => activosSet.has(m.value));
  }, [metodosPago]);

  const [metodoPago, setMetodoPago] = React.useState<MmMetodoPago>(
    metodosActivos.find((m) => m.value === "efectivo_bs")?.value ??
      metodosActivos[0]?.value ??
      "efectivo_bs",
  );

  React.useEffect(() => {
    setCuentaBancariaId("");
  }, [metodoPago]);

  const cuentasDelMetodo = React.useMemo(
    () => cuentasBancarias.filter((c) => c.metodo === metodoPago && c.activa),
    [cuentasBancarias, metodoPago],
  );
  const cuentaPredeterminada = esMetodoConCuenta(metodoPago)
    ? getCuentaPredeterminada(cuentasBancarias, metodoPago)
    : null;
  const cuentaResueltaId = cuentaBancariaId || cuentaPredeterminada?.id || "";
  const cuentaResuelta =
    cuentasDelMetodo.find((c) => c.id === cuentaResueltaId) ?? cuentaPredeterminada;
  const faltaCuentaDigital = esMetodoConCuenta(metodoPago) && !cuentaResuelta;

  async function handlePagar() {
    setGuardando(true);
    setError(null);
    const result = await pagarCompra(compraId, metodoPago, cuentaResueltaId || undefined);
    setGuardando(false);
    if (result.error) {
      setError(result.error);
    } else {
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        className="bg-accent-500 hover:bg-accent-600 w-full text-white sm:w-auto"
      >
        <CreditCard className="mr-1.5 size-4" />
        Registrar pago
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md space-y-4 p-6">
          <div>
            <p className="text-heading font-medium">Registrar pago al proveedor</p>
            <p className="text-muted-foreground text-sm">
              Elige cómo se pagó esta compra. El monto se descontará de caja o del banco elegido,
              igual que cualquier otra compra pagada.
            </p>
          </div>

          {error ? (
            <p role="alert" className="bg-danger/10 text-danger rounded-md px-3 py-2 text-sm">
              {error}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="metodo_pago_real">Método de pago</Label>
            <select
              id="metodo_pago_real"
              className={SELECT_CLASS}
              value={metodoPago}
              onChange={(e) => setMetodoPago(e.target.value as MmMetodoPago)}
            >
              {metodosActivos.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            {esEfectivo(metodoPago) ? (
              cajaAbierta ? (
                <p className="text-muted-foreground text-xs">Se descontará de la caja abierta.</p>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-amber-700">
                  <Info className="size-3.5 shrink-0" aria-hidden />
                  Necesitas abrir la caja para registrar este pago en efectivo.
                </p>
              )
            ) : (
              <>
                {cuentasDelMetodo.length > 1 ? (
                  <select
                    aria-label="Cuenta de la que sale el dinero"
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
                ) : null}
                {faltaCuentaDigital ? (
                  <p className="flex items-center gap-1.5 text-xs text-amber-700">
                    <Info className="size-3.5 shrink-0" aria-hidden />
                    No hay una cuenta configurada para este método — configúrala en Bancos antes de
                    registrar este pago.
                  </p>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Se descontará de: {cuentaResuelta?.banco} — {cuentaResuelta?.titular}.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button
              onClick={handlePagar}
              disabled={guardando || (!esEfectivo(metodoPago) && faltaCuentaDigital)}
              className="bg-accent-500 hover:bg-accent-600 text-white"
            >
              {guardando ? "Registrando..." : "Confirmar pago"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
