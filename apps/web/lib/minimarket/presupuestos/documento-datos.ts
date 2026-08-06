/**
 * Arma los datos de un presupuesto en el shape plano que consumen tanto el
 * PDF (`lib/minimarket/pdf/presupuesto-documento.tsx`) como el Excel
 * (`lib/minimarket/presupuestos/excel.ts`) — evita repetir esta consulta en
 * los 4 route handlers que generan documentos (privados y públicos).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@arkiteq/db";
import { getPresupuestoDetalle } from "@/lib/minimarket/data/presupuestos";
import { fmtFechaCorta } from "@/lib/minimarket/date-format";
import { convertirImagenesAPng } from "@/lib/minimarket/pdf/convertir-imagen";

type Client = SupabaseClient<Database>;

export interface DatosDocumentoPresupuesto {
  numero: string;
  fechaEmision: string;
  validezHasta: string;
  negocio: {
    nombre: string;
    rif: string | null;
    direccion: string | null;
    logoUrl: string | null;
    /** Logo ya convertido a PNG (react-pdf/exceljs no soportan WebP) — `null`
     * si no hay logo o la conversión falló (nunca rompe el documento). */
    logoPng: Buffer | null;
  };
  cliente: { nombre: string; cedula: string | null; telefono: string | null } | null;
  items: {
    descripcion: string;
    cantidad: number;
    precioUnitarioUsd: number;
    subtotalUsd: number;
    /** Miniatura del producto ya convertida a PNG — `null` si el producto no
     * tiene foto o la conversión falló (la línea queda con placeholder). */
    imagenPng: Buffer | null;
  }[];
  subtotalUsd: number;
  ivaUsd: number;
  totalUsd: number;
  totalBs: number;
  tasaUsada: number;
}

export async function obtenerDatosDocumentoPresupuesto(
  client: Client,
  tenantId: string,
  presupuestoId: string,
  tz: string,
): Promise<DatosDocumentoPresupuesto | null> {
  const [presupuesto, configRes] = await Promise.all([
    getPresupuestoDetalle(client, tenantId, presupuestoId, tz),
    client
      .from("mm_config_negocio")
      .select("nombre_comercial, rif, direccion, logo_url")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);
  if (!presupuesto) return null;

  const productoIds = [...new Set(presupuesto.items.map((i) => i.productoId))];
  const { data: productosImg } =
    productoIds.length > 0
      ? await client.from("mm_productos").select("id, imagen_url").in("id", productoIds)
      : { data: [] as { id: string; imagen_url: string | null }[] };
  const imagenPorProducto = new Map((productosImg ?? []).map((p) => [p.id, p.imagen_url]));

  const logoUrl = configRes.data?.logo_url ?? null;
  const urlsAConvertir = [
    logoUrl,
    ...presupuesto.items.map((i) => imagenPorProducto.get(i.productoId) ?? null),
  ];
  const pngPorUrl = await convertirImagenesAPng(urlsAConvertir);

  return {
    numero: presupuesto.numero,
    fechaEmision: fmtFechaCorta(presupuesto.fechaEmision, tz),
    validezHasta: fmtFechaCorta(presupuesto.validezHasta, tz),
    negocio: {
      nombre: configRes.data?.nombre_comercial || "Mi negocio",
      rif: configRes.data?.rif ?? null,
      direccion: configRes.data?.direccion ?? null,
      logoUrl,
      logoPng: logoUrl ? (pngPorUrl.get(logoUrl) ?? null) : null,
    },
    cliente: presupuesto.clienteNombre
      ? {
          nombre: presupuesto.clienteNombre,
          cedula: presupuesto.clienteCedula,
          telefono: presupuesto.clienteTelefono,
        }
      : null,
    items: presupuesto.items.map((i) => {
      const url = imagenPorProducto.get(i.productoId) ?? null;
      return {
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precioUnitarioUsd: i.precioUnitarioUsd,
        subtotalUsd: i.subtotalUsd,
        imagenPng: url ? (pngPorUrl.get(url) ?? null) : null,
      };
    }),
    subtotalUsd: presupuesto.subtotalUsd,
    ivaUsd: presupuesto.ivaUsd,
    totalUsd: presupuesto.totalUsd,
    totalBs: presupuesto.totalBs,
    tasaUsada: presupuesto.tasaUsada,
  };
}
