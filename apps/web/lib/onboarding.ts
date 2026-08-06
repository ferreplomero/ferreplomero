/**
 * Aprovisionamiento del negocio al iniciar sesión por primera vez: crea el
 * tenant del usuario nuevo y su membresía de propietario.
 *
 * NO concede ningún entitlement de producto — el registro y el acceso a un
 * módulo son cosas separadas (CLAUDE.md). La cuenta nace sin ningún módulo
 * activo; el usuario debe solicitar acceso explícitamente desde el catálogo
 * (demo 24h, prueba 7 días, o pagar el Plan Mensual — ver
 * `app/(app)/catalogo/[slug]/actions.ts`).
 *
 * Reutiliza el mismo patrón que `activateProduct` (apps/web/app/(app)/actions.ts):
 * tenant + membership se crean con el cliente normal (RLS).
 */
import type { User } from "@supabase/supabase-js";
import { slugify } from "@arkiteq/core";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_TENANT_COOKIE } from "@/lib/site";
import { cookies } from "next/headers";

/** Horas de la prueba gratis genérica (no-minimarket) que activa `activateProduct`. */
export const TRIAL_HORAS_DEFAULT = 24;

export interface ResultadoAprovisionamiento {
  aprovisiono: boolean;
  tenantId?: string;
}

/**
 * Si el usuario NO tiene ningún negocio todavía, le crea uno (sin ningún
 * entitlement). Si ya tiene alguna membresía (login posterior, o fue
 * invitado a un tenant existente), no hace nada.
 */
export async function asegurarNegocioInicial(user: User): Promise<ResultadoAprovisionamiento> {
  const supabase = await createClient();

  const { data: existente } = await supabase
    .from("memberships")
    .select("tenant_id")
    .eq("profile_id", user.id)
    .limit(1)
    .maybeSingle();
  if (existente) return { aprovisiono: false };

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ?? user.email?.split("@")[0] ?? "negocio";
  const baseName = `Negocio de ${displayName}`;
  const slug = `${slugify(displayName) || "negocio"}-${Math.random().toString(36).slice(2, 7)}`;

  // Genera el id en el cliente y NO encadena `.select()`: la política RLS de
  // lectura de `tenants` exige una membership existente, que todavía no
  // existe en este punto para un negocio recién creado — pedir de vuelta la
  // fila con `.select().single()` siempre devolvía 0 filas (aunque el INSERT
  // sí se guardaba), rompiendo el aprovisionamiento para TODO usuario nuevo.
  const tenantId = crypto.randomUUID();
  const { error: tenantError } = await supabase
    .from("tenants")
    .insert({ id: tenantId, name: baseName, slug, created_by: user.id });
  if (tenantError) {
    console.error("[asegurarNegocioInicial] error al crear tenant:", tenantError);
    return { aprovisiono: false };
  }

  const { error: membershipError } = await supabase
    .from("memberships")
    .insert({ tenant_id: tenantId, profile_id: user.id, role: "propietario" });
  if (membershipError) {
    console.error("[asegurarNegocioInicial] error al crear membership:", membershipError);
    return { aprovisiono: false };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return { aprovisiono: true, tenantId };
}
