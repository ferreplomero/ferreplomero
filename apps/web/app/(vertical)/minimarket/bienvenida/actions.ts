"use server";

/**
 * Onboarding guiado de datos iniciales del negocio (nombre, RIF/cédula,
 * teléfono, dirección y tipo de negocio) — al completarlo, precarga las
 * categorías de inventario sugeridas para ese rubro
 * (`lib/minimarket/tipos-negocio.ts`). Marca `datos_completados_en` para que
 * el layout del vertical deje de forzar este paso (ver
 * `lib/minimarket/permisos.ts` y `app/(vertical)/minimarket/layout.tsx`).
 *
 * Las categorías sugeridas son solo un punto de partida: se insertan las que
 * falten (comparando por nombre, sin distinguir mayúsculas) y nunca se tocan
 * ni se borran las que el negocio ya tenía — el dueño puede editarlas o
 * quitarlas después desde Inventario, sin que este asistente las reponga.
 */
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { phoneSchema } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { requirePermisoAccion } from "@/lib/minimarket/permisos";
import { getTipoNegocioOpcion, TIPO_NEGOCIO_VALUES } from "@/lib/minimarket/tipos-negocio";
import { guardarLogoNegocio, type LogoResult } from "@/lib/minimarket/config-negocio";

export interface BienvenidaResult {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  categoriasCreadas?: number;
}

async function contexto() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id ?? null;
  if (!session || !tenantId) return null;
  const supabase = await createClient();
  return { supabase, tenantId, userId: session.user.id };
}

const datosBasicosSchema = z.object({
  nombre_comercial: z.string().trim().min(1, "El nombre del negocio es obligatorio.").max(160),
  tipo_documento: z.enum(["V", "E", "J", "G"], {
    errorMap: () => ({ message: "Selecciona el tipo de documento." }),
  }),
  numero_documento: z
    .string()
    .trim()
    .regex(/^\d{6,10}$/, "El número debe tener entre 6 y 10 dígitos."),
  telefono: phoneSchema,
  direccion: z.string().trim().max(400).optional().or(z.literal("")),
});

// El negocio puede ser MIXTO: se permiten VARIOS rubros a la vez (p. ej. una
// bodega que también es licorería). Se guarda el arreglo completo en
// `parametros.tipos_negocio` (JSONB que ya existe — no hace falta migración ni
// columna nueva, así se evita la fragilidad de leer una columna que la BD real
// pudiera no tener todavía) y `tipo_negocio` (columna con CHECK desde la
// migración 0040) conserva el PRIMER rubro elegido para compatibilidad con
// reportes y lecturas existentes.
const tiposNegocioSchema = z
  .array(z.string())
  .transform((arr) => Array.from(new Set(arr)))
  .refine((arr) => arr.length > 0, "Elige al menos un tipo de negocio.")
  .refine(
    (arr) => arr.every((v) => (TIPO_NEGOCIO_VALUES as string[]).includes(v)),
    "Selecciona tipos de negocio válidos.",
  );

function fieldErr(e: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of e.issues) {
    const k = issue.path[0];
    if (typeof k === "string" && !(k in out)) out[k] = issue.message;
  }
  return out;
}

/**
 * Crea las categorías sugeridas de TODOS los rubros elegidos que aún no
 * existan. Primero une las categorías de todos los tipos (sin duplicar por
 * nombre, ignorando mayúsculas) y luego descarta las que el negocio ya tiene
 * — así un negocio mixto (p. ej. bodega + licorería) queda con el inventario
 * combinado de ambos rubros sin categorías repetidas.
 */
async function crearCategoriasSugeridas(
  ctx: NonNullable<Awaited<ReturnType<typeof contexto>>>,
  tiposNegocio: string[],
): Promise<number> {
  const sugeridas: string[] = [];
  const vistos = new Set<string>();
  for (const tipo of tiposNegocio) {
    const opcion = getTipoNegocioOpcion(tipo);
    if (!opcion) continue;
    for (const c of opcion.categorias) {
      const key = c.toLowerCase();
      if (!vistos.has(key)) {
        vistos.add(key);
        sugeridas.push(c);
      }
    }
  }
  if (sugeridas.length === 0) return 0;

  const { data: existentes, count } = await ctx.supabase
    .from("mm_categorias")
    .select("nombre", { count: "exact" })
    .eq("tenant_id", ctx.tenantId)
    .is("deleted_at", null);

  const existentesLower = new Set((existentes ?? []).map((c) => c.nombre.toLowerCase()));
  const nuevas = sugeridas.filter((c) => !existentesLower.has(c.toLowerCase()));
  if (nuevas.length === 0) return 0;

  const ordenInicial = count ?? existentes?.length ?? 0;
  const { error } = await ctx.supabase.from("mm_categorias").insert(
    nuevas.map((nombre, i) => ({
      tenant_id: ctx.tenantId,
      nombre,
      orden: ordenInicial + i,
    })),
  );
  if (error) {
    console.error("[crearCategoriasSugeridas]", error);
    return 0;
  }
  return nuevas.length;
}

/**
 * Guarda nombre/RIF/teléfono/dirección en `mm_config_negocio` (insert o
 * update según exista o no la fila), preservando `parametros` existentes y
 * fusionando cualquier campo adicional (`extra`) en la misma escritura. NO
 * toca `tipo_negocio` ni `datos_completados_en` salvo que vengan en `extra`
 * — así el paso 1 del asistente (nombre/RIF/teléfono/dirección) puede
 * guardarse de forma durable SIN marcar el onboarding como completado
 * todavía (eso requiere también el rubro del paso 2).
 */
async function guardarDatosBasicosNegocio(
  ctx: NonNullable<Awaited<ReturnType<typeof contexto>>>,
  d: z.infer<typeof datosBasicosSchema>,
  extra: Record<string, unknown> = {},
  parametrosExtra: Record<string, unknown> = {},
): Promise<{ error?: string }> {
  const rif = `${d.tipo_documento}-${d.numero_documento}`;

  const { data: configExistente } = await ctx.supabase
    .from("mm_config_negocio")
    .select("id, parametros")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  const parametrosActuales =
    configExistente?.parametros &&
    typeof configExistente.parametros === "object" &&
    !Array.isArray(configExistente.parametros)
      ? (configExistente.parametros as Record<string, unknown>)
      : {};

  const datosGuardar = {
    nombre_comercial: d.nombre_comercial,
    rif,
    direccion: d.direccion || null,
    parametros: { ...parametrosActuales, telefono: d.telefono, ...parametrosExtra },
    ...extra,
  };

  const { error } = configExistente
    ? await ctx.supabase
        .from("mm_config_negocio")
        .update(datosGuardar)
        .eq("tenant_id", ctx.tenantId)
        .eq("id", configExistente.id)
    : await ctx.supabase.from("mm_config_negocio").insert({
        tenant_id: ctx.tenantId,
        fuente_tasa: "bcv",
        ...datosGuardar,
      });

  if (error) {
    console.error("[guardarDatosBasicosNegocio]", error);
    return { error: "No se pudieron guardar los datos del negocio." };
  }
  return {};
}

/**
 * Guarda el paso 1 del asistente (nombre, RIF, teléfono, dirección) ANTES de
 * llegar al paso 2 (rubro). Sin esto, si el usuario cerraba la pestaña o no
 * llegaba a elegir el rubro, esos datos vivían solo en el estado de React del
 * wizard y se perdían por completo — el negocio parecía "no guardar nunca
 * nada" y el asistente se repetía desde cero en cada ingreso. NO marca
 * `datos_completados_en` (eso es exclusivo del paso 2, `completarDatosNegocioInicialAction`),
 * así que el layout sigue reenviando a `/minimarket/bienvenida` hasta que el
 * rubro también quede elegido — pero ya con estos campos pre-rellenados.
 */
export async function guardarProgresoPaso1Action(
  _prev: BienvenidaResult,
  formData: FormData,
): Promise<BienvenidaResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };

  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "configuracion",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  const parsed = datosBasicosSchema.safeParse({
    nombre_comercial: formData.get("nombre_comercial"),
    tipo_documento: formData.get("tipo_documento"),
    numero_documento: formData.get("numero_documento"),
    telefono: formData.get("telefono"),
    direccion: (formData.get("direccion") as string | null)?.trim() || undefined,
  });
  if (!parsed.success) return { fieldErrors: fieldErr(parsed.error) };

  const { error } = await guardarDatosBasicosNegocio(ctx, parsed.data);
  if (error) return { error };

  revalidatePath("/minimarket/bienvenida");
  return { ok: true };
}

/**
 * Guarda los datos iniciales del negocio y precarga las categorías del rubro
 * elegido. Este es el paso de onboarding, no una acción operativa.
 */
export async function completarDatosNegocioInicialAction(
  _prev: BienvenidaResult,
  formData: FormData,
): Promise<BienvenidaResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };

  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "configuracion",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  const parsed = datosBasicosSchema.safeParse({
    nombre_comercial: formData.get("nombre_comercial"),
    tipo_documento: formData.get("tipo_documento"),
    numero_documento: formData.get("numero_documento"),
    telefono: formData.get("telefono"),
    direccion: (formData.get("direccion") as string | null)?.trim() || undefined,
  });
  if (!parsed.success) return { fieldErrors: fieldErr(parsed.error) };

  // Los rubros llegan como múltiples entradas `tipo_negocio` (negocio mixto).
  const tiposParsed = tiposNegocioSchema.safeParse(
    formData.getAll("tipo_negocio").filter((v): v is string => typeof v === "string"),
  );
  if (!tiposParsed.success) {
    return { error: tiposParsed.error.issues[0]?.message ?? "Elige al menos un tipo de negocio." };
  }
  const tipos = tiposParsed.data;

  const { error } = await guardarDatosBasicosNegocio(
    ctx,
    parsed.data,
    // `tipo_negocio` (columna) = rubro principal; el arreglo completo va en
    // `parametros.tipos_negocio` para no depender de una columna nueva.
    { tipo_negocio: tipos[0], datos_completados_en: new Date().toISOString() },
    { tipos_negocio: tipos },
  );
  if (error) return { error };

  const categoriasCreadas = await crearCategoriasSugeridas(ctx, tipos);

  revalidatePath("/minimarket");
  revalidatePath("/minimarket/configuracion");
  revalidatePath("/minimarket/inventario");
  revalidatePath("/minimarket/bienvenida");

  return { ok: true, categoriasCreadas };
}

/**
 * Sube o quita el logo del negocio DESDE el asistente de bienvenida. Misma
 * lógica que `subirLogoNegocio` (Configuración). El permiso de módulo sigue
 * exigido: solo quien puede configurar el negocio llega a este paso.
 */
export async function subirLogoBienvenidaAction(
  _prev: LogoResult,
  formData: FormData,
): Promise<LogoResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };

  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "configuracion",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  return guardarLogoNegocio(ctx, formData);
}
