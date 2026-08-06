import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "../env";
import type { Database } from "../types/database";

/**
 * Cliente con `service_role`: SALTA RLS y tiene acceso total.
 * EXCLUSIVO de servidor (server actions / route handlers). Nunca debe llegar
 * al navegador. Guardia de runtime para evitar fugas accidentales.
 */
export function createServiceClient() {
  if (typeof window !== "undefined") {
    throw new Error(
      "createServiceClient() solo puede usarse en el servidor: expondría la service_role key.",
    );
  }

  return createSupabaseClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
