import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Entitlement, Product } from "@arkiteq/db";

export type ArkiteqClient = SupabaseClient<Database>;

/** Se lanza ante un fallo al consultar entitlements. */
export class EntitlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntitlementError";
  }
}

/** Entitlement con el producto asociado embebido. */
export interface EntitlementWithProduct extends Entitlement {
  product: Pick<Product, "slug" | "name" | "status"> | null;
}

/**
 * ¿Este entitlement da acceso AHORA? `status` debe ser 'activo' y, si tiene
 * `expires_at` (pruebas gratis con vencimiento), la fecha debe ser futura.
 * `expires_at` nulo = acceso indefinido (plan activo/manual, sin vencimiento).
 *
 * Función PURA: quien la llama debe calcular `ahoraIso` con la hora del
 * SERVIDOR (`new Date().toISOString()` dentro de un Server Component/Action/
 * Route Handler) — nunca confiar en una fecha que venga del cliente.
 */
export function entitlementVigente(
  e: Pick<Entitlement, "status" | "expires_at">,
  ahoraIso: string,
): boolean {
  if (e.status !== "activo") return false;
  if (!e.expires_at) return true;
  return e.expires_at > ahoraIso;
}

/**
 * Devuelve todos los entitlements de un tenant (la fuente de verdad del acceso).
 * Respeta RLS: el cliente debe estar autenticado como miembro del tenant.
 */
export async function getEntitlements(
  client: ArkiteqClient,
  tenantId: string,
): Promise<EntitlementWithProduct[]> {
  const { data, error } = await client
    .from("entitlements")
    .select("*, product:products(slug, name, status)")
    .eq("tenant_id", tenantId)
    .returns<EntitlementWithProduct[]>();

  if (error) throw new EntitlementError(error.message);
  return data ?? [];
}

/**
 * Indica si un tenant tiene acceso ACTIVO y VIGENTE (no vencido) a un producto
 * por su slug. Es la comprobación que usa el middleware para enrutar al SaaS
 * correcto.
 */
export async function hasAccess(
  client: ArkiteqClient,
  tenantId: string,
  productSlug: string,
): Promise<boolean> {
  const ahoraIso = new Date().toISOString();
  const { data, error } = await client
    .from("entitlements")
    .select("id, status, expires_at, products!inner(slug)")
    .eq("tenant_id", tenantId)
    .eq("status", "activo")
    .eq("products.slug", productSlug)
    .or(`expires_at.is.null,expires_at.gt.${ahoraIso}`)
    .limit(1)
    .returns<{ id: string }[]>();

  if (error) throw new EntitlementError(error.message);
  return (data?.length ?? 0) > 0;
}

/** Conjunto de slugs de productos a los que el tenant tiene acceso activo y vigente. */
export async function getActiveProductSlugs(
  client: ArkiteqClient,
  tenantId: string,
): Promise<Set<string>> {
  const entitlements = await getEntitlements(client, tenantId);
  const ahoraIso = new Date().toISOString();
  return new Set(
    entitlements
      .filter((e) => entitlementVigente(e, ahoraIso) && e.product !== null)
      .map((e) => e.product?.slug)
      .filter((slug): slug is string => Boolean(slug)),
  );
}
