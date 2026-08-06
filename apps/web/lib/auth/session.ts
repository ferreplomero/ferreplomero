import { cache } from "react";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { getEntitlements, entitlementVigente, type EntitlementWithProduct } from "@arkiteq/core";
import type { CountryCode, MembershipRole } from "@arkiteq/db";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_TENANT_COOKIE } from "@/lib/site";

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  country: CountryCode;
  role: MembershipRole;
}

export interface SessionContext {
  user: User;
  tenants: TenantSummary[];
  activeTenant: TenantSummary | null;
  /** Slugs de productos con acceso activo Y VIGENTE (no vencido) del tenant activo. */
  entitlements: Set<string>;
  /** Filas completas de entitlements del tenant activo (status/expires_at/source),
   * para pantallas que necesitan saber POR QUÉ no hay acceso (ej. prueba vencida). */
  entitlementDetails: EntitlementWithProduct[];
}

interface MembershipRow {
  role: MembershipRole;
  tenant: {
    id: string;
    name: string;
    slug: string;
    country: CountryCode;
  } | null;
}

/**
 * Resuelve el contexto de sesión: usuario, sus tenants, el tenant activo y los
 * entitlements de ese tenant. Cacheado por petición con `react.cache`.
 * Devuelve null si no hay sesión.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("memberships")
    .select("role, tenant:tenants(id, name, slug, country)")
    .order("created_at", { ascending: true })
    .returns<MembershipRow[]>();

  const tenants: TenantSummary[] = (data ?? [])
    .filter((row): row is MembershipRow & { tenant: NonNullable<MembershipRow["tenant"]> } =>
      Boolean(row.tenant),
    )
    .map((row) => ({
      id: row.tenant.id,
      name: row.tenant.name,
      slug: row.tenant.slug,
      country: row.tenant.country,
      role: row.role,
    }));

  const cookieStore = await cookies();
  const preferredId = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value;
  const activeTenant = tenants.find((tenant) => tenant.id === preferredId) ?? tenants[0] ?? null;

  const entitlementDetails = activeTenant ? await getEntitlements(supabase, activeTenant.id) : [];
  const ahoraIso = new Date().toISOString();
  const entitlements = new Set(
    entitlementDetails
      .filter((e) => entitlementVigente(e, ahoraIso) && e.product !== null)
      .map((e) => e.product?.slug)
      .filter((slug): slug is string => Boolean(slug)),
  );

  return { user, tenants, activeTenant, entitlements, entitlementDetails };
});
