import { createServerClient as createSsrClient, type CookieOptions } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "../env";
import type { Database } from "../types/database";

/** Adaptador de cookies que provee el framework (Next.js: next/headers). */
export interface CookieAdapter {
  getAll: () => { name: string; value: string }[];
  setAll: (cookies: { name: string; value: string; options?: CookieOptions }[]) => void;
}

/**
 * Cliente Supabase para el servidor (Server Components, Server Actions, Route
 * Handlers). Respeta RLS y refresca la sesión vía cookies. Framework-agnóstico:
 * el adaptador de cookies se inyecta desde la app.
 */
export function createServerClient(cookies: CookieAdapter) {
  return createSsrClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (toSet: { name: string; value: string; options?: CookieOptions }[]) =>
        cookies.setAll(toSet),
    },
  });
}
