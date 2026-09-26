import { redirect } from "next/navigation";
import { safeInternalPath } from "@/lib/format";

/**
 * El login vive en la portada "/" (con los colores de la empresa). Esta ruta
 * se conserva solo por compatibilidad (enlaces viejos, redirecciones del
 * servidor) y reenvía a la portada preservando el destino `siguiente`.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ siguiente?: string }>;
}) {
  const { siguiente } = await searchParams;
  const destino = safeInternalPath(siguiente, "");
  redirect(destino ? `/?siguiente=${encodeURIComponent(destino)}` : "/");
}
