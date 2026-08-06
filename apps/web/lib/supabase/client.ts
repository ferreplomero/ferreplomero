import { createBrowserClient } from "@arkiteq/db";

/** Cliente Supabase para Client Components (navegador). */
export function createClient() {
  return createBrowserClient();
}
