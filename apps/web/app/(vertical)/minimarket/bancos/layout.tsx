import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listCuentasConSaldo, saldoNativo } from "@/lib/minimarket/data/bancos";
import { moduloPermitido, resolverContextoPermisos } from "@/lib/minimarket/permisos";

/**
 * Envuelve TODAS las sub-rutas de Bancos (`pago-movil`, `transferencia`,
 * `tarjeta`, `zelle`, `cashea`, y el detalle `[id]`) con un encabezado común
 * que muestra los totales GENERALES del negocio (todas las cuentas, todos
 * los tipos) — así siguen accesibles sin importar en qué tipo estés parado,
 * aunque cada tipo ahora vive en su propia página (submenú del sidebar, ver
 * `lib/minimarket/nav.ts`) en vez de una sola vista mezclada.
 *
 * Cada total es un saldo NATIVO fijo (`saldoNativo`) — nunca reconvertido
 * con la tasa del día, mismo criterio que cada tarjeta de cuenta.
 */
export default async function BancosLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/inicio");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);

  const [cuentas, permisos, configRes] = await Promise.all([
    listCuentasConSaldo(supabase, tenantId),
    resolverContextoPermisos(supabase, tenantId, session.user.id),
    supabase
      .from("mm_config_negocio")
      .select("medios_saldos_completados_en")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  const puedeConfigurar = moduloPermitido("/minimarket/configuracion", permisos);
  // Cashea no participa del saldo inicial (regla de negocio: no aplica) — el
  // aviso se muestra en el resto de los medios (pago móvil, transferencia,
  // tarjeta, Zelle) pero nunca en /minimarket/bancos/cashea.
  const pathname = (await headers()).get("x-pathname") ?? "";
  const enCashea = pathname.startsWith("/minimarket/bancos/cashea");
  const faltaConfigurarSaldos =
    puedeConfigurar && !enCashea && !configRes.data?.medios_saldos_completados_en;

  const money = (valor: number, moneda: string) => {
    try {
      return new Intl.NumberFormat(country.locale, { style: "currency", currency: moneda }).format(
        valor,
      );
    } catch {
      return `${moneda} ${valor.toFixed(2)}`;
    }
  };

  let totalBs = 0;
  let totalUsd = 0;
  for (const c of cuentas) {
    const s = saldoNativo(c);
    if (s.moneda === "VES") totalBs += s.monto;
    else totalUsd += s.monto;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-heading text-2xl font-semibold">Bancos</h1>
        <p className="text-muted-foreground">
          El dinero digital de tu negocio (pago móvil, transferencia, Zelle, tarjeta, Cashea) — el
          equivalente a la caja, pero para lo que no es efectivo. Cada cuenta muestra su saldo real
          en la moneda en que entró — nunca cambia porque suba o baje el dólar.
        </p>
      </header>

      {faltaConfigurarSaldos ? (
        <Link
          href="/minimarket/configuracion/saldos-iniciales"
          className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-800 transition-colors hover:bg-amber-100"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          <span>Aún no declaraste el saldo inicial de tus cuentas bancarias.</span>
          <span className="ml-auto shrink-0 font-semibold">Configurar →</span>
        </Link>
      ) : null}

      {cuentas.length > 0 ? (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Total general en Bs
            </p>
            <p className="text-heading font-semibold tabular-nums">{money(totalBs, "VES")}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Total general en USD
            </p>
            <p className="text-heading font-semibold tabular-nums">{money(totalUsd, "USD")}</p>
          </div>
        </Card>
      ) : null}

      {children}
    </div>
  );
}
