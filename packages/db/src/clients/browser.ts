import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "../env";
import type { Database } from "../types/database";

/**
 * Cliente Supabase para el navegador (Client Components).
 * Usa la clave anónima y respeta RLS.
 */
export function createClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabaseAnonKey());
}
