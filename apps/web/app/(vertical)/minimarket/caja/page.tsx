import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  getSesionAbierta,
  listMovimientosCaja,
  listSesionesCerradas,
} from "@/lib/minimarket/data/caja";
import { CajaModuloCliente } from "@/components/minimarket/caja/caja-modulo-cliente";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaHora } from "@/lib/minimarket/date-format";

export const metadata: Metadata = { title: "Caja" };

export default async function CajaPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);

  const [sesion, cerradas, tz] = await Promise.all([
    getSesionAbierta(supabase, tenantId),
    listSesionesCerradas(supabase, tenantId),
    getTimezoneNegocio(supabase, tenantId),
  ]);

  const movimientos = sesion ? await listMovimientosCaja(supabase, tenantId, sesion.id) : [];

  const money = (valor: number | null, moneda: string) => {
    const n = valor ?? 0;
    try {
      return new Intl.NumberFormat(country.locale, { style: "currency", currency: moneda }).format(
        n,
      );
    } catch {
      return `${moneda} ${n.toFixed(2)}`;
    }
  };
  const fechaStr = (iso: string) => fmtFechaHora(iso, tz);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-heading text-2xl font-semibold">Caja</h1>
        <p className="text-muted-foreground">
          Abre el turno con el efectivo inicial, registra movimientos y haz el arqueo al cerrar. El
          efectivo esperado se calcula solo, nunca se edita a mano.
        </p>
      </header>

      <CajaModuloCliente
        sesionInicial={
          sesion
            ? {
                id: sesion.id,
                monto_inicial_usd: Number(sesion.monto_inicial_usd),
                monto_inicial_bs: Number(sesion.monto_inicial_bs),
                abierta_en: sesion.abierta_en,
              }
            : null
        }
        movimientosIniciales={movimientos}
        tenantId={tenantId}
        usuarioId={session.user.id}
        locale={country.locale}
        tz={tz}
      />

      {cerradas.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <div className="border-border text-heading border-b px-4 py-3 text-sm font-medium">
            Turnos cerrados
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Cerrada</th>
                  <th className="px-4 py-2.5 text-right font-medium">Final USD</th>
                  <th className="px-4 py-2.5 text-right font-medium">Final Bs</th>
                  <th className="px-4 py-2.5 text-right font-medium">Dif. USD</th>
                  <th className="px-4 py-2.5 text-right font-medium">Dif. Bs</th>
                </tr>
              </thead>
              <tbody>
                {cerradas.map((s) => {
                  const difClase = (d: number | null) =>
                    d === null || Math.abs(d) < 0.005 ? "text-muted-foreground" : "text-warning";
                  return (
                    <tr key={s.id} className="border-border/70 border-b last:border-0">
                      <td className="text-muted-foreground whitespace-nowrap px-4 py-2.5">
                        {s.cerrada_en ? fechaStr(s.cerrada_en) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {money(s.monto_final_usd, "USD")}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {money(s.monto_final_bs, "VES")}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right tabular-nums ${difClase(s.diferencia_usd)}`}
                      >
                        {money(s.diferencia_usd, "USD")}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right tabular-nums ${difClase(s.diferencia_bs)}`}
                      >
                        {money(s.diferencia_bs, "VES")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
