import { normalizarTelefonoWhatsapp } from "@/lib/telefono-wa";

/**
 * Número para `wa.me` en Pedidos. Igual que `normalizarTelefonoWhatsapp`,
 * pero además acepta un celular venezolano guardado sin el 0 inicial
 * (ej. "4247559929" → "584247559929"), que de otro modo quedaría sin código
 * de país y WhatsApp no lo encontraría.
 */
export function numeroWhatsappPedido(numero: string): string {
  const digitos = numero.replace(/\D/g, "");
  if (digitos.length === 10 && digitos.startsWith("4")) return `58${digitos}`;
  return normalizarTelefonoWhatsapp(numero);
}
