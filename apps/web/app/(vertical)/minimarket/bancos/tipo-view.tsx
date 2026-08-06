import Link from "next/link";
import { redirect } from "next/navigation";
import { Landmark } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listCuentasConSaldo, saldoNativo } from "@/lib/minimarket/data/bancos";
import {
  METODO_CUENTA_LABEL,
  monedaNativaCuenta,
  type MetodoConCuenta,
} from "@/lib/minimarket/bancos";

interface Props {
  metodo: MetodoConCuenta;
}

/**
 * Vista de UN SOLO tipo de cuenta bancaria (pago móvil, transferencia,
 * tarjeta, Zelle o Cashea) — cada una vive en su propia ruta bajo
 * `/minimarket/bancos/<tipo>` (ver `page.tsx` de cada subcarpeta, todos
 * delgados: solo pasan `metodo`). No es un archivo de ruta (no se llama
 * `page.tsx`), así que Next.js no lo trata como segmento — es un módulo
 * compartido normal, mismo patrón que otros helpers colocados junto a sus
 * rutas en este vertical.
 *
 * El saldo de cada cuenta se muestra DIRECTO en su tarjeta (sin entrar al
 * detalle) y SIEMPRE en la moneda nativa fija del método (`saldoNativo`) —
 * nunca reconvertido con la tasa del día.
 */
export async function BancosTipoView({ metodo }: Props) {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);

  const todas = await listCuentasConSaldo(supabase, tenantId);
  const cuentas = todas.filter((c) => c.metodo === metodo);

  const money = (valor: number, moneda: string) => {
    try {
      return new Intl.NumberFormat(country.locale, { style: "currency", currency: moneda }).format(
        valor,
      );
    } catch {
      return `${moneda} ${valor.toFixed(2)}`;
    }
  };

  const label = METODO_CUENTA_LABEL[metodo];
  const monedaTipo = monedaNativaCuenta(metodo);
  const totalTipo = cuentas.reduce((s, c) => s + saldoNativo(c).monto, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-heading text-xl font-semibold">{label}</h1>
          <p className="text-muted-foreground text-sm">
            {cuentas.length} cuenta{cuentas.length !== 1 ? "s" : ""}
          </p>
        </div>
        {cuentas.length > 0 ? (
          <div className="text-right">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">Total {label}</p>
            <p className="text-heading font-display text-xl font-bold tabular-nums">
              {money(totalTipo, monedaTipo)}
            </p>
          </div>
        ) : null}
      </header>

      {cuentas.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <span className="bg-accent-500/10 text-accent-600 inline-flex size-12 items-center justify-center rounded-2xl">
            <Landmark className="size-6" aria-hidden />
          </span>
          <p className="text-heading font-medium">Aún no tienes cuentas de {label}</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Agrégala en{" "}
            <Link href="/minimarket/configuracion" className="text-accent-600 underline">
              Configuración → Métodos de pago
            </Link>
            .
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {cuentas.map((c) => {
            const s = saldoNativo(c);
            return (
              <Link key={c.id} href={`/minimarket/bancos/${c.id}`}>
                <Card className="hover:border-accent-400 h-full space-y-2 p-4 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-heading flex items-center gap-1.5 truncate text-sm font-semibold">
                        {c.banco}
                        {c.predeterminada ? (
                          <span className="bg-accent-500/10 text-accent-600 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium">
                            Predeterminada
                          </span>
                        ) : null}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">{c.titular}</p>
                    </div>
                  </div>
                  <div className="border-border border-t pt-2">
                    <p
                      className={`font-semibold tabular-nums ${s.monto < 0 ? "text-danger" : "text-heading"}`}
                    >
                      {money(s.monto, s.moneda === "USD" ? "USD" : "VES")}
                    </p>
                    {s.monto < 0 ? (
                      <p className="text-danger mt-1 text-xs">
                        Saldo negativo — revisa el historial de esta cuenta.
                      </p>
                    ) : null}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
