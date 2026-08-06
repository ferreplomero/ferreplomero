/**
 * Link público y de solo lectura del recibo de una venta (`/r/[ventaId]/[token]`),
 * para que el cliente lo abra por WhatsApp sin necesitar sesión ni cuenta.
 *
 * El token es un HMAC-SHA256 de `ventaId:tenantId` firmado con la
 * `SUPABASE_SERVICE_ROLE_KEY` (secreta, exclusiva de servidor) — determinista,
 * así que no hace falta guardar nada nuevo en la base de datos ni migrar el
 * esquema: la misma venta siempre produce el mismo link, y solo el servidor
 * puede generarlo o validarlo. El ID de la venta por sí solo no sirve como
 * token (es visible en la URL interna de la app), por eso se firma.
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
    .update(`${ventaId}:${tenantId}`)
    .digest("hex")
    .slice(0, 32);
}

/** URL pública del recibo — segura de compartir, no requiere sesión para verse. */
export function linkPublicoRecibo(ventaId: string, tenantId: string): string {
  return `${SITE.url}/r/${ventaId}/${calcularToken(ventaId, tenantId)}`;
}

/** Valida el token recibido en `/r/[ventaId]/[token]` contra el esperado, en tiempo constante. */
export function tokenReciboValido(ventaId: string, tenantId: string, token: string): boolean {
  const esperado = Buffer.from(calcularToken(ventaId, tenantId), "utf8");
  const recibido = Buffer.from(token, "utf8");
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}
