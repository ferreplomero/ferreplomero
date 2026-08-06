import { NextResponse, type NextRequest } from "next/server";
import { MINIMARKET_BASE } from "@/lib/minimarket/nav";

export const dynamic = "force-dynamic";

/**
 * Punto de entrada al vertical tras ACTIVAR LA DEMO o ENVIAR EL PAGO. Siempre
 * va al tablero (la bienvenida es opcional — nunca un fork obligatorio, ver
 * `MinimarketLayout`) usando un 307 real en vez de un `redirect()` de capa de
 * render.
 *
 * Por qué existe igual (pantalla en negro): el layout del vertical es
 * `async` (consulta suscripción, config, permisos…) y Next hace streaming del
 * shell exterior —oscuro— antes de que resuelva. Si el caller navegara
 * directo a `/minimarket` con una navegación blanda justo en ese instante,
 * podría quedarse con ese shell vacío hasta recargar a mano. Un Route Handler
 * no tiene ese problema: `NextResponse.redirect` es un 307 real, así que el
 * navegador carga el tablero directo, igual que una recarga limpia.
 */
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL(MINIMARKET_BASE, request.url));
}
