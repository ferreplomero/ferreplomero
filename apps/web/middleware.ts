import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { APP_HOME, AUTH_ROUTES, PROTECTED_PREFIXES } from "@/lib/site";

/**
 * Middleware de plataforma (Edge runtime — Netlify lo despliega como Edge
 * Function automáticamente vía `@netlify/plugin-nextjs`, sin config aparte).
 *
 * Sigue llamándose `middleware.ts` (Next.js todavía lo acepta aunque muestre
 * un aviso de deprecación por `proxy.ts` en el build; es esperado y seguro).
 *
 * Funciones:
 *  1. Refresca la sesión de Supabase (cookies SSR).
 *  2. Protege las rutas privadas (redirige a /login si no hay sesión).
 *  3. Evita que un usuario autenticado vea login/registro.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Expone la ruta actual a los Server Components (p. ej. el layout del
  // vertical la usa para aplicar permisos por rol operativo).
  request.headers.set("x-pathname", pathname);

  const { response, user } = await updateSession(request);

  // Redirige preservando las cookies que `updateSession` pudo refrescar. Si se
  // devuelve una respuesta de redirect nueva SIN copiarlas, el token rotado se
  // pierde y el usuario cae a /login en la siguiente carga (fallo clásico de
  // Supabase SSR en middleware).
  const redirectPreservando = (url: URL) => {
    const res = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) {
      res.cookies.set(cookie);
    }
    return res;
  };

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  if (isProtected && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("siguiente", pathname);
    return redirectPreservando(redirectUrl);
  }

  if (isAuthRoute && user) {
    return redirectPreservando(new URL(APP_HOME, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Aplica a todo salvo: estáticos de Next, imágenes optimizadas, favicon,
     * archivos con extensión y el callback de auth (que maneja su propia lógica).
     */
    "/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.[\\w]+$).*)",
  ],
};
