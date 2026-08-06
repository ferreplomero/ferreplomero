import { cookies } from "next/headers";
import { createServerClient } from "@arkiteq/db/server";

/**
 * Cliente Supabase para el servidor, ligado a las cookies de la petición.
 * Úsalo en Server Components, Server Actions y Route Handlers.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (toSet) => {
      try {
        for (const { name, value, options } of toSet) {
          cookieStore.set(name, value, options);
        }
      } catch {
        // En Server Components no se pueden escribir cookies; el refresco de
        // sesión lo realiza el middleware. Ignorar es el patrón recomendado.
      }
    },
  });
}
