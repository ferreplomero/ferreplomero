import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listCategorias, listProductos } from "@/lib/minimarket/data/inventario";
import { getSucursalActiva, esCatalogoIrrestricto } from "@/lib/minimarket/sucursal-acceso";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import {
  EtiquetasCliente,
  type ProductoEtiqueta,
} from "@/components/minimarket/inventario/etiquetas-cliente";

export const metadata: Metadata = { title: "Etiquetas de precio" };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Etiquetas de precio para imprimir y pegar en los productos. Solo lectura:
 * usa los mismos datos que la lista del inventario (productos, tasa vigente,
 * % de IVA del negocio) y no modifica nada.
 */
export default async function EtiquetasPage({ searchParams }: Props) {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const params = await searchParams;
  // Productos preseleccionados desde la selección masiva del inventario.
  const idsParam = typeof params.ids === "string" ? params.ids : "";
  const idsIniciales = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const supabase = await createClient();
  const { permitidas: sucursales } = await getSucursalActiva(supabase, tenantId, session.user.id);
  const irrestricto = await esCatalogoIrrestricto(supabase, tenantId, session.user.id);

  const [productos, categorias, tasa, configRes] = await Promise.all([
    sucursales.length > 0
      ? listProductos(supabase, tenantId, sucursales, irrestricto)
      : Promise.resolve([]),
    listCategorias(supabase, tenantId),
    getTasaVigente(supabase, tenantId),
    supabase
      .from("mm_config_negocio")
      .select("nombre_comercial, parametros")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  const parametros =
    configRes.data?.parametros &&
    typeof configRes.data.parametros === "object" &&
    !Array.isArray(configRes.data.parametros)
      ? (configRes.data.parametros as Record<string, unknown>)
      : {};
  const ivaPct = Number(parametros.iva_pct ?? 16);
  const ivaActivo = Boolean(parametros.iva_activo ?? false);

  const productosEtiqueta: ProductoEtiqueta[] = productos
    .filter((p) => p.activo)
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      sku: p.codigo ?? null,
      codigoBarras: p.codigos[0] ?? null,
      precioUsd: Number(p.precio_usd),
      impuestoId: p.impuesto_id,
      categoriaId: p.categoria_id ?? null,
      stock: Math.max(0, Math.floor(Number(p.stock_actual) || 0)),
    }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1 print:hidden">
        <Link
          href="/minimarket/inventario"
          className="text-muted-foreground hover:text-heading mb-2 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Inventario
        </Link>
        <h1 className="font-display text-heading text-2xl font-semibold">Etiquetas de precio</h1>
        <p className="text-muted-foreground">
          Elige el tamaño, la moneda y si el precio lleva IVA; selecciona los productos y presiona
          Imprimir. Los precios en bolívares se calculan con la tasa vigente.
        </p>
      </header>

      <EtiquetasCliente
        productos={productosEtiqueta}
        categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre }))}
        tasa={tasa?.valor ?? null}
        ivaPct={ivaPct}
        ivaActivo={ivaActivo}
        nombreNegocio={configRes.data?.nombre_comercial || "Mi negocio"}
        idsIniciales={idsIniciales}
      />
    </div>
  );
}
