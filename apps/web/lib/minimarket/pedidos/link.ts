/**
 * Link público firmado del estado de un pedido del catálogo
 * (`/tienda/[slug]/pedido/[pedidoId]/[token]`). Mismo mecanismo que
 * `recibo-link.ts`: HMAC-SHA256 con un secreto exclusivo de servidor,
 * determinista y validado en tiempo constante. El prefijo `pedido-publico:`
 * separa este dominio de firma del de los recibos (un token de recibo nunca
 * sirve como token de pedido, aunque coincidieran los ids).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { SITE } from "@/lib/site";

function secreto(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurada.");
  return key;
}

function calcularToken(pedidoId: string, tenantId: string): string {
  return createHmac("sha256", secreto())
    .update(`pedido-publico:${pedidoId}:${tenantId}`)
    .digest("hex")
    .slice(0, 32);
}

export function rutaEstadoPedido(slug: string, pedidoId: string, tenantId: string): string {
  return `/tienda/${slug}/pedido/${pedidoId}/${calcularToken(pedidoId, tenantId)}`;
}

export function linkEstadoPedido(slug: string, pedidoId: string, tenantId: string): string {
  return `${SITE.url}${rutaEstadoPedido(slug, pedidoId, tenantId)}`;
}

export function tokenPedidoValido(pedidoId: string, tenantId: string, token: string): boolean {
  const esperado = Buffer.from(calcularToken(pedidoId, tenantId), "utf8");
  const recibido = Buffer.from(token, "utf8");
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}
