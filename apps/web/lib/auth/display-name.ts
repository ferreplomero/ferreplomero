import type { User } from "@supabase/supabase-js";

/** Nombre para mostrar al usuario: metadata.full_name, o el usuario del email como respaldo. */
export function getDisplayName(
  user: Pick<User, "user_metadata" | "email"> | null | undefined,
): string {
  if (!user) return "";
  return (user.user_metadata?.full_name as string | undefined) ?? user.email?.split("@")[0] ?? "";
}
