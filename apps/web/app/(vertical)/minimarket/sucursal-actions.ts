"use server";

/**
 * Cambia la sucursal activa del usuario (selector en `vertical-shell.tsx`,
 * ver `components/minimarket/sucursal-switcher.tsx`). Misma mecánica que el
 * tenant activo: cookie httpOnly, nunca confía en el `sucursalId` del
 * cliente — siempre se revalida contra `sucursalesPermitidas` en el
 * servidor antes de guardarlo.
 */
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_SUCURSAL_COOKIE } from "@/lib/site";
import { MINIMARKET_BASE } from "@/lib/minimarket/nav";
import { sucursalesPermitidas } from "@/lib/minimarket/sucursal-acceso";

export interface CambiarSucursalResult {
  ok?: boolean;
  error?: string;
}

export async function cambiarSucursalActivaAction(
  sucursalId: string,
): Promise<CambiarSucursalResult> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };

  const supabase = await createClient();
  const permitidas = await sucursalesPermitidas(supabase, tenantId, session.user.id);
  if (!permitidas.some((s) => s.id === sucursalId)) {
    return { error: "No tienes acceso a esa sucursal." };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_SUCURSAL_COOKIE, `${session.user.id}.${sucursalId}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath(MINIMARKET_BASE);
  return { ok: true };
}
