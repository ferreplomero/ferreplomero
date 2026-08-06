"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { requirePermisoAccion } from "@/lib/minimarket/permisos";

const CONFIG_PATH = "/minimarket/configuracion";
const BANCOS_PATH = "/minimarket/bancos";

export interface CuentaResult {
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

/** pago_movil/transferencia/tarjeta/cashea: se identifican por banco. */
const METODOS_CON_CUENTA_BANCO = ["pago_movil", "transferencia", "tarjeta", "cashea"] as const;

const cuentaSchema = z.object({
  metodo: z.enum(METODOS_CON_CUENTA_BANCO),
  banco: z.string().trim().min(1, "El banco es obligatorio.").max(120),
  titular: z.string().trim().min(1, "El titular es obligatorio.").max(160),
  rif: z.string().trim().max(30).optional(),
  telefono: z.string().trim().max(30).optional(),
  cuenta: z.string().trim().max(40).optional(),
});

/** Zelle se identifica por CORREO, no por banco — nombre/apellido/cédula del
 * titular de la cuenta Zelle, igual que exige el negocio real. */
const cuentaZelleSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio.").max(80),
  apellido: z.string().trim().min(1, "El apellido es obligatorio.").max(80),
  cedula: z.string().trim().max(30).optional(),
  correo: z
    .string()
    .trim()
    .min(1, "El correo de Zelle es obligatorio.")
    .max(160)
    .email("Ingresa un correo válido."),
});

function fieldErr(e: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of e.issues) {
    const k = issue.path[0];
    if (typeof k === "string" && !(k in out)) out[k] = issue.message;
  }
  return out;
}

function revalidar() {
  revalidatePath(CONFIG_PATH);
  // "layout" revalida bancos/layout.tsx y todas sus sub-rutas por tipo
  // (pago-movil, transferencia, tarjeta, zelle, cashea) — Bancos ya no es
  // una sola página.
  revalidatePath(BANCOS_PATH, "layout");
  revalidatePath("/minimarket/ventas/nueva");
  // Pantalla de saldos iniciales (ver migración 0106): reutiliza este mismo
  // panel para crear cuentas inline, así que necesita ver la cuenta recién
  // creada sin depender de una navegación aparte.
  revalidatePath("/minimarket/configuracion/saldos-iniciales");
}

/** Crea una cuenta bancaria para pago móvil/transferencia/tarjeta. La primera
 * cuenta de un método queda predeterminada automáticamente. */
export async function crearCuentaBancaria(
  _prev: CuentaResult,
  formData: FormData,
): Promise<CuentaResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "bancos",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const metodo = formData.get("metodo");

  if (metodo === "zelle") {
    const parsed = cuentaZelleSchema.safeParse({
      nombre: formData.get("nombre"),
      apellido: formData.get("apellido"),
      cedula: (formData.get("cedula") as string | null)?.trim() || undefined,
      correo: formData.get("correo"),
    });
    if (!parsed.success) return { fieldErrors: fieldErr(parsed.error) };
    const v = parsed.data;

    const { count } = await ctx.supabase
      .from("mm_cuentas_bancarias")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", ctx.tenantId)
      .eq("metodo", "zelle")
      .is("deleted_at", null);

    // `banco` guarda el mismo correo que `correo`: el resto de la app (Bancos,
    // selector de cuenta en el POS, botón de vuelto, recibo, Finanzas) ya
    // muestra `cuenta.banco` como encabezado — mostrar el correo ahí es lo
    // que de verdad distingue una cuenta Zelle de otra, sin tocar ese código.
    const { error } = await ctx.supabase.from("mm_cuentas_bancarias").insert({
      tenant_id: ctx.tenantId,
      metodo: "zelle",
      banco: v.correo,
      titular: `${v.nombre} ${v.apellido}`.trim(),
      rif: v.cedula ?? null,
      telefono: null,
      cuenta: null,
      correo: v.correo,
      predeterminada: (count ?? 0) === 0,
    });
    if (error) return { error: "No se pudo guardar la cuenta Zelle." };

    revalidar();
    return { ok: true };
  }

  const parsed = cuentaSchema.safeParse({
    metodo,
    banco: formData.get("banco"),
    titular: formData.get("titular"),
    rif: (formData.get("rif") as string | null)?.trim() || undefined,
    telefono: (formData.get("telefono") as string | null)?.trim() || undefined,
    cuenta: (formData.get("cuenta") as string | null)?.trim() || undefined,
  });
  if (!parsed.success) return { fieldErrors: fieldErr(parsed.error) };
  const v = parsed.data;

  const { count } = await ctx.supabase
    .from("mm_cuentas_bancarias")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", ctx.tenantId)
    .eq("metodo", v.metodo)
    .is("deleted_at", null);

  const { error } = await ctx.supabase.from("mm_cuentas_bancarias").insert({
    tenant_id: ctx.tenantId,
    metodo: v.metodo,
    banco: v.banco,
    titular: v.titular,
    rif: v.rif ?? null,
    telefono: v.telefono ?? null,
    cuenta: v.cuenta ?? null,
    predeterminada: (count ?? 0) === 0,
  });
  if (error) return { error: "No se pudo guardar la cuenta bancaria." };

  revalidar();
  return { ok: true };
}

/** Edita los datos de una cuenta (no su método: crea otra si cambió de método). */
export async function actualizarCuentaBancaria(
  cuentaId: string,
  _prev: CuentaResult,
  formData: FormData,
): Promise<CuentaResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "bancos",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  const { data: cuenta } = await ctx.supabase
    .from("mm_cuentas_bancarias")
    .select("metodo")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", cuentaId)
    .maybeSingle();
  if (!cuenta) return { error: "Cuenta no encontrada." };

  if (cuenta.metodo === "zelle") {
    const parsed = cuentaZelleSchema.safeParse({
      nombre: formData.get("nombre"),
      apellido: formData.get("apellido"),
      cedula: (formData.get("cedula") as string | null)?.trim() || undefined,
      correo: formData.get("correo"),
    });
    if (!parsed.success) return { fieldErrors: fieldErr(parsed.error) };
    const v = parsed.data;

    const { error } = await ctx.supabase
      .from("mm_cuentas_bancarias")
      .update({
        banco: v.correo,
        titular: `${v.nombre} ${v.apellido}`.trim(),
        rif: v.cedula ?? null,
        correo: v.correo,
      })
      .eq("tenant_id", ctx.tenantId)
      .eq("id", cuentaId);
    if (error) return { error: "No se pudo actualizar la cuenta Zelle." };

    revalidar();
    return { ok: true };
  }

  const parsed = cuentaSchema.omit({ metodo: true }).safeParse({
    banco: formData.get("banco"),
    titular: formData.get("titular"),
    rif: (formData.get("rif") as string | null)?.trim() || undefined,
    telefono: (formData.get("telefono") as string | null)?.trim() || undefined,
    cuenta: (formData.get("cuenta") as string | null)?.trim() || undefined,
  });
  if (!parsed.success) return { fieldErrors: fieldErr(parsed.error) };
  const v = parsed.data;

  const { error } = await ctx.supabase
    .from("mm_cuentas_bancarias")
    .update({
      banco: v.banco,
      titular: v.titular,
      rif: v.rif ?? null,
      telefono: v.telefono ?? null,
      cuenta: v.cuenta ?? null,
    })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", cuentaId);
  if (error) return { error: "No se pudo actualizar la cuenta bancaria." };

  revalidar();
  return { ok: true };
}

/** Marca una cuenta como predeterminada de su método (desmarca las demás). */
export async function marcarCuentaPredeterminada(formData: FormData): Promise<CuentaResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "bancos",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  const cuentaId = (formData.get("id") as string | null)?.trim();
  if (!cuentaId) return { error: "Cuenta no identificada." };

  const { data: cuenta } = await ctx.supabase
    .from("mm_cuentas_bancarias")
    .select("metodo")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", cuentaId)
    .maybeSingle();
  if (!cuenta) return { error: "Cuenta no encontrada." };

  // Primero desmarca las demás del mismo método (evita el choque con el
  // índice único mientras se hace la transición) y luego marca esta.
  await ctx.supabase
    .from("mm_cuentas_bancarias")
    .update({ predeterminada: false })
    .eq("tenant_id", ctx.tenantId)
    .eq("metodo", cuenta.metodo)
    .neq("id", cuentaId);

  const { error } = await ctx.supabase
    .from("mm_cuentas_bancarias")
    .update({ predeterminada: true })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", cuentaId);
  if (error) return { error: "No se pudo marcar la cuenta como predeterminada." };

  revalidar();
  return { ok: true };
}

/** Elimina (borrado lógico) una cuenta bancaria. Si era la predeterminada,
 * promueve otra cuenta activa del mismo método para que siempre haya una. */
export async function eliminarCuentaBancaria(formData: FormData): Promise<CuentaResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "bancos",
    "eliminar",
  );
  if (permisoError) return { error: permisoError };

  const cuentaId = (formData.get("id") as string | null)?.trim();
  if (!cuentaId) return { error: "Cuenta no identificada." };

  const { data: cuenta } = await ctx.supabase
    .from("mm_cuentas_bancarias")
    .select("metodo, predeterminada")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", cuentaId)
    .maybeSingle();
  if (!cuenta) return { error: "Cuenta no encontrada." };

  const { error } = await ctx.supabase
    .from("mm_cuentas_bancarias")
    .update({ deleted_at: new Date().toISOString(), predeterminada: false })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", cuentaId);
  if (error) return { error: "No se pudo eliminar la cuenta bancaria." };

  if (cuenta.predeterminada) {
    const { data: siguiente } = await ctx.supabase
      .from("mm_cuentas_bancarias")
      .select("id")
      .eq("tenant_id", ctx.tenantId)
      .eq("metodo", cuenta.metodo)
      .eq("activa", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (siguiente) {
      await ctx.supabase
        .from("mm_cuentas_bancarias")
        .update({ predeterminada: true })
        .eq("tenant_id", ctx.tenantId)
        .eq("id", siguiente.id);
    }
  }

  revalidar();
  return { ok: true };
}
