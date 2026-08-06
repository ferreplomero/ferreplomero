import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@arkiteq/db/server";
import type { User } from "@supabase/supabase-js";

export interface SessionResult {
  response: NextResponse;
  user: User | null;
}

function hasSupabaseEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Refresca la sesión de Supabase en cada petición (patrón SSR con cookies) y
 * devuelve el usuario autenticado junto a la respuesta con las cookies al día.
 * Si faltan las variables de entorno, no rompe: trata al visitante como anónimo.
 */
export async function updateSession(request: NextRequest): Promise<SessionResult> {
  const response = NextResponse.next({ request });

  if (!hasSupabaseEnv()) {
    return { response, user: null };
  }

  const supabase = createServerClient({
    getAll: () => request.cookies.getAll(),
    setAll: (toSet) => {
      for (const { name, value } of toSet) {
        request.cookies.set(name, value);
      }
      for (const { name, value, options } of toSet) {
        response.cookies.set(name, value, options);
      }
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
