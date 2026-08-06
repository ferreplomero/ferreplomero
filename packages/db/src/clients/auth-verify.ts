import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "../env";
import type { Database } from "../types/database";

/**
 * Cliente aislado SOLO para reautenticar (verificar) una contraseña vigente
 * en el servidor — p.ej. antes de una acción administrativa destructiva
 * (vaciar datos de prueba de un cliente). `signInWithPassword()` es la única
 * forma correcta de confirmar una contraseña contra Supabase Auth (nunca
 * comparar hashes por SQL) — ver mismo criterio en `cambiar-password-form.tsx`.
 *
 * `persistSession: false` es crítico: en un cliente normal ligado a cookies
 * (`lib/supabase/server.ts`), llamar `signInWithPassword()` escribiría una
 * sesión NUEVA en las cookies de la petición, pisando la sesión real de quien
 * la invoca. Este cliente vive solo durante la llamada y nunca toca cookies
 * ni la sesión de nadie.
 */
export function createAuthVerificationClient() {
  if (typeof window !== "undefined") {
    throw new Error("createAuthVerificationClient() solo puede usarse en el servidor.");
  }

  return createSupabaseClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
