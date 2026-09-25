/**
 * Lecturas del catálogo público. EXCLUSIVO de servidor: se usan con
 * `createServiceClient()` (salta RLS), así que:
 *  - tenant y sucursal se resuelven SIEMPRE a partir de un slug activo
 *    (`resolverCatalogo`), nunca de un id enviado por el navegador;
 *  - todos los selects llevan columnas explícitas: jamás costo, márgenes,
 *    stock exacto ni datos administrativos — del stock solo sale `disponible`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MmMetodoPago } from "@arkiteq/db";
import { getTasaVigente, getTipoPreferido, TIPO_TASA_LABEL } from "@/lib/minimarket/exchange-rate";
import { parseMetodosPago } from "@/lib/minimarket/metodos-pago";
import { esMetodoConCuenta } from "@/lib/minimarket/bancos";
import { METODOS_DIVISA } from "@/lib/minimarket/constants";
import type { ConfigImpuestos, ProductoParaPedido } from "./calculo";

type Client = SupabaseClient<Database>;

export const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const esSlugValido = (s: string) => s.length >= 3 && s.length <= 80 && SLUG_REGEX.test(s);

/** Métodos "pagar ahora" (con comprobante). Nunca tarjeta: requiere punto físico. */
export const METODOS_ONLINE = ["pago_movil", "transferencia", "zelle"] as const;
/** Métodos "pagar en el local". */
export const METODOS_LOCAL = [
  "efectivo_bs",
  "efectivo_usd",
  "tarjeta",
  "pago_movil",
  "transferencia",
  "zelle",
  "cashea",
] as const;
export type MetodoOnline = (typeof METODOS_ONLINE)[number];
export type MetodoLocal = (typeof METODOS_LOCAL)[number];

/** Moneda en la que se recibe el dinero de un método (misma regla que el POS). */
export function monedaMetodo(metodo: MmMetodoPago): "USD" | "VES" {
  return METODOS_DIVISA.includes(metodo) ? "USD" : "VES";
}

export interface CatalogoResuelto {
  id: string;
  tenantId: string;
  sucursalId: string;
  slug: string;
}

export async function resolverCatalogo(
  service: Client,
  slug: string,
): Promise<CatalogoResuelto | null> {
  if (!esSlugValido(slug)) return null;
  const { data } = await service
    .from("mm_catalogo_publico")
    .select("id, tenant_id, sucursal_id, slug")
    .eq("slug", slug)
    .eq("activo", true)
    .maybeSingle();
  if (!data) return null;
  const { data: suc } = await service
    .from("mm_sucursales")
    .select("id")
    .eq("id", data.sucursal_id)
    .eq("tenant_id", data.tenant_id)
    .eq("activa", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (!suc) return null;
  return { id: data.id, tenantId: data.tenant_id, sucursalId: data.sucursal_id, slug: data.slug };
}

export function configImpuestosDe(parametros: unknown): ConfigImpuestos {
  const p =
    parametros && typeof parametros === "object" && !Array.isArray(parametros)
      ? (parametros as Record<string, unknown>)
      : {};
  // Mismos defaults que `registrarVenta`.
  return {
    igtfActivo: p.igtf_activo !== false,
    ivaActivo: Boolean(p.iva_activo ?? false),
    ivaPct: Number(p.iva_pct ?? 16),
  };
}

/** Datos de una cuenta que el cliente necesita para pagar (sin ids internos de más). */
export interface CuentaPublica {
  id: string;
  metodo: MmMetodoPago;
  banco: string;
  titular: string;
  rif: string | null;
  telefono: string | null;
  cuenta: string | null;
  correo: string | null;
}

export interface MetodosDisponibles {
  online: { metodo: MetodoOnline; cuentas: CuentaPublica[] }[];
  local: MetodoLocal[];
}

/** Métodos activos del negocio aptos para cada forma de pago. Un método
 * online solo se ofrece si hay al menos una cuenta activa a la cual pagar
 * (`registrarVenta` exige cuenta en todo pago digital). */
export async function getMetodosDisponibles(
  service: Client,
  tenantId: string,
  metodosPagoRaw: unknown,
): Promise<MetodosDisponibles> {
  const activos = new Set(
    parseMetodosPago(metodosPagoRaw)
      .filter((m) => m.activo)
      .map((m) => m.metodo as string),
  );
  const { data: cuentas } = await service
    .from("mm_cuentas_bancarias")
    .select("id, metodo, banco, titular, rif, telefono, cuenta, correo, predeterminada")
    .eq("tenant_id", tenantId)
    .eq("activa", true)
    .is("deleted_at", null)
    .order("predeterminada", { ascending: false })
    .order("created_at", { ascending: true });
  const lista = cuentas ?? [];
  const conCuenta = (m: MmMetodoPago) => lista.some((c) => c.metodo === m);

  return {
    online: METODOS_ONLINE.filter((m) => activos.has(m) && conCuenta(m)).map((m) => ({
      metodo: m,
      cuentas: lista
        .filter((c) => c.metodo === m)
        .map((c) => ({
          id: c.id,
          metodo: c.metodo,
          banco: c.banco,
          titular: c.titular,
          rif: c.rif,
          telefono: c.telefono,
          cuenta: c.cuenta,
          correo: c.correo,
        })),
    })),
    local: METODOS_LOCAL.filter((m) => activos.has(m) && (!esMetodoConCuenta(m) || conCuenta(m))),
  };
}

/** Stock real (> 0) y presencia de productos en la sucursal. */
async function stockYPresencia(
  service: Client,
  tenantId: string,
  sucursalId: string,
  ids: string[] | null,
): Promise<{ stock: Map<string, number>; presentes: Set<string> }> {
  const stock = new Map<string, number>();
  const presentes = new Set<string>();
  const PAGINA = 1000;
  for (let desde = 0; ; desde += PAGINA) {
    let q = service
      .from("mm_v_stock")
      .select("producto_id, stock_actual")
      .eq("tenant_id", tenantId)
      .eq("sucursal_id", sucursalId);
    if (ids) q = q.in("producto_id", ids);
    const { data } = await q.range(desde, desde + PAGINA - 1);
    for (const r of data ?? []) {
      if (!r.producto_id) continue;
      stock.set(r.producto_id, Number(r.stock_actual ?? 0));
      presentes.add(r.producto_id);
    }
    if (!data || data.length < PAGINA) break;
  }
  for (let desde = 0; ; desde += PAGINA) {
    let q = service
      .from("mm_inventario")
      .select("producto_id")
      .eq("tenant_id", tenantId)
      .eq("sucursal_id", sucursalId)
      .is("deleted_at", null);
    if (ids) q = q.in("producto_id", ids);
    const { data } = await q.range(desde, desde + PAGINA - 1);
    for (const r of data ?? []) presentes.add(r.producto_id);
    if (!data || data.length < PAGINA) break;
  }
  return { stock, presentes };
}

/** Productos reales para calcular/validar un pedido (precio, impuestos, stock). */
export async function cargarProductosParaPedido(
  service: Client,
  tenantId: string,
  sucursalId: string,
  ids: string[],
): Promise<Map<string, ProductoParaPedido>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();
  const [{ data: prods }, { stock, presentes }] = await Promise.all([
    service
      .from("mm_productos")
      .select("id, nombre, precio_usd, impuesto_id, aplica_igtf, activo, deleted_at")
      .eq("tenant_id", tenantId)
      .in("id", unicos),
    stockYPresencia(service, tenantId, sucursalId, unicos),
  ]);
  return new Map(
    (prods ?? []).map((p) => [
      p.id,
      {
        id: p.id,
        nombre: p.nombre,
        precio_usd: Number(p.precio_usd),
        impuesto_id: p.impuesto_id,
        aplica_igtf: p.aplica_igtf,
        activo: p.activo,
        deleted_at: p.deleted_at,
        presenteEnSucursal: presentes.has(p.id),
        stock: stock.get(p.id) ?? 0,
      },
    ]),
  );
}

export interface ProductoTienda {
  id: string;
  nombre: string;
  descripcion: string | null;
  precioUsd: number;
  imagenUrl: string | null;
  categoriaId: string | null;
  disponible: boolean;
}

export interface TiendaPublica {
  catalogo: CatalogoResuelto;
  negocio: { nombre: string; logoUrl: string | null };
  sucursal: { nombre: string; direccion: string | null; telefono: string | null };
  tasa: { valor: number; tipoLabel: string } | null;
  config: ConfigImpuestos;
  productos: ProductoTienda[];
  categorias: { id: string; nombre: string }[];
  metodos: MetodosDisponibles;
}

export async function getTiendaPublica(
  service: Client,
  catalogo: CatalogoResuelto,
): Promise<TiendaPublica> {
  const { tenantId, sucursalId } = catalogo;
  const [configRes, sucRes, tasa, tipo, catsRes, presencia] = await Promise.all([
    service
      .from("mm_config_negocio")
      .select("nombre_comercial, logo_url, parametros, metodos_pago")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    service
      .from("mm_sucursales")
      .select("nombre, direccion, telefono")
      .eq("id", sucursalId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    getTasaVigente(service, tenantId),
    getTipoPreferido(service, tenantId),
    service
      .from("mm_categorias")
      .select("id, nombre")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("orden", { ascending: true }),
    stockYPresencia(service, tenantId, sucursalId, null),
  ]);

  const productos: ProductoTienda[] = [];
  const PAGINA = 1000;
  for (let desde = 0; ; desde += PAGINA) {
    const { data } = await service
      .from("mm_productos")
      .select("id, nombre, descripcion, precio_usd, imagen_url, categoria_id")
      .eq("tenant_id", tenantId)
      .eq("activo", true)
      .is("deleted_at", null)
      .order("nombre", { ascending: true })
      .range(desde, desde + PAGINA - 1);
    for (const p of data ?? []) {
      if (!presencia.presentes.has(p.id)) continue;
      productos.push({
        id: p.id,
        nombre: p.nombre,
        descripcion: p.descripcion,
        precioUsd: Number(p.precio_usd),
        imagenUrl: p.imagen_url,
        categoriaId: p.categoria_id,
        disponible: (presencia.stock.get(p.id) ?? 0) > 0,
      });
    }
    if (!data || data.length < PAGINA) break;
  }

  const catsUsadas = new Set(productos.map((p) => p.categoriaId));
  return {
    catalogo,
    negocio: {
      nombre: configRes.data?.nombre_comercial || "Tienda",
      logoUrl: configRes.data?.logo_url ?? null,
    },
    sucursal: {
      nombre: sucRes.data?.nombre ?? "",
      direccion: sucRes.data?.direccion ?? null,
      telefono: sucRes.data?.telefono ?? null,
    },
    tasa: tasa ? { valor: tasa.valor, tipoLabel: TIPO_TASA_LABEL[tipo] } : null,
    config: configImpuestosDe(configRes.data?.parametros),
    productos,
    categorias: (catsRes.data ?? []).filter((c) => catsUsadas.has(c.id)),
    metodos: await getMetodosDisponibles(service, tenantId, configRes.data?.metodos_pago),
  };
}
