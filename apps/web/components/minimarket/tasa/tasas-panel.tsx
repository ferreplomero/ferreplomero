"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, RefreshCw, Star, WifiOff } from "lucide-react";
import { Button, Card, Input, Label, cn, toast } from "@arkiteq/ui";
import { PowerSyncContext } from "@powersync/react";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  definirTasa,
  actualizarTasaAuto,
  definirFuentePreferida,
  type TasaResult,
} from "@/app/(vertical)/minimarket/tasa/actions";
import {
  definirTasaManualLocal,
  marcarFuentePreferidaLocal,
} from "@/lib/minimarket/powersync/registrar-caja-local";
import { useOnline } from "@/lib/minimarket/use-online";
import { formatMaskedAmount, parseMaskedInput } from "@/lib/minimarket/currency-mask";
import { TIPO_TASA_LABEL, type TipoTasa } from "@/lib/minimarket/exchange-rate";

export interface TasaValorProps {
  valor: number;
  fecha: string;
}

interface TasasPanelProps {
  tasas: Record<TipoTasa, TasaValorProps | null>;
  fuentePreferida: TipoTasa;
  tenantId: string;
  usuarioId: string;
}

const numFmt = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * "Hacer predeterminada" — acción INDEPENDIENTE de guardar un valor: solo
 * cambia cuál de las 3 tasas usa el POS por defecto. Si ya es la
 * predeterminada, muestra la insignia en vez del botón. Funciona offline
 * (escribe directo en `mm_config_negocio` local, PowerSync la sube sola).
 */
function BotonPreferida({
  tipo,
  activa,
  tenantId,
}: {
  tipo: TipoTasa;
  activa: boolean;
  tenantId: string;
}) {
  const router = useRouter();
  const powerSyncDb = React.useContext(PowerSyncContext);
  const offline = !useOnline();
  const [state, action, pending] = useActionState<TasaResult, FormData>(definirFuentePreferida, {});
  const [guardandoLocal, setGuardandoLocal] = React.useState(false);

  React.useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!offline) return;
    e.preventDefault();
    if (!powerSyncDb) {
      toast.error("Sin conexión y sin base local disponible. Inténtalo de nuevo en unos segundos.");
      return;
    }
    setGuardandoLocal(true);
    try {
      await marcarFuentePreferidaLocal(powerSyncDb, tenantId, tipo);
      toast.success(`${TIPO_TASA_LABEL[tipo]} es ahora la tasa predeterminada.`);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? `No se pudo cambiar: ${err.message}` : "No se pudo cambiar la tasa.",
      );
    } finally {
      setGuardandoLocal(false);
    }
  }

  if (activa) {
    return (
      <span className="text-accent-700 bg-accent-100 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold">
        <Star className="size-3 fill-current" aria-hidden />
        Predeterminada
      </span>
    );
  }

  return (
    <form action={action} onSubmit={onSubmit}>
      <input type="hidden" name="fuente_tasa" value={tipo} />
      <Button type="submit" variant="outline" size="sm" disabled={pending || guardandoLocal}>
        {pending || guardandoLocal ? "Guardando…" : "Hacer predeterminada"}
      </Button>
    </form>
  );
}

/**
 * Tarjeta de UNA de las 3 tasas (Personalizada, BCV o Euro BCV): valor
 * vigente + botón "Actualizar con la API" (BCV/Euro, bien visible) + input
 * editable A MANO con su propio botón "Guardar" — y, aparte, "Hacer
 * predeterminada" en la cabecera. Guardar/Actualizar y Hacer-predeterminada
 * son acciones INDEPENDIENTES a propósito: guardar un valor nuevo NO cambia
 * sola cuál tasa usa el sistema por defecto.
 */
function FilaTasa({
  tipo,
  valor,
  fuentePreferida,
  tenantId,
  usuarioId,
  conActualizarAuto,
}: {
  tipo: TipoTasa;
  valor: TasaValorProps | null;
  fuentePreferida: TipoTasa;
  tenantId: string;
  usuarioId: string;
  conActualizarAuto: boolean;
}) {
  const router = useRouter();
  const powerSyncDb = React.useContext(PowerSyncContext);
  const offline = !useOnline();
  const [state, action, pending] = useActionState<TasaResult, FormData>(definirTasa, {});
  const [stateAuto, actionAuto, pendingAuto] = useActionState<TasaResult, FormData>(
    actualizarTasaAuto,
    {},
  );
  const [guardandoLocal, setGuardandoLocal] = React.useState(false);
  const [okLocal, setOkLocal] = React.useState(false);
  // Valor "limpio" (punto decimal, ej. "1919.17") — lo que de verdad se envía
  // en el formulario. El input visible solo formatea para mostrar/escribir
  // (mismo helper que el monto del diálogo de cobro, estilo bancario).
  const [montoInput, setMontoInput] = React.useState(valor ? valor.valor.toFixed(2) : "");

  React.useEffect(() => {
    if (state.ok || stateAuto.ok) router.refresh();
  }, [state.ok, stateAuto.ok, router]);

  React.useEffect(() => {
    if (valor) setMontoInput(valor.valor.toFixed(2));
  }, [valor]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!offline) return;
    e.preventDefault();
    setOkLocal(false);
    if (!powerSyncDb) {
      toast.error("Sin conexión y sin base local disponible. Inténtalo de nuevo en unos segundos.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const nuevoValor = Number(String(fd.get("valor") ?? "").replace(",", "."));
    if (!Number.isFinite(nuevoValor) || nuevoValor <= 0) {
      toast.error("Ingresa una tasa válida (mayor que cero).");
      return;
    }

    setGuardandoLocal(true);
    try {
      await definirTasaManualLocal(powerSyncDb, { tenantId, usuarioId, tipo, valor: nuevoValor });
      toast.success("Tasa guardada en este dispositivo. Se sincronizará al conectarte.");
      setOkLocal(true);
    } catch (err) {
      toast.error(
        err instanceof Error ? `No se pudo guardar: ${err.message}` : "No se pudo guardar la tasa.",
      );
    } finally {
      setGuardandoLocal(false);
    }
  }

  const activa = fuentePreferida === tipo;

  return (
    <Card className={cn("space-y-3 p-4", activa && "border-accent-300 border-2")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-heading text-sm font-medium">{TIPO_TASA_LABEL[tipo]}</p>
          <p className="text-heading font-display text-xl font-semibold tabular-nums">
            {valor ? `Bs. ${numFmt.format(valor.valor)}` : "Sin registrar"}
          </p>
        </div>
        <BotonPreferida tipo={tipo} activa={activa} tenantId={tenantId} />
      </div>

      {offline ? (
        <div
          role="status"
          className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800"
        >
          <WifiOff className="size-3.5 shrink-0" aria-hidden />
          {conActualizarAuto
            ? "Sin conexión — no se puede consultar la API, pero puedes seguir cambiando el valor a mano."
            : "Sin conexión — se guarda en este dispositivo y se sube sola al reconectar."}
        </div>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-danger flex items-center gap-1.5 text-xs">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}
      {stateAuto.error ? (
        <p role="alert" className="text-danger flex items-center gap-1.5 text-xs">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {stateAuto.error}
        </p>
      ) : null}
      {state.ok || okLocal ? (
        <p className="text-success flex items-center gap-1.5 text-xs font-medium">
          <CheckCircle2 className="size-3.5" aria-hidden />
          Valor guardado.
        </p>
      ) : null}
      {stateAuto.ok && stateAuto.valor ? (
        <p className="text-success flex items-center gap-1.5 text-xs font-medium">
          <CheckCircle2 className="size-3.5" aria-hidden />
          Actualizada: Bs. {numFmt.format(stateAuto.valor)}
        </p>
      ) : null}

      {/* Sincronizar con la API — la acción más visible de la tarjeta */}
      {conActualizarAuto ? (
        <form action={actionAuto}>
          <input type="hidden" name="tipo" value={tipo} />
          <Button
            type="submit"
            variant="primary"
            disabled={pendingAuto || offline}
            className="w-full gap-1.5"
          >
            <RefreshCw className={cn("size-4", pendingAuto && "animate-spin")} aria-hidden />
            {pendingAuto ? "Consultando…" : "Sincronizar con el BCV"}
          </Button>
        </form>
      ) : null}

      {/* Editar a mano: SOLO guarda el valor, no cambia la predeterminada */}
      <form
        action={action}
        onSubmit={onSubmit}
        className="flex flex-wrap items-end gap-2"
        noValidate
      >
        <div className="min-w-0 flex-1 space-y-1.5 sm:flex-none">
          <Label htmlFor={`valor-${tipo}`} className="text-xs">
            Cambiar a mano (Bs por USD)
          </Label>
          <input type="hidden" name="tipo" value={tipo} />
          <input type="hidden" name="valor" value={montoInput} />
          <Input
            id={`valor-${tipo}`}
            type="text"
            inputMode="numeric"
            value={formatMaskedAmount(montoInput)}
            onChange={(e) => setMontoInput(parseMaskedInput(e.target.value))}
            placeholder="0,00"
            className="max-w-36 text-right tabular-nums"
            required
          />
        </div>
        <SubmitButton size="sm" variant="outline" disabled={guardandoLocal}>
          {guardandoLocal || pending ? "Guardando…" : "Guardar"}
        </SubmitButton>
      </form>
    </Card>
  );
}

/**
 * Panel de las 3 tasas en paralelo (Personalizada / BCV / Euro). Se usa tanto
 * en Configuración como en Tasa de cambio — mismos datos y mismas acciones,
 * así que lo que se guarde o actualice en un lugar se refleja de inmediato en
 * el otro y en todo el sistema (POS incluido). Tres acciones INDEPENDIENTES
 * por tarjeta: "Sincronizar con el BCV" (BCV/Euro, trae el valor oficial),
 * "Guardar" (fija un valor a mano) y "Hacer predeterminada" (cuál de las 3
 * usa el POS) — guardar o sincronizar un valor nunca cambia sola la
 * predeterminada. La tarjeta Personalizada va primero: no depende de
 * ninguna API.
 */
export function TasasPanel({ tasas, fuentePreferida, tenantId, usuarioId }: TasasPanelProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <FilaTasa
        tipo="manual"
        valor={tasas.manual}
        fuentePreferida={fuentePreferida}
        tenantId={tenantId}
        usuarioId={usuarioId}
        conActualizarAuto={false}
      />
      <FilaTasa
        tipo="bcv"
        valor={tasas.bcv}
        fuentePreferida={fuentePreferida}
        tenantId={tenantId}
        usuarioId={usuarioId}
        conActualizarAuto
      />
      <FilaTasa
        tipo="euro"
        valor={tasas.euro}
        fuentePreferida={fuentePreferida}
        tenantId={tenantId}
        usuarioId={usuarioId}
        conActualizarAuto
      />
    </div>
  );
}
