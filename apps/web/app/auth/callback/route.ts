import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { APP_HOME } from "@/lib/site";
import { asegurarNegocioInicial } from "@/lib/onboarding";

/**
 * Callback de OAuth y de confirmación por correo: intercambia el `code` por una
 * sesión y redirige al destino solicitado (o al inicio de la app).
 *
 * También es el punto donde un usuario nuevo obtiene sesión por primera vez
 * (tanto Google OAuth como el link de confirmación por correo pasan por
 * aquí), así que aquí se asegura que tenga un negocio — sin ningún
 * entitlement de producto (el registro y el acceso a un módulo son cosas
 * separadas; el usuario lo solicita luego desde el catálogo).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("siguiente");
  const next = nextParam && nextParam.startsWith("/") ? nextParam : APP_HOME;

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (data.user) {
        await asegurarNegocioInicial(data.user);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
