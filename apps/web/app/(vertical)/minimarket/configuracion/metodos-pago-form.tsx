"use client";

import { useActionState } from "react";
import Image from "next/image";
import {
  ArrowLeftRight,
  Banknote,
  CheckCircle,
  CreditCard,
  DollarSign,
  Smartphone,
  Users,
  Zap,
} from "lucide-react";
import type { LucideProps } from "lucide-react";
import { Button, Card } from "@arkiteq/ui";
import {
  CAMPO_LABEL,
  CAMPO_PLACEHOLDER,
  METODO_CAMPOS,
  METODO_META,
  METODOS_PAGO_IDS,
} from "@/lib/minimarket/metodos-pago";
import type { MetodoPagoConfigItem } from "@/lib/minimarket/metodos-pago";
import { esMetodoConCuenta } from "@/lib/minimarket/bancos";
import type { MmCuentaBancaria } from "@arkiteq/db";
import { actualizarMetodosPago } from "./actions";
import { CuentasBancariasPanel } from "./cuentas-bancarias-panel";

interface Props {
  metodos: MetodoPagoConfigItem[];
  /** Cuentas bancarias de pago móvil/transferencia/tarjeta — reemplazan los
   * campos planos banco/teléfono/cuenta para esos 3 métodos (ver 0083). */
  cuentasBancarias: MmCuentaBancaria[];
}

type IconComponent = (props: LucideProps) => React.JSX.Element;

const ICONS: Record<string, IconComponent> = {
  efectivo_bs: Banknote as IconComponent,
  efectivo_usd: DollarSign as IconComponent,
  pago_movil: Smartphone as IconComponent,
  transferencia: ArrowLeftRight as IconComponent,
  zelle: Zap as IconComponent,
  tarjeta: CreditCard as IconComponent,
  fiado: Users as IconComponent,
  // cashea no tiene ícono aquí: usa su logo real (ver el renderizado más abajo).
};

const LABEL = "text-muted-foreground block text-xs font-medium uppercase tracking-wide";
const INPUT =
  "border-border bg-background text-heading w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-offset-1 focus:ring-accent-400";

export function MetodosPagoForm({ metodos, cuentasBancarias }: Props) {
  const [state, action, pending] = useActionState(actualizarMetodosPago, {});

  const get = (id: string): MetodoPagoConfigItem =>
    metodos.find((m) => m.metodo === id) ?? {
      metodo: id as MetodoPagoConfigItem["metodo"],
      activo: true,
    };

  return (
    <Card className="space-y-5 p-6">
      <div className="space-y-1">
        <h2 className="text-heading text-base font-semibold">Métodos de pago</h2>
        <p className="text-muted-foreground text-sm">
          Activa los métodos que acepta tu negocio e ingresa los datos que aparecerán en los recibos
          y confirmaciones de pago a los clientes.
        </p>
      </div>

      {state.ok ? (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle className="size-4 shrink-0" />
          Métodos de pago guardados.
        </div>
      ) : null}
      {state.error ? <p className="text-danger text-sm">{state.error}</p> : null}

      <form action={action} className="space-y-3">
        {METODOS_PAGO_IDS.map((id) => {
          const m = get(id);
          const meta = METODO_META[id];
          const campos = (METODO_CAMPOS[id] ?? []) as string[];
          const Icon = (ICONS[id] ?? Banknote) as IconComponent;
          const esCashea = id === "cashea";

          return (
            <div key={id} className="border-border space-y-3 rounded-lg border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  {esCashea ? (
                    // Logo real en negro/amarillo — la identidad de Cashea se
                    // reconoce de un vistazo, distinta del resto de íconos genéricos.
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-black">
                      <Image src="/cashea-logo.png" alt="" width={22} height={22} />
                    </span>
                  ) : (
                    <span className="bg-surface-2 inline-flex size-9 shrink-0 items-center justify-center rounded-lg">
                      <Icon className="text-muted-foreground size-4" aria-hidden />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-heading text-sm font-medium">{meta.label}</p>
                    <p className="text-muted-foreground text-xs">{meta.descripcion}</p>
                  </div>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2">
                  <span className="text-muted-foreground text-xs">Activo</span>
                  <input
                    type="checkbox"
                    name={`metodo_${id}_activo`}
                    value="1"
                    defaultChecked={m.activo}
                    className="accent-accent-500 h-4 w-4 cursor-pointer rounded"
                  />
                </label>
              </div>

              {campos.length > 0 && !esMetodoConCuenta(id) ? (
                <div className="border-border mt-3 grid gap-3 border-t pt-1 sm:grid-cols-2">
                  {campos.map((campo) => (
                    <div key={campo} className="space-y-1.5 pt-3 first:pt-0 sm:pt-3">
                      <label htmlFor={`${id}_${campo}`} className={LABEL}>
                        {CAMPO_LABEL[campo] ?? campo}
                      </label>
                      <input
                        id={`${id}_${campo}`}
                        name={`metodo_${id}_${campo}`}
                        defaultValue={
                          ((m as unknown as Record<string, unknown>)[campo] as
                            string | undefined) ?? ""
                        }
                        maxLength={200}
                        placeholder={CAMPO_PLACEHOLDER[campo] ?? ""}
                        className={INPUT}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar métodos de pago"}
          </Button>
        </div>
      </form>

      {/* Cuentas bancarias de pago móvil/transferencia/tarjeta viven en su
          propia tabla (mm_cuentas_bancarias), con sus propios formularios —
          DEBEN quedar fuera del <form> de arriba: un <form> anidado dentro de
          otro es HTML inválido y rompería el envío de "Guardar métodos de pago". */}
      <div className="space-y-4">
        {METODOS_PAGO_IDS.filter(esMetodoConCuenta).map((id) => (
          <div key={id} className="border-border rounded-lg border p-4">
            <p className="text-heading text-sm font-medium">
              {METODO_META[id].label} — cuentas bancarias
            </p>
            <p className="text-muted-foreground text-xs">
              A cuál cuenta entra el dinero de este método, y de cuál sale si el vuelto se devuelve
              por acá.
            </p>
            <CuentasBancariasPanel
              metodo={id}
              cuentas={cuentasBancarias.filter((c) => c.metodo === id)}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
