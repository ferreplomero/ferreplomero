/**
 * Redirección inteligente al entrar con sesión activa: adónde debe ir el
 * usuario apenas abre la app. Sistema de un solo vertical (Minimarket) — con
 * tenant activo siempre va ahí; sin tenant, `null` (se queda donde esté).
 */
import type { SessionContext } from "./auth/session";

export async function resolveEntryDestination(
  session: SessionContext | null,
): Promise<string | null> {
  if (!session) return null;
  return session.tenants.length > 0 ? "/minimarket" : null;
}
