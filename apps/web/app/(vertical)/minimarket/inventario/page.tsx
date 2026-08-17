import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Boxes, CircleDollarSign, PackageCheck, TriangleAlert } from "lucide-react";
import { Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  listCategorias,
  listProductos,
  listProveedores,
  resumirInventario,
  siguienteCorrelativoSku,
} from "@/lib/minimarket/data/inventario";
import { getSucursalActiva, esCatalogoIrrestricto } from "@/lib/minimarket/sucursal-acceso";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { defaultsFiscalesProducto, opcionesImpuesto } from "@/lib/minimarket/producto-opciones";
import { InventarioCliente } from "@/components/minimarket/inventario/inventario-cliente";

export const metadata: Metadata = { title: "Inventario" };

export default async function InventarioPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);

  // La lista de sucursales viene primero: `listProductos` la necesita para
  // saber sobre cuáles construir el desglose por sucursal de cada producto
  // (el aislamiento real de los NÚMEROS de stock ya lo impone RLS).
  const { activa: sucursalActiva, permitidas: sucursales } = await getSucursalActiva(
    supabase,
    tenantId,
    session.user.id,
  );
  const irrestricto = await esCatalogoIrrestricto(supabase, tenantId, session.user.id);

  if (sucursales.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <span className="bg-warning/12 text-warning inline-flex size-12 items-center justify-center rounded-2xl">
            <TriangleAlert className="size-6" aria-hidden />
          </span>
          <p className="text-heading font-medium">No tienes ninguna sucursal asignada</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Pídele al administrador que te asigne una sucursal desde Personal para poder ver el
            inventario.
          </p>
        </Card>
      </div>
    );
  }

  const [productos, categorias, proveedores, skuSugerido, tasa, configRes] = await Promise.all([
    listProductos(supabase, tenantId, sucursales, irrestricto),
    listCategorias(supabase, tenantId),
    listProveedores(supabase, tenantId),
    siguienteCorrelativoSku(supabase, tenantId),
    getTasaVigente(supabase, tenantId),
    supabase.from("mm_config_negocio").select("parametros").eq("tenant_id", tenantId).maybeSingle(),
  ]);

  const parametrosNegocio =
    configRes.data?.parametros &&
    typeof configRes.data.parametros === "object" &&
    !Array.isArray(configRes.data.parametros)
      ? (configRes.data.parametros as Record<string, unknown>)
      : {};
  const margenGlobalActivo = Boolean(parametrosNegocio.margen_global_activo ?? false);
  const margenGlobalPct =
    typeof parametrosNegocio.margen_global_pct === "number"
      ? parametrosNegocio.margen_global_pct
      : null;
  // Config fiscal del negocio (mismo criterio que Ventas/Compras/Finanzas):
  // define el default fiscal con el que nace un producto NUEVO.
  const ivaActivoNegocio = Boolean(parametrosNegocio.iva_activo ?? false);
  const igtfActivoNegocio = parametrosNegocio.igtf_activo !== false;
  const { impuestoId: impuestoIdDefault, aplicaIgtf: aplicaIgtfDefault } = defaultsFiscalesProducto(
    country,
    {
      ivaActivo: ivaActivoNegocio,
      igtfActivo: igtfActivoNegocio,
    },
  );

  const resumen = resumirInventario(productos);
  const impuestos = opcionesImpuesto(country);
  const usd = (valor: number) =>
    new Intl.NumberFormat(country.locale, { style: "currency", currency: "USD" }).format(valor);

  const tarjetas = [
    { label: "Productos", valor: String(resumen.totalProductos), Icon: Boxes },
    { label: "Bajo mínimo", valor: String(resumen.bajoMinimo), Icon: TriangleAlert },
    {
      label: "Valor inventario (venta)",
      valor: usd(resumen.valorInventarioUsd),
      Icon: CircleDollarSign,
    },
    {
      label: "Ganancia potencial",
      valor: usd(resumen.valorInventarioUsd - resumen.valorCostoUsd),
      Icon: PackageCheck,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-heading text-2xl font-semibold">Inventario</h1>
        <p className="text-muted-foreground">
          Tus productos, categorías y existencias. El precio base es en USD; los bolívares se
          calculan con la tasa vigente{tasa ? "." : " (aún sin registrar)."}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tarjetas.map(({ label, valor, Icon }) => (
          <Card key={label} className="flex items-center gap-3 p-4">
            <span className="bg-accent-500/12 text-accent-600 inline-flex size-10 items-center justify-center rounded-xl">
              <Icon className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-muted-foreground text-xs">{label}</p>
              <p className="text-heading font-display text-lg font-semibold tabular-nums">
                {valor}
              </p>
            </div>
          </Card>
        ))}
      </section>

      <InventarioCliente
        productos={productos}
        categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre }))}
        sucursales={sucursales}
        sucursalActivaId={sucursales.length > 1 ? (sucursalActiva?.id ?? null) : null}
        proveedores={proveedores.map((p) => ({ id: p.id, nombre: p.nombre }))}
        impuestos={impuestos}
        impuestoIdDefault={impuestoIdDefault}
        aplicaIgtfDefault={aplicaIgtfDefault}
        tasa={tasa ? tasa.valor : null}
        margenGlobalActivo={margenGlobalActivo}
        margenGlobalPct={margenGlobalPct}
        skuSugerido={skuSugerido}
        locale={country.locale}
        tenantId={tenantId}
        usuarioId={session.user.id}
      />
    </div>
  );
}
