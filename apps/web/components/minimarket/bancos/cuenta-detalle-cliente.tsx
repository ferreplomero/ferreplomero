"use client";

import * as React from "react";
import { PiggyBank, Plus } from "lucide-react";
import { Button, Dialog, DialogContent } from "@arkiteq/ui";
import { MovimientoCuentaForm } from "./movimiento-cuenta-form";
import { SaldoInicialCuentaForm } from "./saldo-inicial-cuenta-form";

interface Props {
  cuentaId: string;
  cuentaLabel: string;
  monedaNativa: "USD" | "VES";
  /** Tasa vigente para la conversión en vivo del diálogo de saldo inicial. */
  tasaVigente: number | null;
  /** Cashea no aplica al saldo inicial (regla de negocio) — oculta el botón
   * en vez de dejar que el cajero lo intente y reciba un error del servidor. */
  esCashea?: boolean;
}

/** Botones + diálogos de la cuenta: "Movimiento manual" (operación puntual,
 * ya existía) y "Saldo inicial" (declarar el capital de partida — separado
 * a propósito, con su propio ícono y color, para que nunca se confundan).
 * Vive aparte para no convertir la página del detalle en un Client Component
 * completo (los datos siguen cargando en el servidor). */
export function CuentaDetalleAcciones({
  cuentaId,
  cuentaLabel,
  monedaNativa,
  tasaVigente,
  esCashea,
}: Props) {
  const [openMovimiento, setOpenMovimiento] = React.useState(false);
  const [openSaldoInicial, setOpenSaldoInicial] = React.useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {esCashea ? null : (
        <Button
          variant="outline"
          size="sm"
          className="border-accent-300 text-accent-700 hover:bg-accent-500/10"
          onClick={() => setOpenSaldoInicial(true)}
        >
          <PiggyBank className="size-4" />
          Saldo inicial
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={() => setOpenMovimiento(true)}>
        <Plus className="size-4" />
        Movimiento manual
      </Button>

      <Dialog open={openMovimiento} onOpenChange={setOpenMovimiento}>
        <DialogContent className="max-w-md">
          <MovimientoCuentaForm
            cuentaId={cuentaId}
            cuentaLabel={cuentaLabel}
            monedaNativa={monedaNativa}
            onDone={() => setOpenMovimiento(false)}
          />
        </DialogContent>
      </Dialog>

      {esCashea ? null : (
        <Dialog open={openSaldoInicial} onOpenChange={setOpenSaldoInicial}>
          <DialogContent className="max-w-md">
            <SaldoInicialCuentaForm
              cuentaId={cuentaId}
              cuentaLabel={cuentaLabel}
              monedaNativa={monedaNativa}
              tasaVigente={tasaVigente}
              onDone={() => setOpenSaldoInicial(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
