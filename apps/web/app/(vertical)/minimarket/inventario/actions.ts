"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  defaultsFiscalesProducto,
  opcionesImpuesto,
  precioDesdeMargen,
} from "@/lib/minimarket/producto-opciones";
import { deltaConSigno } from "@/lib/minimarket/inventario-calc";
import { requirePermisoAccion } from "@/lib/minimarket/permisos";
import { sucursalesPermitidas } from "@/lib/minimarket/sucursal-acceso";
import {
  getTipoPreferido,
  getTodasLasTasas,
  TIPO_TASA_LABEL,
  type TipoTasa,
} from "@/lib/minimarket/exchange-rate";
import {
  normalizarNombre,
  parseFilasCsv,
  parseFilasDesdeLineas,
  type FilaCarga,
} from "@/lib/minimarket/carga-masiva-parse";

const INVENTARIO_PATH = "/minimarket/inventario";
const MOVIMIENTOS_PATH = "/minimarket/inventario/movimientos";

export interface ActionResult {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Solo en `crearProducto`: id del producto recién creado — permite a un
   * llamador (ej. el formulario de compras) agregarlo de inmediato sin
   * tener que recargar ni volver a buscarlo. */
  productoId?: string;
  /** Solo en `crearCategoria`: id/nombre de la categoría recién creada —
   * permite a un llamador (ej. el formulario de producto, alta rápida)
   * seleccionarla de inmediato sin recargar ni volver a buscarla. */
  categoriaId?: string;
  categoriaNombre?: string;
  /** Aviso no bloqueante (ok=true igual) — ej. una sucursal con stock que no
   * se pudo desmarcar como disponible en `actualizarProducto`. */
  aviso?: string;
}

const opcional = (v: FormDataEntryValue | null): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : undefined;
};

/** Separa un campo por un delimitador: limpia, deduplica (case-insensitive) y acota. */
function parseLista(
  raw: FormDataEntryValue | null,
  { sep = ",", maxLen = 40, max = 20 }: { sep?: string; maxLen?: number; max?: number } = {},
): string[] {
  const s = typeof raw === "string" ? raw : "";
  const out: string[] = [];
  for (const part of s.split(sep)) {
    const t = part.trim().slice(0, maxLen);
    if (t && !out.some((e) => e.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

const productoSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio.").max(160),
  codigo: z.string().trim().max(64).optional(),
  categoria_id: z.string().uuid().optional(),
  tipo_venta: z.enum(["unidad", "granel"]),
  unidad: z.string().trim().min(1).max(32),
  costo_usd: z.coerce
    .number({ invalid_type_error: "Costo inválido." })
    .min(0, "El costo no puede ser negativo."),
  precio_usd: z.coerce
    .number({ invalid_type_error: "Precio inválido." })
    .min(0, "El precio no puede ser negativo."),
  impuesto_id: z.string().trim().min(1).max(32),
  aplica_igtf: z.boolean(),
  proveedor_id: z.string().uuid().optional(),
  stock_minimo: z.coerce.number().min(0).optional(),
  stock_inicial: z.coerce.number().min(0).optional(),
  sucursal_id: z.string().uuid().optional(),
  activo: z.boolean(),
  usa_margen_global: z.boolean(),
});

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in out)) out[key] = issue.message;
  }
  return out;
}

/** Resuelve el tenant activo, el cliente Supabase y la configuración de país. */
async function contexto() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id ?? null;
  if (!session || !tenantId) return null;
  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);
  return { supabase, tenantId, userId: session.user.id, country };
}

/** Primera sucursal PERMITIDA del usuario (respaldo cuando no se indica una)
 * — nunca "la primera del tenant": eso dejaría insertar stock en una
 * sucursal ajena al usuario aunque el formulario no la mencione. */
async function primeraSucursal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  profileId: string,
): Promise<string | null> {
  const sucursales = await sucursalesPermitidas(supabase, tenantId, profileId);
  return sucursales[0]?.id ?? null;
}

/** Sucursales PERMITIDAS del usuario (para el desglose de stock por sucursal
 * y para no ofrecer/escribir en sucursales ajenas — la RLS de la migración
 * 0111 también lo bloquearía, esto evita el intento). */
async function listarSucursales(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  profileId: string,
): Promise<{ id: string; nombre: string }[]> {
  return sucursalesPermitidas(supabase, tenantId, profileId);
}

/** true si el checkbox `name` vino marcado en el FormData. */
function marcado(formData: FormData, name: string): boolean {
  const v = formData.get(name);
  return v === "1" || v === "on";
}

/** Número >= 0 de un campo del FormData; 0 si viene vacío o inválido. */
function numeroCampo(formData: FormData, name: string): number {
  const n = Number(String(formData.get(name) ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function aplicarStockMinimo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  productoId: string,
  sucursalId: string,
  stockMinimo: number,
): Promise<void> {
  await supabase.from("mm_inventario").upsert(
    {
      tenant_id: tenantId,
      producto_id: productoId,
      sucursal_id: sucursalId,
      stock_minimo: stockMinimo,
      deleted_at: null,
    },
    { onConflict: "tenant_id,producto_id,sucursal_id" },
  );
}

const MAX_IMAGEN_BYTES = 5 * 1024 * 1024;

interface ImagenResuelta {
  /** True si hay que escribir `imagen_url` (nueva foto o quitada). */
  cambiar: boolean;
  url: string | null;
  error?: string;
}

/**
 * Sube la foto del producto (si viene un archivo) al bucket de Storage del
 * tenant y devuelve su URL pública. Si se marcó quitar, devuelve url=null.
 * Si no hay archivo ni quitar, no cambia nada.
 */
async function resolverImagen(
  ctx: NonNullable<Awaited<ReturnType<typeof contexto>>>,
  formData: FormData,
): Promise<ImagenResuelta> {
  const quitar = formData.get("imagen_remove") === "1";
  const archivo = formData.get("imagen");

  // File extiende Blob; en algunos runtimes el campo llega como Blob sin nombre.
  if (archivo instanceof Blob && archivo.size > 0) {
    const tipo = archivo.type || "";
    if (!tipo.startsWith("image/")) {
      return { cambiar: false, url: null, error: "El archivo debe ser una imagen." };
    }
    if (archivo.size > MAX_IMAGEN_BYTES) {
      return { cambiar: false, url: null, error: "La imagen no debe superar 5 MB." };
    }
    const nombre = archivo instanceof File ? archivo.name : "";
    const ext = (nombre.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const ruta = `${ctx.tenantId}/${crypto.randomUUID()}.${ext}`;

    try {
      const { error } = await ctx.supabase.storage
        .from("productos")
        .upload(ruta, archivo, { contentType: tipo, upsert: false });
      if (error) {
        return {
          cambiar: false,
          url: null,
          error:
            "No se pudo subir la imagen. Verifica que el bucket de Storage esté creado (09_storage_productos.sql).",
        };
      }
      const url = ctx.supabase.storage.from("productos").getPublicUrl(ruta).data.publicUrl;
      return { cambiar: true, url };
    } catch {
      return {
        cambiar: false,
        url: null,
        error: "No se pudo subir la imagen. Inténtalo de nuevo.",
      };
    }
  }

  if (quitar) return { cambiar: true, url: null };
  return { cambiar: false, url: null };
}

/** Datos del formulario de producto comunes a crear y actualizar. */
function parseProducto(ctx: NonNullable<Awaited<ReturnType<typeof contexto>>>, formData: FormData) {
  const parsed = productoSchema.safeParse({
    nombre: formData.get("nombre"),
    codigo: opcional(formData.get("codigo")),
    categoria_id: opcional(formData.get("categoria_id")),
    tipo_venta: opcional(formData.get("tipo_venta")) ?? "unidad",
    unidad: opcional(formData.get("unidad")) ?? "unidad",
    costo_usd: opcional(formData.get("costo_usd")) ?? "0",
    precio_usd: formData.get("precio_usd"),
    impuesto_id: opcional(formData.get("impuesto_id")) ?? "exento",
    aplica_igtf: formData.get("aplica_igtf") === "1" || formData.get("aplica_igtf") === "on",
    proveedor_id: opcional(formData.get("proveedor_id")),
    stock_minimo: opcional(formData.get("stock_minimo")),
    stock_inicial: opcional(formData.get("stock_inicial")),
    sucursal_id: opcional(formData.get("sucursal_id")),
    activo: formData.get("activo") === "1" || formData.get("activo") === "on",
    usa_margen_global:
      formData.get("usa_margen_global") === "1" || formData.get("usa_margen_global") === "on",
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) } as const;

  // El impuesto debe existir en la configuración del país (no inventado por el cliente).
  const permitidos = new Set(opcionesImpuesto(ctx.country).map((o) => o.id));
  if (!permitidos.has(parsed.data.impuesto_id)) {
    return { fieldErrors: { impuesto_id: "Impuesto no válido." } } as const;
  }
  return {
    data: {
      ...parsed.data,
      etiquetas: parseLista(formData.get("etiquetas")),
      codigos: parseLista(formData.get("codigos"), { maxLen: 64, max: 10 }),
    },
  } as const;
}

/** Inserta/borra códigos de barras para que la tabla refleje exactamente `codigos`. */
async function sincronizarCodigos(
  ctx: NonNullable<Awaited<ReturnType<typeof contexto>>>,
  productoId: string,
  codigos: string[],
): Promise<void> {
  const { data: existentes } = await ctx.supabase
    .from("mm_producto_codigos")
    .select("id, codigo")
    .eq("tenant_id", ctx.tenantId)
    .eq("producto_id", productoId);

  const actuales = new Map((existentes ?? []).map((c) => [c.codigo, c.id]));
  const deseados = new Set(codigos);

  const aBorrar = (existentes ?? []).filter((c) => !deseados.has(c.codigo)).map((c) => c.id);
  const aInsertar = codigos.filter((c) => !actuales.has(c));

  if (aBorrar.length > 0) {
    await ctx.supabase.from("mm_producto_codigos").delete().in("id", aBorrar);
  }
  if (aInsertar.length > 0) {
    await ctx.supabase.from("mm_producto_codigos").insert(
      aInsertar.map((codigo) => ({
        tenant_id: ctx.tenantId,
        producto_id: productoId,
        codigo,
      })),
    );
  }
}

/** Crea un producto (precio inicial al histórico, stock mínimo e inicial). */
export async function crearProducto(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida. Vuelve a iniciar sesión." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "inventario",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const res = parseProducto(ctx, formData);
  if ("fieldErrors" in res) return { fieldErrors: res.fieldErrors };
  const v = res.data;

  const imagen = await resolverImagen(ctx, formData);
  if (imagen.error) return { error: imagen.error };

  const { data: producto, error } = await ctx.supabase
    .from("mm_productos")
    .insert({
      tenant_id: ctx.tenantId,
      nombre: v.nombre,
      codigo: v.codigo ?? null,
      codigo_barras: v.codigos[0] ?? null,
      categoria_id: v.categoria_id ?? null,
      tipo_venta: v.tipo_venta,
      unidad: v.unidad,
      costo_usd: v.costo_usd,
      precio_usd: v.precio_usd,
      impuesto_id: v.impuesto_id,
      aplica_igtf: v.aplica_igtf,
      proveedor_id: v.proveedor_id ?? null,
      etiquetas: v.etiquetas,
      activo: v.activo,
      usa_margen_global: v.usa_margen_global,
      imagen_url: imagen.cambiar ? imagen.url : null,
    })
    .select("id")
    .single();

  if (error || !producto) {
    if (error?.code === "23505")
      return { error: "Ya existe un producto con ese código o código de barras." };
    return { error: "No se pudo crear el producto. Inténtalo de nuevo." };
  }

  if (v.codigos.length > 0) await sincronizarCodigos(ctx, producto.id, v.codigos);

  await ctx.supabase.from("mm_precios").insert({
    tenant_id: ctx.tenantId,
    producto_id: producto.id,
    precio_usd: v.precio_usd,
    usuario_id: ctx.userId,
  });

  const sucursales = await listarSucursales(ctx.supabase, ctx.tenantId, ctx.userId);
  if (sucursales.length > 1) {
    for (const s of sucursales) {
      if (!marcado(formData, `disponible_${s.id}`)) continue;
      const stockMinimo = numeroCampo(formData, `stock_minimo_${s.id}`);
      await aplicarStockMinimo(ctx.supabase, ctx.tenantId, producto.id, s.id, stockMinimo);
      const stockInicial = numeroCampo(formData, `stock_inicial_${s.id}`);
      if (stockInicial > 0) {
        await ctx.supabase.from("mm_movimientos_inventario").insert({
          tenant_id: ctx.tenantId,
          producto_id: producto.id,
          sucursal_id: s.id,
          tipo: "entrada",
          cantidad: stockInicial,
          motivo: "Stock inicial",
          usuario_id: ctx.userId,
        });
      }
    }
  } else {
    const sucursalId =
      v.sucursal_id ?? (await primeraSucursal(ctx.supabase, ctx.tenantId, ctx.userId));
    if (sucursalId) {
      if (v.stock_minimo !== undefined) {
        await aplicarStockMinimo(
          ctx.supabase,
          ctx.tenantId,
          producto.id,
          sucursalId,
          v.stock_minimo,
        );
      }
      if (v.stock_inicial !== undefined && v.stock_inicial > 0) {
        await ctx.supabase.from("mm_movimientos_inventario").insert({
          tenant_id: ctx.tenantId,
          producto_id: producto.id,
          sucursal_id: sucursalId,
          tipo: "entrada",
          cantidad: v.stock_inicial,
          motivo: "Stock inicial",
          usuario_id: ctx.userId,
        });
      }
    }
  }

  revalidatePath(INVENTARIO_PATH);
  revalidatePath(MOVIMIENTOS_PATH);
  return { ok: true, productoId: producto.id };
}

/** Actualiza un producto; si cambia el precio, agrega una fila al histórico. */
export async function actualizarProducto(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida. Vuelve a iniciar sesión." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "inventario",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  const id = opcional(formData.get("id"));
  if (!id) return { error: "Producto no identificado." };

  const res = parseProducto(ctx, formData);
  if ("fieldErrors" in res) return { fieldErrors: res.fieldErrors };
  const v = res.data;

  const imagen = await resolverImagen(ctx, formData);
  if (imagen.error) return { error: imagen.error };

  const { data: previo } = await ctx.supabase
    .from("mm_productos")
    .select("precio_usd")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id)
    .maybeSingle();

  const datos: {
    nombre: string;
    codigo: string | null;
    codigo_barras: string | null;
    categoria_id: string | null;
    tipo_venta: "unidad" | "granel";
    unidad: string;
    costo_usd: number;
    precio_usd: number;
    impuesto_id: string;
    aplica_igtf: boolean;
    proveedor_id: string | null;
    etiquetas: string[];
    activo: boolean;
    usa_margen_global: boolean;
    imagen_url?: string | null;
  } = {
    nombre: v.nombre,
    codigo: v.codigo ?? null,
    codigo_barras: v.codigos[0] ?? null,
    categoria_id: v.categoria_id ?? null,
    tipo_venta: v.tipo_venta,
    unidad: v.unidad,
    costo_usd: v.costo_usd,
    precio_usd: v.precio_usd,
    impuesto_id: v.impuesto_id,
    aplica_igtf: v.aplica_igtf,
    proveedor_id: v.proveedor_id ?? null,
    etiquetas: v.etiquetas,
    activo: v.activo,
    usa_margen_global: v.usa_margen_global,
  };
  if (imagen.cambiar) datos.imagen_url = imagen.url;

  const { error } = await ctx.supabase
    .from("mm_productos")
    .update(datos)
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id);

  if (error) {
    if (error.code === "23505")
      return { error: "Ya existe un producto con ese código o código de barras." };
    return { error: "No se pudo guardar el producto. Inténtalo de nuevo." };
  }

  await sincronizarCodigos(ctx, id, v.codigos);

  if (previo && Number(previo.precio_usd) !== v.precio_usd) {
    await ctx.supabase.from("mm_precios").insert({
      tenant_id: ctx.tenantId,
      producto_id: id,
      precio_usd: v.precio_usd,
      usuario_id: ctx.userId,
    });
  }

  const sucursales = await listarSucursales(ctx.supabase, ctx.tenantId, ctx.userId);
  let aviso: string | undefined;
  if (sucursales.length > 1) {
    const [{ data: stockRows }, { data: invRows }] = await Promise.all([
      ctx.supabase
        .from("mm_v_stock")
        .select("sucursal_id, stock_actual")
        .eq("tenant_id", ctx.tenantId)
        .eq("producto_id", id),
      ctx.supabase
        .from("mm_inventario")
        .select("sucursal_id")
        .eq("tenant_id", ctx.tenantId)
        .eq("producto_id", id)
        .is("deleted_at", null),
    ]);
    const stockPorSucursal = new Map(
      (stockRows ?? []).map((r) => [r.sucursal_id, Number(r.stock_actual ?? 0)]),
    );
    const filaViva = new Set((invRows ?? []).map((r) => r.sucursal_id));
    const noQuitadas: string[] = [];

    for (const s of sucursales) {
      if (marcado(formData, `disponible_${s.id}`)) {
        const stockMinimo = numeroCampo(formData, `stock_minimo_${s.id}`);
        await aplicarStockMinimo(ctx.supabase, ctx.tenantId, id, s.id, stockMinimo);
        continue;
      }
      // Desmarcado: solo quita disponibilidad si no tiene stock real — nunca
      // se oculta una sucursal con stock existente.
      if (!filaViva.has(s.id)) continue;
      if ((stockPorSucursal.get(s.id) ?? 0) > 0) {
        noQuitadas.push(s.nombre);
        continue;
      }
      await ctx.supabase
        .from("mm_inventario")
        .update({ deleted_at: new Date().toISOString() })
        .eq("tenant_id", ctx.tenantId)
        .eq("producto_id", id)
        .eq("sucursal_id", s.id);
    }

    if (noQuitadas.length > 0) {
      aviso = `Tiene stock en ${noQuitadas.join(", ")} — ajústalo a 0 desde Movimientos antes de quitarlo de esa sucursal.`;
    }
  } else if (v.stock_minimo !== undefined) {
    const sucursalId =
      v.sucursal_id ?? (await primeraSucursal(ctx.supabase, ctx.tenantId, ctx.userId));
    if (sucursalId) {
      await aplicarStockMinimo(ctx.supabase, ctx.tenantId, id, sucursalId, v.stock_minimo);
    }
  }

  revalidatePath(INVENTARIO_PATH);
  return { ok: true, aviso };
}

/** Edición rápida del precio de venta desde la lista (sin abrir el formulario). */
export async function actualizarPrecioRapido(formData: FormData): Promise<ActionResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "inventario",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  const id = opcional(formData.get("id"));
  if (!id) return { error: "Producto no identificado." };

  const precio = Number(String(formData.get("precio_usd") ?? "").replace(",", "."));
  if (!Number.isFinite(precio) || precio < 0) return { error: "Precio inválido." };

  const { data: previo } = await ctx.supabase
    .from("mm_productos")
    .select("precio_usd")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id)
    .maybeSingle();

  // Edición manual del precio: el producto deja de seguir el margen global
  // (si lo seguía) — igual criterio que editar el precio desde el formulario
  // completo. Un cambio del % global ya no debe volver a tocar este precio.
  const { error } = await ctx.supabase
    .from("mm_productos")
    .update({ precio_usd: precio, usa_margen_global: false })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id);
  if (error) return { error: "No se pudo actualizar el precio." };

  if (previo && Number(previo.precio_usd) !== precio) {
    await ctx.supabase.from("mm_precios").insert({
      tenant_id: ctx.tenantId,
      producto_id: id,
      precio_usd: precio,
      usuario_id: ctx.userId,
    });
  }

  revalidatePath(INVENTARIO_PATH);
  return { ok: true };
}

export interface RecalcularMargenResult extends ActionResult {
  actualizados?: number;
}

/**
 * Recalcula el precio de venta de TODOS los productos marcados
 * `usa_margen_global = true` a partir de su costo actual y el % de margen
 * global vigente (`mm_config_negocio.parametros.margen_global_pct`). Los
 * productos con margen personalizado (`usa_margen_global = false`) NUNCA se
 * tocan aquí — es la contraparte explícita, disparada a mano por el dueño
 * desde Configuración, de "cambiar el % global no reescribe precios solo":
 * el cambio de % por sí solo (`actualizarMargenGlobal`) solo afecta a los
 * productos que se creen DESPUÉS; este botón es el único camino para que los
 * ya existentes que siguen el global adopten el nuevo %.
 */
export async function recalcularProductosMargenGlobal(): Promise<RecalcularMargenResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "inventario",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  const { data: config } = await ctx.supabase
    .from("mm_config_negocio")
    .select("parametros")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  const parametros =
    config?.parametros && typeof config.parametros === "object" && !Array.isArray(config.parametros)
      ? (config.parametros as Record<string, unknown>)
      : {};
  const margenActivo = Boolean(parametros.margen_global_activo);
  const margenPct = Number(parametros.margen_global_pct);
  if (!margenActivo || !Number.isFinite(margenPct)) {
    return { error: "El margen de ganancia global no está activo." };
  }

  const { data: productos, error: errorLista } = await ctx.supabase
    .from("mm_productos")
    .select("id, costo_usd, precio_usd")
    .eq("tenant_id", ctx.tenantId)
    .eq("usa_margen_global", true)
    .is("deleted_at", null);
  if (errorLista) return { error: "No se pudieron leer los productos." };
  if (!productos || productos.length === 0) return { ok: true, actualizados: 0 };

  let actualizados = 0;
  for (const p of productos) {
    const nuevoPrecio = Math.round(precioDesdeMargen(Number(p.costo_usd), margenPct) * 100) / 100;
    if (Math.abs(nuevoPrecio - Number(p.precio_usd)) < 0.005) continue;

    const { error } = await ctx.supabase
      .from("mm_productos")
      .update({ precio_usd: nuevoPrecio })
      .eq("tenant_id", ctx.tenantId)
      .eq("id", p.id);
    if (error) continue;

    await ctx.supabase.from("mm_precios").insert({
      tenant_id: ctx.tenantId,
      producto_id: p.id,
      precio_usd: nuevoPrecio,
      usuario_id: ctx.userId,
    });
    actualizados += 1;
  }

  revalidatePath(INVENTARIO_PATH);
  return { ok: true, actualizados };
}

/** Borrado lógico de un producto (deleted_at). */
export async function eliminarProducto(formData: FormData): Promise<ActionResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "inventario",
    "eliminar",
  );
  if (permisoError) return { error: permisoError };

  const id = opcional(formData.get("id"));
  if (!id) return { error: "Producto no identificado." };

  const { error } = await ctx.supabase
    .from("mm_productos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id);

  if (error) return { error: "No se pudo eliminar el producto." };

  revalidatePath(INVENTARIO_PATH);
  return { ok: true };
}

const categoriaSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio.").max(80),
});

/** Crea una categoría. */
export async function crearCategoria(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "inventario",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const parsed = categoriaSchema.safeParse({ nombre: formData.get("nombre") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { count } = await ctx.supabase
    .from("mm_categorias")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", ctx.tenantId)
    .is("deleted_at", null);

  const { data: categoria, error } = await ctx.supabase
    .from("mm_categorias")
    .insert({
      tenant_id: ctx.tenantId,
      nombre: parsed.data.nombre,
      orden: count ?? 0,
    })
    .select("id, nombre")
    .single();

  if (error || !categoria) return { error: "No se pudo crear la categoría." };

  revalidatePath(INVENTARIO_PATH);
  return { ok: true, categoriaId: categoria.id, categoriaNombre: categoria.nombre };
}

/** Actualiza el nombre de una categoría. */
export async function actualizarCategoria(
  categoriaId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "inventario",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  const parsed = categoriaSchema.safeParse({ nombre: formData.get("nombre") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { error } = await ctx.supabase
    .from("mm_categorias")
    .update({ nombre: parsed.data.nombre })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", categoriaId);

  if (error) return { error: "No se pudo actualizar la categoría." };

  revalidatePath(INVENTARIO_PATH);
  revalidatePath("/minimarket/inventario/categorias");
  return { ok: true };
}

/** Soft-delete de una categoría (solo si no tiene productos activos asociados). */
export async function eliminarCategoria(formData: FormData): Promise<ActionResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "inventario",
    "eliminar",
  );
  if (permisoError) return { error: permisoError };

  const id = opcional(formData.get("id"));
  if (!id) return { error: "Categoría no identificada." };

  const { count } = await ctx.supabase
    .from("mm_productos")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", ctx.tenantId)
    .eq("categoria_id", id)
    .is("deleted_at", null);

  if ((count ?? 0) > 0) {
    return {
      error: `Esta categoría tiene ${count} producto${count !== 1 ? "s" : ""} activo${count !== 1 ? "s" : ""}. Reasígnalos antes de eliminar.`,
    };
  }

  const { error } = await ctx.supabase
    .from("mm_categorias")
    .update({ deleted_at: new Date().toISOString() })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id);

  if (error) return { error: "No se pudo eliminar la categoría." };

  revalidatePath(INVENTARIO_PATH);
  revalidatePath("/minimarket/inventario/categorias");
  return { ok: true };
}

// ============================ Movimientos de inventario ======================

const movimientoSchema = z.object({
  producto_id: z.string().uuid(),
  sucursal_id: z.string().uuid().optional(),
  tipo: z.enum(["entrada", "salida", "ajuste", "merma"]),
  cantidad: z.coerce
    .number({ invalid_type_error: "Cantidad inválida." })
    .refine((n) => n !== 0, "La cantidad no puede ser cero."),
  motivo: z.string().trim().max(200).optional(),
});

/** Registra un movimiento en el ledger append-only (mueve el stock derivado). */
export async function registrarMovimiento(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "inventario",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const parsed = movimientoSchema.safeParse({
    producto_id: opcional(formData.get("producto_id")),
    sucursal_id: opcional(formData.get("sucursal_id")),
    tipo: opcional(formData.get("tipo")),
    cantidad: formData.get("cantidad"),
    motivo: opcional(formData.get("motivo")),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  const sucursalId =
    v.sucursal_id ?? (await primeraSucursal(ctx.supabase, ctx.tenantId, ctx.userId));
  if (!sucursalId) return { error: "No hay una sucursal configurada." };

  const { error } = await ctx.supabase.from("mm_movimientos_inventario").insert({
    tenant_id: ctx.tenantId,
    producto_id: v.producto_id,
    sucursal_id: sucursalId,
    tipo: v.tipo,
    cantidad: deltaConSigno(v.tipo, v.cantidad),
    motivo: v.motivo ?? null,
    usuario_id: ctx.userId,
  });

  if (error) return { error: "No se pudo registrar el movimiento. Inténtalo de nuevo." };

  revalidatePath(INVENTARIO_PATH);
  revalidatePath(MOVIMIENTOS_PATH);
  return { ok: true };
}

// ================================ Carga masiva ===============================

/** Resultado de procesar UN lote de `cargaMasivaLote` (no el archivo completo). */
export interface LoteCargaResult {
  ok?: boolean;
  error?: string;
  creados?: number;
  actualizados?: number;
  omitidos?: number;
  errores?: { linea: number; motivo: string }[];
}

/** Qué hacer con una fila cuyo producto ya existe en el inventario. */
export type AccionDuplicado = "omitir" | "actualizar";
export type ResolucionesCarga = Record<string, { accion: AccionDuplicado; productoId?: string }>;

export interface FilaPreview {
  linea: number;
  nombre: string;
  sku: string;
  categoria: string;
  precio_usd: number;
  /** true si precio_usd se calculó desde costo_usd + margen_pct (la celda venía vacía). */
  precio_calculado?: boolean;
  /** Referencia en Bs con la tasa de la fila (o la del negocio si no se indicó); null si esa tasa aún no está registrada. */
  precio_bs?: number | null;
  tasa_tipo?: TipoTasa;
  estado: "nuevo" | "error" | "duplicado";
  motivo?: string;
  duplicado_id?: string;
  categoria_nueva?: boolean;
  /** Avisos no bloqueantes (margen que no cuadra, tasa no reconocida, etc.). */
  notas?: string[];
}

export interface PreviewCargaResult {
  ok?: boolean;
  error?: string;
  filas?: FilaPreview[];
  resumen?: {
    total: number;
    nuevos: number;
    errores: number;
    duplicados: number;
    /** Nombres (tal como vienen en el Excel) de las categorías que se crearán al confirmar. */
    categoriasNuevas: string[];
  };
}

/**
 * Valida el CSV y detecta duplicados contra el inventario actual (por SKU,
 * código de barras o nombre) SIN escribir nada en la base de datos. También
 * calcula, solo para mostrar en la vista previa, el precio de referencia en
 * Bs con la tasa pedida en cada fila (o la preferida del negocio) — esto es
 * puramente informativo: el producto siempre se guarda en USD, el Bs jamás
 * se persiste en `mm_productos`, igual que en el resto del sistema.
 */
export async function previsualizarCargaMasiva(csv: string): Promise<PreviewCargaResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "inventario",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const { filas, errorGeneral } = parseFilasCsv(csv);
  if (errorGeneral) return { error: errorGeneral };

  const [{ data: catData }, { data: prodData }, { data: codData }, tipoPreferido, todasLasTasas] =
    await Promise.all([
      ctx.supabase
        .from("mm_categorias")
        .select("nombre")
        .eq("tenant_id", ctx.tenantId)
        .is("deleted_at", null),
      ctx.supabase
        .from("mm_productos")
        .select("id, nombre, codigo, codigo_barras")
        .eq("tenant_id", ctx.tenantId)
        .is("deleted_at", null),
      ctx.supabase
        .from("mm_producto_codigos")
        .select("producto_id, codigo")
        .eq("tenant_id", ctx.tenantId),
      getTipoPreferido(ctx.supabase, ctx.tenantId),
      getTodasLasTasas(ctx.supabase, ctx.tenantId),
    ]);

  const categoriasExistentes = new Set((catData ?? []).map((c) => normalizarNombre(c.nombre)));
  const porNombre = new Map<string, string>();
  const porCodigo = new Map<string, string>();
  const porBarras = new Map<string, string>();
  for (const p of prodData ?? []) {
    porNombre.set(normalizarNombre(p.nombre), p.id);
    if (p.codigo) porCodigo.set(normalizarNombre(p.codigo), p.id);
    if (p.codigo_barras) porBarras.set(p.codigo_barras, p.id);
  }
  for (const c of codData ?? []) {
    porBarras.set(c.codigo, c.producto_id);
  }

  const resultado: FilaPreview[] = [];
  const categoriasNuevas = new Map<string, string>(); // clave normalizada -> nombre tal como viene
  let nuevos = 0;
  let errores = 0;
  let duplicados = 0;

  for (const f of filas) {
    const tipoTasaFila = f.tasaTipo ?? tipoPreferido;
    const tasaVigente = todasLasTasas[tipoTasaFila];
    const notas = [...f.notas];
    if (!tasaVigente) {
      notas.push(
        `Aún no hay una tasa ${TIPO_TASA_LABEL[tipoTasaFila]} registrada; no se pudo calcular el Bs de referencia.`,
      );
    }

    const base = {
      linea: f.linea,
      nombre: f.nombre,
      sku: f.sku,
      categoria: f.categoriaNombre,
      precio_usd: f.precio,
      precio_calculado: f.precioCalculado,
      precio_bs:
        Number.isFinite(f.precio) && tasaVigente
          ? Math.round(f.precio * tasaVigente.valor * 100) / 100
          : null,
      tasa_tipo: tipoTasaFila,
    };

    if (f.errorFormato) {
      errores += 1;
      resultado.push({ ...base, estado: "error", motivo: f.errorFormato, notas });
      continue;
    }

    let duplicadoId: string | undefined;
    let motivo: string | undefined;
    const skuClave = f.sku ? normalizarNombre(f.sku) : "";
    if (skuClave && porCodigo.has(skuClave)) {
      duplicadoId = porCodigo.get(skuClave);
      motivo = "Ya existe un producto con ese SKU.";
    }
    if (!duplicadoId) {
      for (const cod of f.codigos) {
        const match = porBarras.get(cod);
        if (match) {
          duplicadoId = match;
          motivo = "Ya existe un producto con ese código de barras.";
          break;
        }
      }
    }
    const nombreClave = normalizarNombre(f.nombre);
    if (!duplicadoId && porNombre.has(nombreClave)) {
      duplicadoId = porNombre.get(nombreClave);
      motivo = "Ya existe un producto con ese nombre.";
    }

    const categoriaClave = f.categoriaNombre ? normalizarNombre(f.categoriaNombre) : "";
    const categoriaNueva = categoriaClave.length > 0 && !categoriasExistentes.has(categoriaClave);
    if (categoriaNueva && !categoriasNuevas.has(categoriaClave)) {
      categoriasNuevas.set(categoriaClave, f.categoriaNombre);
    }

    if (duplicadoId) {
      duplicados += 1;
      resultado.push({
        ...base,
        estado: "duplicado",
        motivo,
        duplicado_id: duplicadoId,
        categoria_nueva: categoriaNueva,
        notas,
      });
    } else {
      nuevos += 1;
      resultado.push({ ...base, estado: "nuevo", categoria_nueva: categoriaNueva, notas });
    }
  }

  return {
    ok: true,
    filas: resultado,
    resumen: {
      total: filas.length,
      nuevos,
      errores,
      duplicados,
      categoriasNuevas: Array.from(categoriasNuevas.values()),
    },
  };
}

/** Producto nuevo listo para insertar en batch, junto con la fila de origen (para
 * volver a asociar el id devuelto por Supabase a sus filas dependientes: precio,
 * códigos, stock). */
interface FilaNuevaResuelta {
  fila: FilaCarga;
  row: {
    tenant_id: string;
    nombre: string;
    codigo: string | null;
    codigo_barras: string | null;
    categoria_id: string | null;
    tipo_venta: "unidad" | "granel";
    unidad: string;
    costo_usd: number;
    precio_usd: number;
    impuesto_id: string;
    aplica_igtf: boolean;
    proveedor_id: string | null;
    etiquetas: string[];
  };
}

/**
 * Inserta los productos nuevos de `filas` en UNA sola llamada batch (en vez de
 * un insert por fila) — es la clave para que un lote de 100-250 filas se
 * resuelva en un puñado de round-trips a Supabase y no en cientos. Si el
 * insert batch falla (p. ej. un choque de código/código de barras EN MEDIO del
 * lote hace fallar el INSERT completo), reintenta fila por fila SOLO para ese
 * lote, así se identifica cuál(es) filas fallaron sin perder el resto.
 */
async function insertarProductosNuevos(
  ctx: NonNullable<Awaited<ReturnType<typeof contexto>>>,
  nuevas: FilaNuevaResuelta[],
  errores: { linea: number; motivo: string }[],
): Promise<{ fila: FilaCarga; id: string }[]> {
  if (nuevas.length === 0) return [];

  const { data, error } = await ctx.supabase
    .from("mm_productos")
    .insert(nuevas.map((n) => n.row))
    .select("id");

  // El orden de las filas devueltas por un INSERT ... VALUES (...), (...) ...
  // RETURNING de Postgres sigue el orden de los VALUES de entrada (no hay
  // paralelismo dentro de un único INSERT) — es el mismo supuesto en el que
  // se apoya el resto del ecosistema Supabase/PostgREST para mapear ids de
  // vuelta a un insert masivo.
  if (!error && data && data.length === nuevas.length) {
    const creadas: { fila: FilaCarga; id: string }[] = [];
    for (let i = 0; i < nuevas.length; i++) {
      const n = nuevas[i];
      const p = data[i];
      if (!n || !p) continue;
      creadas.push({ fila: n.fila, id: p.id as string });
    }
    return creadas;
  }

  // El batch completo falló (o devolvió un conteo inesperado): se reintenta
  // fila por fila SOLO dentro de este lote para no perder las que sí sirven.
  const creadas: { fila: FilaCarga; id: string }[] = [];
  for (const n of nuevas) {
    const { data: producto, error: errorFila } = await ctx.supabase
      .from("mm_productos")
      .insert(n.row)
      .select("id")
      .single();
    if (errorFila || !producto) {
      errores.push({
        linea: n.fila.linea,
        motivo:
          errorFila?.code === "23505"
            ? "Código o código de barras duplicado."
            : "No se pudo crear.",
      });
      continue;
    }
    creadas.push({ fila: n.fila, id: producto.id });
  }
  return creadas;
}

/** Inserta en batch los registros dependientes (precio, códigos, stock) de los
 * productos recién creados — igual que `insertarProductosNuevos`, cambia N
 * round-trips secuenciales por un puñado de inserts de array completo. */
async function insertarDependientesProductosNuevos(
  ctx: NonNullable<Awaited<ReturnType<typeof contexto>>>,
  creadas: { fila: FilaCarga; id: string }[],
  sucursalId: string | null,
): Promise<void> {
  if (creadas.length === 0) return;

  await ctx.supabase.from("mm_precios").insert(
    creadas.map(({ fila, id }) => ({
      tenant_id: ctx.tenantId,
      producto_id: id,
      precio_usd: fila.precio,
      usuario_id: ctx.userId,
    })),
  );

  const codigos = creadas.flatMap(({ fila, id }) =>
    fila.codigos.map((codigo) => ({ tenant_id: ctx.tenantId, producto_id: id, codigo })),
  );
  if (codigos.length > 0) await ctx.supabase.from("mm_producto_codigos").insert(codigos);

  if (sucursalId) {
    const stockMin = creadas
      .filter(({ fila }) => fila.stockMinimo > 0)
      .map(({ fila, id }) => ({
        tenant_id: ctx.tenantId,
        producto_id: id,
        sucursal_id: sucursalId,
        stock_minimo: fila.stockMinimo,
        deleted_at: null,
      }));
    if (stockMin.length > 0) {
      await ctx.supabase
        .from("mm_inventario")
        .upsert(stockMin, { onConflict: "tenant_id,producto_id,sucursal_id" });
    }

    const movimientos = creadas
      .filter(({ fila }) => Number.isFinite(fila.stockInicial) && fila.stockInicial > 0)
      .map(({ fila, id }) => ({
        tenant_id: ctx.tenantId,
        producto_id: id,
        sucursal_id: sucursalId,
        tipo: "entrada" as const,
        cantidad: fila.stockInicial,
        motivo: "Carga masiva",
        usuario_id: ctx.userId,
      }));
    if (movimientos.length > 0) {
      await ctx.supabase.from("mm_movimientos_inventario").insert(movimientos);
    }
  }
}

/**
 * Procesa UN LOTE (subconjunto de filas, ver `LOTE_TAMANO`) de la carga masiva
 * de productos. El cliente trocea el CSV completo en lotes y llama esta acción
 * una vez por lote — así cada llamada es corta (segundos, no minutos) y no
 * choca con el timeout de la función serverless en Netlify, además de dar pie
 * a una barra de progreso real. `lineaInicio` es el número de línea (sobre el
 * archivo sin cabecera) de `lineas[0]`, para que los errores reporten el
 * número de fila del archivo original y no el índice dentro del lote.
 *
 * Los productos NUEVOS se insertan en batch (ver `insertarProductosNuevos`);
 * las filas marcadas "actualizar" (duplicado resuelto por el usuario en la
 * vista previa) se procesan una por una, igual que antes — es un subconjunto
 * normalmente pequeño del archivo, así que no es el cuello de botella.
 */
export async function cargaMasivaLote(
  lineas: string[],
  lineaInicio: number,
  resolucionesJson: string,
): Promise<LoteCargaResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "inventario",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const filas = parseFilasDesdeLineas(lineas, lineaInicio);

  let resoluciones: ResolucionesCarga = {};
  if (resolucionesJson.trim()) {
    try {
      const parsed = JSON.parse(resolucionesJson) as unknown;
      if (parsed && typeof parsed === "object") resoluciones = parsed as ResolucionesCarga;
    } catch {
      // JSON de resoluciones corrupto: se ignora y todas las filas se tratan como nuevas.
    }
  }

  const [{ data: catData }, { data: provData }, { data: configData }] = await Promise.all([
    ctx.supabase
      .from("mm_categorias")
      .select("id, nombre")
      .eq("tenant_id", ctx.tenantId)
      .is("deleted_at", null),
    ctx.supabase
      .from("mm_proveedores")
      .select("id, nombre")
      .eq("tenant_id", ctx.tenantId)
      .is("deleted_at", null),
    ctx.supabase
      .from("mm_config_negocio")
      .select("parametros")
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle(),
  ]);
  const categorias = new Map<string, string>(
    (catData ?? []).map((c) => [normalizarNombre(c.nombre), c.id]),
  );
  const proveedores = new Map<string, string>(
    (provData ?? []).map((p) => [normalizarNombre(p.nombre), p.id]),
  );

  const impuestosValidos = new Set(opcionesImpuesto(ctx.country).map((o) => o.id));
  const paramsNegocio = (configData?.parametros as Record<string, unknown>) ?? {};
  const defaultsFiscales = defaultsFiscalesProducto(ctx.country, {
    ivaActivo: Boolean(paramsNegocio.iva_activo ?? false),
    igtfActivo: paramsNegocio.igtf_activo !== false,
  });
  const sucursalId = await primeraSucursal(ctx.supabase, ctx.tenantId, ctx.userId);

  const errores: { linea: number; motivo: string }[] = [];
  let actualizados = 0;
  let omitidos = 0;
  const nuevas: FilaNuevaResuelta[] = [];

  for (const f of filas) {
    const nLinea = f.linea;

    if (f.errorFormato) {
      errores.push({ linea: nLinea, motivo: f.errorFormato });
      continue;
    }

    const resolucion = resoluciones[String(nLinea)];
    if (resolucion?.accion === "omitir") {
      omitidos += 1;
      continue;
    }

    const impuestoId = impuestosValidos.has(f.impuesto) ? f.impuesto : defaultsFiscales.impuestoId;
    const aplicaIgtf = f.aplicaIgtf ?? defaultsFiscales.aplicaIgtf;

    // Categoría: crear si no existe.
    let categoriaId: string | null = null;
    if (f.categoriaNombre) {
      const key = normalizarNombre(f.categoriaNombre);
      categoriaId = categorias.get(key) ?? null;
      if (!categoriaId) {
        const { data: nuevaCat } = await ctx.supabase
          .from("mm_categorias")
          .insert({ tenant_id: ctx.tenantId, nombre: f.categoriaNombre, orden: categorias.size })
          .select("id")
          .single();
        if (nuevaCat) {
          categoriaId = nuevaCat.id;
          categorias.set(key, nuevaCat.id);
        }
      }
    }

    // Proveedor: crear si no existe.
    let proveedorId: string | null = null;
    if (f.proveedorNombre) {
      const key = normalizarNombre(f.proveedorNombre);
      proveedorId = proveedores.get(key) ?? null;
      if (!proveedorId) {
        const { data: nuevoProv } = await ctx.supabase
          .from("mm_proveedores")
          .insert({ tenant_id: ctx.tenantId, nombre: f.proveedorNombre })
          .select("id")
          .single();
        if (nuevoProv) {
          proveedorId = nuevoProv.id;
          proveedores.set(key, nuevoProv.id);
        }
      }
    }

    if (resolucion?.accion === "actualizar" && resolucion.productoId) {
      const { data: previo } = await ctx.supabase
        .from("mm_productos")
        .select("precio_usd")
        .eq("tenant_id", ctx.tenantId)
        .eq("id", resolucion.productoId)
        .maybeSingle();

      const { error } = await ctx.supabase
        .from("mm_productos")
        .update({
          codigo: f.sku || null,
          codigo_barras: f.codigos[0] ?? null,
          categoria_id: categoriaId,
          tipo_venta: f.tipoVenta,
          unidad: f.unidad,
          costo_usd: f.costo >= 0 ? f.costo : 0,
          precio_usd: f.precio,
          impuesto_id: impuestoId,
          aplica_igtf: aplicaIgtf,
          proveedor_id: proveedorId,
          etiquetas: f.etiquetas,
        })
        .eq("tenant_id", ctx.tenantId)
        .eq("id", resolucion.productoId);

      if (error) {
        errores.push({
          linea: nLinea,
          motivo:
            error.code === "23505"
              ? "Código o código de barras duplicado."
              : "No se pudo actualizar.",
        });
        continue;
      }

      if (f.codigos.length > 0) await sincronizarCodigos(ctx, resolucion.productoId, f.codigos);

      if (!previo || Number(previo.precio_usd) !== f.precio) {
        await ctx.supabase.from("mm_precios").insert({
          tenant_id: ctx.tenantId,
          producto_id: resolucion.productoId,
          precio_usd: f.precio,
          usuario_id: ctx.userId,
        });
      }

      if (sucursalId && f.stockMinimo > 0) {
        await aplicarStockMinimo(
          ctx.supabase,
          ctx.tenantId,
          resolucion.productoId,
          sucursalId,
          f.stockMinimo,
        );
      }

      actualizados += 1;
      continue;
    }

    nuevas.push({
      fila: f,
      row: {
        tenant_id: ctx.tenantId,
        nombre: f.nombre,
        codigo: f.sku || null,
        codigo_barras: f.codigos[0] ?? null,
        categoria_id: categoriaId,
        tipo_venta: f.tipoVenta,
        unidad: f.unidad,
        costo_usd: f.costo >= 0 ? f.costo : 0,
        precio_usd: f.precio,
        impuesto_id: impuestoId,
        aplica_igtf: aplicaIgtf,
        proveedor_id: proveedorId,
        etiquetas: f.etiquetas,
      },
    });
  }

  const creadas = await insertarProductosNuevos(ctx, nuevas, errores);
  await insertarDependientesProductosNuevos(ctx, creadas, sucursalId);

  revalidatePath(INVENTARIO_PATH);
  revalidatePath(MOVIMIENTOS_PATH);
  return { ok: true, creados: creadas.length, actualizados, omitidos, errores };
}
