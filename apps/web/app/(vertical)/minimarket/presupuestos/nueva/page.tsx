import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listProductos, listSucursales } from "@/lib/minimarket/data/inventario";
import { listClientes } from "@/lib/minimarket/data/clientes";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { siguienteNumeroPresupuesto } from "@/lib/minimarket/data/presupuestos";
import { PresupuestoForm } from "../presupuesto-form";
import { crearPresupuesto } from "../actions";

export const metadata: Metadata = { title: "Nuevo presupuesto" };

export default async function NuevoPresupuestoPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/inicio");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);

  const [productos, sucursales, clientes, tasa, configRes, numeroSugerido] = await Promise.all([
    listProductos(supabase, tenantId),
    listSucursales(supabase, tenantId),
    listClientes(supabase, tenantId),
    getTasaVigente(supabase, tenantId),
    supabase.from("mm_config_negocio").select("parametros").eq("tenant_id", tenantId).maybeSingle(),
    siguienteNumeroPresupuesto(supabase, tenantId),
  ]);

  const params = (configRes.data?.parametros as Record<string, unknown>) ?? {};
  const ivaActivo = Boolean(params.iva_activo ?? false);
  const ivaPct = Number(params.iva_pct ?? 16);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="space-y-1">
        <h1 className="font-display text-heading text-2xl font-semibold">Nuevo presupuesto</h1>
        <p className="text-muted-foreground">
          Cotiza con precios editables. No descuenta inventario ni registra dinero hasta que se
          convierta en venta.
        </p>
      </header>

      {!tasa ? (
        <p className="bg-warning/10 text-warning rounded-lg px-4 py-3 text-sm font-medium">
          Debes definir la tasa del día antes de crear un presupuesto.
        </p>
      ) : (
        <PresupuestoForm
          productos={productos
            .filter((p) => p.activo)
            .map((p) => ({
              id: p.id,
              nombre: p.nombre,
              codigo: p.codigos[0] ?? null,
              precio_usd: Number(p.precio_usd),
              imagen_url: p.imagen_url,
            }))}
          clientes={clientes.map((c) => ({
            id: c.id,
            nombre: c.nombre,
            cedula: c.cedula,
            telefono: c.telefono,
          }))}
          sucursales={sucursales.map((s) => ({ id: s.id, nombre: s.nombre }))}
          tasa={tasa.valor}
          locale={country.locale}
          ivaActivo={ivaActivo}
          ivaPct={ivaPct}
          action={crearPresupuesto}
          volverA="/minimarket/presupuestos"
          numeroSugerido={numeroSugerido}
        />
      )}
    </div>
  );
}
