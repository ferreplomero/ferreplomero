/** Iniciales (1-2 letras) a partir de un nombre o, en su defecto, un correo. */
export function getInitials(name: string, email: string): string {
  const source = name.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? email[0] ?? "?";
  const second = parts.length > 1 ? (parts[1]?.[0] ?? "") : "";
  return (first + second).toUpperCase();
}

/** Acepta solo rutas internas seguras; cualquier otra cosa cae a la ruta base. */
export function safeInternalPath(value: string | null | undefined, fallback: string): string {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return fallback;
}
