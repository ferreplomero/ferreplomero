"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateConfigId, guardarLogoNegocio } from "@/lib/minimarket/config-negocio";
import { METODOS_PAGO_IDS } from "@/lib/minimarket/metodos-pago";

const CONFIG_PATH = "/minimarket/configuracion";

export interface ConfigResult {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function contexto() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id ?? null;
  if (!session || !tenantId) return null;
  const supabase = await createClient();
  return { supabase, tenantId, userId: session.user.id };
}

const negocioSchema = z.object({
  nombre_comercial: z.string().trim().min(1, "El nombre es obligatorio.").max(160),
  rif: z.string().trim().max(20).optional(),
  direccion: z.string().trim().max(400).optional(),
  telefono: z.string().trim().max(30).optional(),
  timezone: z.string().trim().min(1).max(64).default("America/Caracas"),
});

const parametrosSchema = z.object({
  igtf_pct: z.coerce.number().min(0).max(100),
  iva_pct: z.coerce.number().min(0).max(100),
  redondeo_bs: z.coerce.number().min(0).max(100),
  moneda_base: z.enum(["USD", "VES"]),
  precio_minorista_incluye_igtf: z.boolean(),
  igtf_activo: z.boolean(),
  iva_activo: z.boolean(),
});

const margenGlobalSchema = z.object({
  margen_global_activo: z.boolean(),
  margen_global_pct: z.coerce.number().min(0, "El margen no puede ser negativo.").max(1000),
});

const encabezadoReciboSchema = z.object({
  mostrar_encabezado_recibo: z.boolean(),
});

const leyendaReciboSchema = z.object({
  mostrar_leyenda_no_fiscal: z.boolean(),
});

const botonWhatsappReciboSchema = z.object({
  mostrar_boton_whatsapp_recibo: z.boolean(),
});

function fieldErr(e: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of e.issues) {
    const k = issue.path[0];
    if (typeof k === "string" && !(k in out)) out[k] = issue.message;
  }
  return out;
}

/** Actualiza los datos principales del negocio. */
export async function actualizarNegocio(
  _prev: ConfigResult,
  formData: FormData,
): Promise<ConfigResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };

  const raw = {
    nombre_comercial: formData.get("nombre_comercial"),
    rif: (formData.get("rif") as string | null)?.trim() || undefined,
    direccion: (formData.get("direccion") as string | null)?.trim() || undefined,
    telefono: (formData.get("telefono") as string | null)?.trim() || undefined,
    timezone: (formData.get("timezone") as string | null)?.trim() || "America/Caracas",
  };
  const parsed = negocioSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErr(parsed.error) };

  const id = await getOrCreateConfigId(ctx);
  if (!id) return { error: "No se pudo acceder a la configuración." };

  const { data: configActual } = await ctx.supabase
    .from("mm_config_negocio")
    .select("parametros")
    .eq("id", id)
    .single();
  const parametrosActuales =
    configActual?.parametros &&
    typeof configActual.parametros === "object" &&
    !Array.isArray(configActual.parametros)
      ? (configActual.parametros as Record<string, unknown>)
      : {};

  const { error } = await ctx.supabase
    .from("mm_config_negocio")
    .update({
      nombre_comercial: parsed.data.nombre_comercial,
      rif: parsed.data.rif ?? null,
      direccion: parsed.data.direccion ?? null,
      parametros: {
        ...parametrosActuales,
        timezone: parsed.data.timezone,
        ...(parsed.data.telefono !== undefined ? { telefono: parsed.data.telefono } : {}),
      },
    })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id);

  if (error) return { error: "No se pudo guardar la configuración." };

  revalidatePath(CONFIG_PATH);
  revalidatePath("/minimarket");
  return { ok: true };
}

/** Actualiza los parámetros fiscales y de redondeo. */
export async function actualizarParametros(
  _prev: ConfigResult,
  formData: FormData,
): Promise<ConfigResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };

  const parsed = parametrosSchema.safeParse({
    igtf_pct: formData.get("igtf_pct"),
    iva_pct: formData.get("iva_pct"),
    redondeo_bs: formData.get("redondeo_bs"),
    moneda_base: formData.get("moneda_base") ?? "USD",
    precio_minorista_incluye_igtf: formData.get("precio_minorista_incluye_igtf") === "1",
    igtf_activo: formData.get("igtf_activo") === "1",
    iva_activo: formData.get("iva_activo") === "1",
  });
  if (!parsed.success) return { fieldErrors: fieldErr(parsed.error) };

  const id = await getOrCreateConfigId(ctx);
  if (!id) return { error: "No se pudo acceder a la configuración." };

  const { data: configActual } = await ctx.supabase
    .from("mm_config_negocio")
    .select("parametros")
    .eq("id", id)
    .single();
  const parametrosActuales =
    configActual?.parametros &&
    typeof configActual.parametros === "object" &&
    !Array.isArray(configActual.parametros)
      ? (configActual.parametros as Record<string, unknown>)
      : {};

  const { error } = await ctx.supabase
    .from("mm_config_negocio")
    .update({
      parametros: {
        ...parametrosActuales,
        igtf_pct: parsed.data.igtf_pct,
        iva_pct: parsed.data.iva_pct,
        redondeo_bs: parsed.data.redondeo_bs,
        moneda_base: parsed.data.moneda_base,
        precio_minorista_incluye_igtf: parsed.data.precio_minorista_incluye_igtf,
        igtf_activo: parsed.data.igtf_activo,
        iva_activo: parsed.data.iva_activo,
      },
    })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id);

  if (error) return { error: "No se pudo guardar los parámetros." };

  revalidatePath(CONFIG_PATH);
  return { ok: true };
}

/**
 * Activa/desactiva el margen de ganancia global y fija su %. Este cambio por
 * sí solo NO reescribe el precio de ningún producto existente — solo pasa a
 * ser el valor sugerido para productos NUEVOS y para los que ya siguen el
 * global la próxima vez que se recalculen a mano ("Recalcular productos con
 * margen global", `recalcularProductosMargenGlobal` en
 * `inventario/actions.ts`). Los productos con margen personalizado nunca se
 * tocan, ni aquí ni ahí.
 */
export async function actualizarMargenGlobal(
  _prev: ConfigResult,
  formData: FormData,
): Promise<ConfigResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };

  const parsed = margenGlobalSchema.safeParse({
    margen_global_activo: formData.get("margen_global_activo") === "1",
    margen_global_pct: formData.get("margen_global_pct"),
  });
  if (!parsed.success) return { fieldErrors: fieldErr(parsed.error) };

  const id = await getOrCreateConfigId(ctx);
  if (!id) return { error: "No se pudo acceder a la configuración." };

  const { data: configActual } = await ctx.supabase
    .from("mm_config_negocio")
    .select("parametros")
    .eq("id", id)
    .single();
  const parametrosActuales =
    configActual?.parametros &&
    typeof configActual.parametros === "object" &&
    !Array.isArray(configActual.parametros)
      ? (configActual.parametros as Record<string, unknown>)
      : {};

  const { error } = await ctx.supabase
    .from("mm_config_negocio")
    .update({
      parametros: {
        ...parametrosActuales,
        margen_global_activo: parsed.data.margen_global_activo,
        margen_global_pct: parsed.data.margen_global_pct,
      },
    })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id);

  if (error) return { error: "No se pudo guardar el margen global." };

  revalidatePath(CONFIG_PATH);
  revalidatePath("/minimarket/inventario");
  return { ok: true };
}

/**
 * Activa/desactiva el bloque de encabezado (nombre, RIF, dirección, logo) en
 * los recibos de venta. Desactivado, el recibo solo muestra los datos de la
 * venta y del cliente — la leyenda "comprobante interno, no es factura
 * fiscal" se mantiene siempre, independientemente de este ajuste.
 */
export async function actualizarEncabezadoRecibo(
  _prev: ConfigResult,
  formData: FormData,
): Promise<ConfigResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };

  const parsed = encabezadoReciboSchema.safeParse({
    mostrar_encabezado_recibo: formData.get("mostrar_encabezado_recibo") === "1",
  });
  if (!parsed.success) return { fieldErrors: fieldErr(parsed.error) };

  const id = await getOrCreateConfigId(ctx);
  if (!id) return { error: "No se pudo acceder a la configuración." };

  const { data: configActual } = await ctx.supabase
    .from("mm_config_negocio")
    .select("parametros")
    .eq("id", id)
    .single();
  const parametrosActuales =
    configActual?.parametros &&
    typeof configActual.parametros === "object" &&
    !Array.isArray(configActual.parametros)
      ? (configActual.parametros as Record<string, unknown>)
      : {};

  const { error } = await ctx.supabase
    .from("mm_config_negocio")
    .update({
      parametros: {
        ...parametrosActuales,
        mostrar_encabezado_recibo: parsed.data.mostrar_encabezado_recibo,
      },
    })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id);

  if (error) return { error: "No se pudo guardar el ajuste del recibo." };

  revalidatePath(CONFIG_PATH);
  revalidatePath("/minimarket/ventas");
  return { ok: true };
}

/**
 * Activa/desactiva la leyenda "Comprobante interno de venta — no es una
 * factura fiscal" en los recibos. Activada por defecto (regla permanente de
 * cumplimiento fiscal, ver CLAUDE.md). Desactivarla es una decisión del
 * dueño del negocio, con advertencia legal explícita en la UI antes de
 * confirmar — la responsabilidad de esa elección queda de su lado.
 */
export async function actualizarLeyendaRecibo(
  _prev: ConfigResult,
  formData: FormData,
): Promise<ConfigResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };

  const parsed = leyendaReciboSchema.safeParse({
    mostrar_leyenda_no_fiscal: formData.get("mostrar_leyenda_no_fiscal") === "1",
  });
  if (!parsed.success) return { fieldErrors: fieldErr(parsed.error) };

  const id = await getOrCreateConfigId(ctx);
  if (!id) return { error: "No se pudo acceder a la configuración." };

  const { data: configActual } = await ctx.supabase
    .from("mm_config_negocio")
    .select("parametros")
    .eq("id", id)
    .single();
  const parametrosActuales =
    configActual?.parametros &&
    typeof configActual.parametros === "object" &&
    !Array.isArray(configActual.parametros)
      ? (configActual.parametros as Record<string, unknown>)
      : {};

  const { error } = await ctx.supabase
    .from("mm_config_negocio")
    .update({
      parametros: {
        ...parametrosActuales,
        mostrar_leyenda_no_fiscal: parsed.data.mostrar_leyenda_no_fiscal,
      },
    })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id);

  if (error) return { error: "No se pudo guardar el ajuste de la leyenda." };

  revalidatePath(CONFIG_PATH);
  revalidatePath("/minimarket/ventas");
  return { ok: true };
}

/**
 * Activa/desactiva el botón "Enviar recibo por WhatsApp" en los recibos de
 * venta. Activado por defecto — el dueño puede desactivarlo si no lo quiere.
 */
export async function actualizarBotonWhatsappRecibo(
  _prev: ConfigResult,
  formData: FormData,
): Promise<ConfigResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };

  const parsed = botonWhatsappReciboSchema.safeParse({
    mostrar_boton_whatsapp_recibo: formData.get("mostrar_boton_whatsapp_recibo") === "1",
  });
  if (!parsed.success) return { fieldErrors: fieldErr(parsed.error) };

  const id = await getOrCreateConfigId(ctx);
  if (!id) return { error: "No se pudo acceder a la configuración." };

  const { data: configActual } = await ctx.supabase
    .from("mm_config_negocio")
    .select("parametros")
    .eq("id", id)
    .single();
  const parametrosActuales =
    configActual?.parametros &&
    typeof configActual.parametros === "object" &&
    !Array.isArray(configActual.parametros)
      ? (configActual.parametros as Record<string, unknown>)
      : {};

  const { error } = await ctx.supabase
    .from("mm_config_negocio")
    .update({
      parametros: {
        ...parametrosActuales,
        mostrar_boton_whatsapp_recibo: parsed.data.mostrar_boton_whatsapp_recibo,
      },
    })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id);

  if (error) return { error: "No se pudo guardar el ajuste del botón de WhatsApp." };

  revalidatePath(CONFIG_PATH);
  revalidatePath("/minimarket/ventas");
  return { ok: true };
}

const sucursalSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio.").max(120),
  direccion: z.string().trim().max(400).optional(),
  telefono: z.string().trim().max(30).optional(),
});

/** Crea una sucursal. */
export async function crearSucursal(
  _prev: ConfigResult,
  formData: FormData,
): Promise<ConfigResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };

  const parsed = sucursalSchema.safeParse({
    nombre: formData.get("nombre"),
    direccion: (formData.get("direccion") as string | null)?.trim() || undefined,
    telefono: (formData.get("telefono") as string | null)?.trim() || undefined,
  });
  if (!parsed.success) return { fieldErrors: fieldErr(parsed.error) };

  const { error } = await ctx.supabase.from("mm_sucursales").insert({
    tenant_id: ctx.tenantId,
    nombre: parsed.data.nombre,
    direccion: parsed.data.direccion ?? null,
    telefono: parsed.data.telefono ?? null,
  });

  if (error) return { error: "No se pudo crear la sucursal." };

  revalidatePath(CONFIG_PATH);
  return { ok: true };
}

/** Actualiza los datos de una sucursal. */
export async function actualizarSucursal(
  sucursalId: string,
  _prev: ConfigResult,
  formData: FormData,
): Promise<ConfigResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };

  const parsed = sucursalSchema.safeParse({
    nombre: formData.get("nombre"),
    direccion: (formData.get("direccion") as string | null)?.trim() || undefined,
    telefono: (formData.get("telefono") as string | null)?.trim() || undefined,
  });
  if (!parsed.success) return { fieldErrors: fieldErr(parsed.error) };

  const { error } = await ctx.supabase
    .from("mm_sucursales")
    .update({
      nombre: parsed.data.nombre,
      direccion: parsed.data.direccion ?? null,
      telefono: parsed.data.telefono ?? null,
    })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", sucursalId);

  if (error) return { error: "No se pudo actualizar la sucursal." };

  revalidatePath(CONFIG_PATH);
  return { ok: true };
}

/** Activa o desactiva una sucursal. */
export async function toggleSucursal(formData: FormData): Promise<ConfigResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };

  const id = (formData.get("id") as string | null)?.trim();
  if (!id) return { error: "Sucursal no identificada." };
  const activa = formData.get("activa") === "1";

  const { error } = await ctx.supabase
    .from("mm_sucursales")
    .update({ activa })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id);

  if (error) return { error: "No se pudo actualizar la sucursal." };

  revalidatePath(CONFIG_PATH);
  return { ok: true };
}

/**
 * Sube o elimina el logo del negocio (Configuración). Requiere acceso
 * operativo vigente — durante el onboarding de bienvenida se usa
 * `subirLogoBienvenidaAction` en su lugar, sin esta guarda (ver
 * `bienvenida/actions.ts`); la lógica de guardado en sí vive una sola vez en
 * `guardarLogoNegocio`.
 */
export async function subirLogoNegocio(
  _prev: ConfigResult,
  formData: FormData,
): Promise<ConfigResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };

  return guardarLogoNegocio(ctx, formData);
}

const METODO_CAMPOS_MAP: Partial<Record<string, string[]>> = {
  pago_movil: ["banco", "telefono", "titular", "rif"],
  transferencia: ["banco", "cuenta", "titular", "rif"],
  zelle: ["zelle_identificador", "titular"],
  tarjeta: ["banco"],
};

/** Guarda qué métodos de pago están activos y sus datos de contacto. */
export async function actualizarMetodosPago(
  _prev: ConfigResult,
  formData: FormData,
): Promise<ConfigResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };

  // Lista única de métodos: `METODOS_PAGO_IDS` (@/lib/minimarket/metodos-pago).
  // Antes vivía duplicada acá a mano — una copia local desactualizada aquí
  // significa que el checkbox "Activo" de un método nuevo (ej. Cashea) nunca
  // se lee del formulario ni se guarda. No volver a duplicar esta lista.
  const metodos = METODOS_PAGO_IDS.map((id) => {
    const activo = formData.get(`metodo_${id}_activo`) === "1";
    const campos = METODO_CAMPOS_MAP[id] ?? [];
    const extras: Record<string, string> = {};
    for (const campo of campos) {
      const val = (formData.get(`metodo_${id}_${campo}`) as string | null)?.trim() ?? "";
      if (val) extras[campo] = val;
    }
    return { metodo: id, activo, ...extras };
  });

  const id = await getOrCreateConfigId(ctx);
  if (!id) return { error: "No se pudo acceder a la configuración." };

  const { error } = await ctx.supabase
    .from("mm_config_negocio")
    .update({ metodos_pago: metodos })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id);

  if (error) return { error: "No se pudo guardar los métodos de pago." };

  revalidatePath(CONFIG_PATH);
  return { ok: true };
}

// La asignación de roles operativos se mudó a `personal/actions.ts`
// (módulo Personal, con el modelo de roles/permisos configurables).
