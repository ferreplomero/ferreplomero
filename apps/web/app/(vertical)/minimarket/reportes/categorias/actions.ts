"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { requirePermisoAccion } from "@/lib/minimarket/permisos";

const CATEGORIAS_PATH = "/minimarket/reportes/categorias";
const GASTOS_PATH = "/minimarket/reportes/gastos";
const OTROS_INGRESOS_PATH = "/minimarket/reportes/otros-ingresos";

export interface CategoriaMovimientoResult {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Solo en `crearCategoriaMovimiento`: id/nombre de la categoría recién
   * creada — permite a un llamador (ej. el formulario de gasto/otro-ingreso,
   * alta rápida) seleccionarla de inmediato sin recargar ni volver a buscarla. */
  categoriaId?: string;
  categoriaNombre?: string;
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in out)) out[key] = issue.message;
  }
  return out;
}

async function contexto() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id ?? null;
  if (!session || !tenantId) return null;
  const supabase = await createClient();
  return { supabase, tenantId, userId: session.user.id };
}

const categoriaSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio.").max(60),
  tipo: z.enum(["gasto", "otro_ingreso"], {
    errorMap: () => ({ message: "Tipo de categoría inválido." }),
  }),
});

/** Crea una categoría de gasto u otro-ingreso. */
export async function crearCategoriaMovimiento(
  _prev: CategoriaMovimientoResult,
  formData: FormData,
): Promise<CategoriaMovimientoResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "reportes",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const parsed = categoriaSchema.safeParse({
    nombre: formData.get("nombre"),
    tipo: formData.get("tipo"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { count } = await ctx.supabase
    .from("mm_categorias_movimiento")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", ctx.tenantId)
    .eq("tipo", parsed.data.tipo)
    .is("deleted_at", null);

  const { data: categoria, error } = await ctx.supabase
    .from("mm_categorias_movimiento")
    .insert({
      tenant_id: ctx.tenantId,
      tipo: parsed.data.tipo,
      nombre: parsed.data.nombre,
      orden: count ?? 0,
    })
    .select("id, nombre")
    .single();

  if (error || !categoria) {
    const yaExiste = error?.code === "23505";
    return {
      error: yaExiste
        ? "Ya existe una categoría con ese nombre."
        : "No se pudo crear la categoría.",
      fieldErrors: yaExiste ? { nombre: "Ya existe una categoría con ese nombre." } : undefined,
    };
  }

  revalidatePath(CATEGORIAS_PATH);
  revalidatePath(GASTOS_PATH);
  revalidatePath(OTROS_INGRESOS_PATH);
  return { ok: true, categoriaId: categoria.id, categoriaNombre: categoria.nombre };
}

/** Actualiza el nombre de una categoría. */
export async function actualizarCategoriaMovimiento(
  categoriaId: string,
  _prev: CategoriaMovimientoResult,
  formData: FormData,
): Promise<CategoriaMovimientoResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "reportes",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  const parsed = z
    .object({ nombre: z.string().trim().min(1, "El nombre es obligatorio.").max(60) })
    .safeParse({ nombre: formData.get("nombre") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { error } = await ctx.supabase
    .from("mm_categorias_movimiento")
    .update({ nombre: parsed.data.nombre })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", categoriaId);

  if (error) {
    const yaExiste = error.code === "23505";
    return {
      error: yaExiste
        ? "Ya existe una categoría con ese nombre."
        : "No se pudo actualizar la categoría.",
    };
  }

  revalidatePath(CATEGORIAS_PATH);
  revalidatePath(GASTOS_PATH);
  revalidatePath(OTROS_INGRESOS_PATH);
  return { ok: true };
}

/** Soft-delete de una categoría (solo si no tiene gastos/otros-ingresos activos asociados). */
export async function eliminarCategoriaMovimiento(
  formData: FormData,
): Promise<CategoriaMovimientoResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "reportes",
    "eliminar",
  );
  if (permisoError) return { error: permisoError };

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Categoría no identificada." };

  const { data: categoria } = await ctx.supabase
    .from("mm_categorias_movimiento")
    .select("tipo")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id)
    .maybeSingle();
  if (!categoria) return { error: "Categoría no encontrada." };

  const nombreTabla =
    categoria.tipo === "gasto" ? "mm_gastos_operativos" : ("mm_otros_ingresos" as const);
  const { count } = await ctx.supabase
    .from(nombreTabla)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", ctx.tenantId)
    .eq("categoria_id", id)
    .is("deleted_at", null);

  if ((count ?? 0) > 0) {
    return {
      error: `Esta categoría tiene ${count} registro${count !== 1 ? "s" : ""} activo${count !== 1 ? "s" : ""}. Reasígnalos antes de eliminar.`,
    };
  }

  const { error } = await ctx.supabase
    .from("mm_categorias_movimiento")
    .update({ deleted_at: new Date().toISOString() })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id);

  if (error) return { error: "No se pudo eliminar la categoría." };

  revalidatePath(CATEGORIAS_PATH);
  revalidatePath(GASTOS_PATH);
  revalidatePath(OTROS_INGRESOS_PATH);
  return { ok: true };
}
