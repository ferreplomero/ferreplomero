"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Info, Lock, PlusCircle, Receipt } from "lucide-react";
import { Button, Card, Dialog, DialogContent, Input, Label, toast } from "@arkiteq/ui";
import { SubmitButton } from "@/components/auth/submit-button";
import { CampoMontoDual } from "@/components/minimarket/shared/campo-monto-dual";
import { CategoriaMovimientoForm } from "@/components/minimarket/shared/categoria-movimiento-form-cargador";
import { METODOS_GASTO } from "@/lib/minimarket/constants";
import { esEfectivo } from "@/lib/minimarket/pos-calc";
import { esMetodoConCuenta } from "@/lib/minimarket/bancos";
import { getCuentaPredeterminada } from "@/lib/minimarket/data/bancos";
import type { MetodoPagoConfigItem } from "@/lib/minimarket/metodos-pago";
import type {
  MmCategoriaMovimiento,
  MmCuentaBancaria,
  MmGastoOperativo,
  MmMetodoPago,
} from "@arkiteq/db";
import type { GastoResult } from "./actions";

interface GastoFormProps {
  action: (prev: GastoResult, formData: FormData) => Promise<GastoResult>;
  gasto?: MmGastoOperativo | null;
  tasa: number;
  hoy: string;
  /** Categorías de gasto (preestablecidas + propias) del tenant. */
  categorias: MmCategoriaMovimiento[];
  /** Métodos de pago activos en Configuración — el selector solo muestra estos. */
  metodosPago: MetodoPagoConfigItem[];
  /** ¿Hay una caja abierta ahora mismo? Solo afecta el aviso al elegir efectivo. */
  cajaAbierta: boolean;
  /** Cuentas bancarias activas del tenant, para elegir de cuál sale el dinero
   * cuando el método es digital (pago móvil/transferencia/Zelle/tarjeta). */
  cuentasBancarias: MmCuentaBancaria[];
  /**
   * true si este gasto ya pasó por un cierre de caja: el monto y el método
   * quedan bloqueados (solo se puede corregir descripción/categoría/fecha/notas).
   */
  montoMetodoBloqueado?: boolean;
}

const SELECT_CLASS =
  "border-border bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60";

export function GastoForm({
  action,
  gasto,
  tasa,
  hoy,
  categorias,
  metodosPago,
  cajaAbierta,
  cuentasBancarias,
  montoMetodoBloqueado,
}: GastoFormProps) {
  const router = useRouter();
  const [state, formAction] = useActionState<GastoResult, FormData>(action, {});
  const [montoUsd, setMontoUsd] = React.useState(gasto ? String(gasto.monto_usd) : "");
  const [cuentaBancariaId, setCuentaBancariaId] = React.useState(gasto?.cuenta_bancaria_id ?? "");

  // ---- Categoría (con alta rápida "+ Nueva categoría" sin salir del formulario) ----
  const [categoriasLista, setCategoriasLista] = React.useState(categorias);
  const [categoriaId, setCategoriaId] = React.useState(
    gasto?.categoria_id ?? categorias[0]?.id ?? "",
  );
  const [categoriaModalOpen, setCategoriaModalOpen] = React.useState(false);
  const onCategoriaCreada = React.useCallback((creada?: { id: string; nombre: string }) => {
    setCategoriaModalOpen(false);
    if (!creada) return;
    setCategoriasLista((prev) =>
      [...prev, creada as MmCategoriaMovimiento].sort((a, b) =>
        a.nombre.localeCompare(b.nombre, "es"),
      ),
    );
    setCategoriaId(creada.id);
    toast.success(`Categoría "${creada.nombre}" creada y seleccionada.`);
  }, []);

  const metodosActivos = React.useMemo(() => {
    const activosSet = new Set<MmMetodoPago>(
      metodosPago.filter((m) => m.activo).map((m) => m.metodo),
    );
    return METODOS_GASTO.filter((m) => activosSet.has(m.value));
  }, [metodosPago]);

  const metodoInicial: MmMetodoPago =
    gasto?.metodo_pago && metodosActivos.some((m) => m.value === gasto.metodo_pago)
      ? gasto.metodo_pago
      : (metodosActivos.find((m) => m.value === "efectivo_bs")?.value ??
        metodosActivos[0]?.value ??
        "efectivo_bs");
  const [metodoPago, setMetodoPago] = React.useState<MmMetodoPago>(metodoInicial);

  React.useEffect(() => {
    if (state.ok && state.gastoId) {
      router.push("/minimarket/reportes/gastos");
    }
  }, [state.ok, state.gastoId, router]);

  // Cuenta bancaria de la que sale el dinero de un gasto digital — mismo
  // patrón que abono-form.tsx: se resetea al CAMBIAR de método, se muestra un
  // selector solo si hay más de una cuenta activa para ese método, y si no se
  // elige ninguna se usa la predeterminada. `esPrimerRender` evita que este
  // efecto borre la cuenta ya guardada al editar un gasto existente (el
  // efecto también corre una vez al montar).
  const esPrimerRender = React.useRef(true);
  React.useEffect(() => {
    if (esPrimerRender.current) {
      esPrimerRender.current = false;
      return;
    }
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

  const fe = state.fieldErrors ?? {};
  const bloqueado = Boolean(montoMetodoBloqueado);

  return (
    <Card className="mx-auto max-w-xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <span className="bg-accent-500/12 text-accent-600 inline-flex size-11 items-center justify-center rounded-xl">
          <Receipt className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-heading font-medium">{gasto ? "Editar gasto" : "Nuevo gasto"}</p>
          <p className="text-muted-foreground text-sm">
            {gasto
              ? "Actualiza los datos de este gasto operativo."
              : "Registra alquiler, sueldos, servicios u otro gasto real del negocio."}
          </p>
        </div>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="bg-danger/10 text-danger flex items-center gap-2 rounded-md px-3 py-2.5 text-sm"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      {bloqueado ? (
        <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          Este gasto ya pasó por un cierre de caja: el monto y el origen del dinero quedaron
          bloqueados para no descuadrar ese arqueo. Solo puedes corregir la descripción, la
          categoría, la fecha o las notas.
        </p>
      ) : null}

      <form action={formAction} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="descripcion">
            Descripción <span className="text-danger">*</span>
          </Label>
          <Input
            id="descripcion"
            name="descripcion"
            placeholder="ej. Alquiler del local — julio"
            defaultValue={gasto?.descripcion ?? ""}
            required
          />
          {fe.descripcion ? <p className="text-danger text-xs">{fe.descripcion}</p> : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="categoria_id">
                Categoría <span className="text-danger">*</span>
              </Label>
              <button
                type="button"
                onClick={() => setCategoriaModalOpen(true)}
                className="text-accent-600 inline-flex items-center gap-1 text-xs font-medium hover:underline"
              >
                <PlusCircle className="size-3.5" aria-hidden />
                Nueva categoría
              </button>
            </div>
            <select
              id="categoria_id"
              name="categoria_id"
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className={SELECT_CLASS}
              required
            >
              {categoriasLista.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            {fe.categoria_id ? <p className="text-danger text-xs">{fe.categoria_id}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fecha">
              Fecha <span className="text-danger">*</span>
            </Label>
            <Input
              id="fecha"
              name="fecha"
              type="date"
              defaultValue={gasto?.fecha ?? hoy}
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="metodo_pago">
            ¿De dónde salió el dinero? <span className="text-danger">*</span>
          </Label>
          {bloqueado ? (
            <>
              <p className="border-border bg-surface-2 text-heading flex h-10 items-center rounded-md border px-3 text-sm">
                {metodosActivos.find((m) => m.value === metodoInicial)?.label ?? metodoInicial}
              </p>
              <input type="hidden" name="metodo_pago" value={metodoInicial} />
            </>
          ) : (
            <>
              <select
                id="metodo_pago"
                name="metodo_pago"
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value as MmMetodoPago)}
                className={SELECT_CLASS}
                required
              >
                {metodosActivos.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              {fe.metodo_pago ? <p className="text-danger text-xs">{fe.metodo_pago}</p> : null}
              {esEfectivo(metodoPago) ? (
                cajaAbierta ? (
                  <p className="text-muted-foreground text-xs">
                    Se descontará automáticamente de la caja abierta.
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 text-xs text-amber-700">
                    <Info className="size-3.5 shrink-0" aria-hidden />
                    Necesitas abrir la caja antes de guardar este gasto en efectivo.
                  </p>
                )
              ) : (
                <>
                  <input type="hidden" name="cuenta_bancaria_id" value={cuentaResueltaId} />
                  {cuentasDelMetodo.length > 1 ? (
                    <div className="space-y-1.5 pt-1">
                      <Label htmlFor="cuenta_bancaria_select">
                        Cuenta de la que sale el dinero
                      </Label>
                      <select
                        id="cuenta_bancaria_select"
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
                  {fe.cuenta_bancaria_id ? (
                    <p className="text-danger text-xs">{fe.cuenta_bancaria_id}</p>
                  ) : faltaCuentaDigital ? (
                    <p className="flex items-center gap-1.5 text-xs text-amber-700">
                      <Info className="size-3.5 shrink-0" aria-hidden />
                      No hay una cuenta configurada para este método — configúrala en Bancos antes
                      de registrar este gasto.
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      Se descontará de: {cuentaResuelta?.banco} — {cuentaResuelta?.titular}.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {bloqueado ? (
          <div className="space-y-1.5">
            <Label>Monto del gasto (USD)</Label>
            <p className="border-border bg-surface-2 text-heading flex h-10 items-center rounded-md border px-3 text-sm tabular-nums">
              {new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD" }).format(
                gasto ? Number(gasto.monto_usd) : Number(montoUsd) || 0,
              )}
            </p>
            <input
              type="hidden"
              name="monto_usd"
              value={gasto ? String(gasto.monto_usd) : montoUsd}
            />
          </div>
        ) : (
          <CampoMontoDual
            id="monto_usd"
            label={
              <>
                Monto del gasto (USD) <span className="text-danger">*</span>
              </>
            }
            name="monto_usd"
            valorUsd={montoUsd}
            onChangeUsd={setMontoUsd}
            tasa={tasa}
            required
          />
        )}
        {fe.monto_usd ? <p className="text-danger -mt-2 text-xs">{fe.monto_usd}</p> : null}

        <div className="space-y-1.5">
          <Label htmlFor="notas">Notas (opcional)</Label>
          <textarea
            id="notas"
            name="notas"
            rows={3}
            placeholder="Detalles adicionales"
            defaultValue={gasto?.notas ?? ""}
            className="border-border bg-background focus-visible:ring-ring w-full resize-none rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
          />
        </div>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
          <SubmitButton disabled={!bloqueado && faltaCuentaDigital} className="w-full sm:w-auto">
            {gasto ? "Guardar cambios" : "Registrar gasto"}
          </SubmitButton>
        </div>
      </form>

      <Dialog open={categoriaModalOpen} onOpenChange={setCategoriaModalOpen}>
        <DialogContent className="max-w-md">
          <CategoriaMovimientoForm tipo="gasto" onDone={onCategoriaCreada} />
        </DialogContent>
      </Dialog>
    </Card>
  );
}
