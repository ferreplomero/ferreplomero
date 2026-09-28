/**
 * Link público y de solo lectura del PDF de la NOTA DE ENTREGA de una venta
 * (`/ne/[ventaId]/[token]`), para enviarla por WhatsApp sin que el cliente
 * necesite sesión. Mismo esquema que `recibo-link.ts` (HMAC-SHA256 con la
 * `SUPABASE_SERVICE_ROLE_KEY`, determinista, sin tocar la base de datos),
 * pero con un prefijo propio en el mensaje firmado: el token del recibo NO
 * sirve para abrir la nota ni al revés.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { SITE } from "@/lib/site";

function secreto(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurada.");
  return key;
}

function calcularToken(ventaId: string, tenantId: string): string {
  return createHmac("sha256", secreto())
    .update(`nota-entrega:${ventaId}:${tenantId}`)
    .digest("hex")
    .slice(0, 32);
}

/** URL pública del PDF de la nota de entrega — segura de compartir. */
export function linkPublicoNotaEntrega(ventaId: string, tenantId: string): string {
  return `${SITE.url}/ne/${ventaId}/${calcularToken(ventaId, tenantId)}`;
}

/** Valida el token recibido en `/ne/[ventaId]/[token]`, en tiempo constante. */
export function tokenNotaEntregaValido(ventaId: string, tenantId: string, token: string): boolean {
  const esperado = Buffer.from(calcularToken(ventaId, tenantId), "utf8");
  const recibido = Buffer.from(token, "utf8");
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}
