/**
 * Link público y de solo lectura de un presupuesto (`/pp/[presupuestoId]/[token]`),
 * para que el cliente lo abra por WhatsApp sin necesitar sesión ni cuenta.
 * Mismo mecanismo que `lib/minimarket/recibo-link.ts`: token HMAC-SHA256
 * determinista de `presupuestoId:tenantId`, firmado con la
 * `SUPABASE_SERVICE_ROLE_KEY` — no hace falta guardar nada nuevo en la base.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { SITE } from "@/lib/site";

function secreto(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurada.");
  return key;
}

function calcularToken(presupuestoId: string, tenantId: string): string {
  return createHmac("sha256", secreto())
    .update(`${presupuestoId}:${tenantId}`)
    .digest("hex")
    .slice(0, 32);
}

/** URL pública del presupuesto — segura de compartir, no requiere sesión para verse. */
export function linkPublicoPresupuesto(presupuestoId: string, tenantId: string): string {
  return `${SITE.url}/pp/${presupuestoId}/${calcularToken(presupuestoId, tenantId)}`;
}

/** Valida el token recibido en `/pp/[presupuestoId]/[token]`, en tiempo constante. */
export function tokenPresupuestoValido(
  presupuestoId: string,
  tenantId: string,
  token: string,
): boolean {
  const esperado = Buffer.from(calcularToken(presupuestoId, tenantId), "utf8");
  const recibido = Buffer.from(token, "utf8");
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}
