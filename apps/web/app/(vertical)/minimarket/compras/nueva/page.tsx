import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { TZ_DEFAULT } from "@/lib/minimarket/timezone";
import { listCategorias, siguienteCorrelativoSku } from "@/lib/minimarket/data/inventario";
import { defaultsFiscalesProducto, opcionesImpuesto } from "@/lib/minimarket/producto-opciones";
import { parseMetodosPago } from "@/lib/minimarket/metodos-pago";
import { getSesionAbierta } from "@/lib/minimarket/data/caja";
import { listCuentasBancarias } from "@/lib/minimarket/data/bancos";
import { CompraForm } from "../compra-form";

export const metadata: Metadata = { title: "Nueva compra" };

export default async function NuevaCompraPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/inicio");

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);

  const [
    { data: productos },
    { data: proveedores },
    { data: sucursales },
    tasa,
    configRes,
    categorias,
    skuSugerido,
    configMetodosRes,
    sesion,
    cuentasBancarias,
  ] = await Promise.all([
    supabase
      .from("mm_productos")
      .select("id, nombre, codigo, costo_usd, imagen_url")
      .eq("tenant_id", tenantId)
      .eq("activo", true)
      .is("deleted_at", null)
      .order("nombre", { ascending: true }),
    supabase
      .from("mm_proveedores")
      .select("id, nombre")
      .eq("tenant_id", tenantId)
      .eq("activo", true)
      .is("deleted_at", null)
      .order("nombre", { ascending: true }),
    supabase
      .from("mm_sucursales")
      .select("id, nombre")
      .eq("tenant_id", tenantId)
      .eq("activa", true)
      .is("deleted_at", null)
      .order("nombre", { ascending: true }),
    getTasaVigente(supabase, tenantId),
    supabase.from("mm_config_negocio").select("parametros").eq("tenant_id", tenantId).maybeSingle(),
    listCategorias(supabase, tenantId),
    siguienteCorrelativoSku(supabase, tenantId),
    supabase
      .from("mm_config_negocio")
      .select("metodos_pago")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    getSesionAbierta(supabase, tenantId),
    listCuentasBancarias(supabase, tenantId),
  ]);
  const metodosPago = parseMetodosPago(configMetodosRes.data?.metodos_pago);

  const paramsFiscales = (configRes.data?.parametros as Record<string, unknown>) ?? {};
  const ivaActivo = Boolean(paramsFiscales.iva_activo ?? false);
  const ivaPct = Number(paramsFiscales.iva_pct ?? 16);
  const igtfActivo = paramsFiscales.igtf_activo !== false;
  const tzRaw = paramsFiscales.timezone;
  const tz = typeof tzRaw === "string" && tzRaw.length > 0 ? tzRaw : TZ_DEFAULT;
  const margenGlobalActivo = Boolean(paramsFiscales.margen_global_activo ?? false);
  const margenGlobalPct =
    typeof paramsFiscales.margen_global_pct === "number" ? paramsFiscales.margen_global_pct : null;
  const impuestos = opcionesImpuesto(country);
  const { impuestoId: impuestoIdDefault, aplicaIgtf: aplicaIgtfDefault } = defaultsFiscalesProducto(
    country,
    { ivaActivo, igtfActivo },
  );

  if (!sucursales?.length) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <p className="text-muted-foreground">
          Debes tener al menos una sucursal activa para registrar compras.{" "}
          <Link href="/minimarket/config" className="text-accent-600 hover:underline">
            Configura tu sucursal
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/minimarket/compras"
          className="text-muted-foreground hover:text-heading mb-2 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Compras
        </Link>
        <h1 className="font-display text-heading text-2xl font-semibold">Nueva compra</h1>
        <p className="text-muted-foreground text-sm">
          Agrega los productos recibidos. Si eliges &ldquo;Recibida directamente&rdquo;, el stock se
          suma al inventario inmediatamente.
        </p>
      </header>

      <CompraForm
        productos={(productos ?? []).map((p) => ({
          id: p.id,
          nombre: p.nombre,
          codigo: p.codigo,
          costo_usd: Number(p.costo_usd ?? 0),
          imagen_url: p.imagen_url,
        }))}
        proveedores={proveedores ?? []}
        sucursales={sucursales}
        tasa={tasa?.valor ?? 1}
        locale={country.locale}
        tenantId={tenantId}
        usuarioId={session.user.id}
        ivaActivo={ivaActivo}
        ivaPct={ivaPct}
        igtfActivo={igtfActivo}
        tz={tz}
        categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre }))}
        impuestos={impuestos}
        impuestoIdDefault={impuestoIdDefault}
        aplicaIgtfDefault={aplicaIgtfDefault}
        margenGlobalActivo={margenGlobalActivo}
        margenGlobalPct={margenGlobalPct}
        skuSugerido={skuSugerido}
        metodosPago={metodosPago}
        cajaAbierta={Boolean(sesion)}
        cuentasBancarias={cuentasBancarias}
      />
    </div>
  );
}
