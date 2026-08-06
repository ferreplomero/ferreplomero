import { redirect } from "next/navigation";

/**
 * `/minimarket/bancos` ya no es una vista con todo mezclado — cada tipo de
 * cuenta vive en su propia página bajo el submenú del sidebar (ver
 * `lib/minimarket/nav.ts`: "Bancos" ahora se despliega en Pago Móvil,
 * Transferencias, Tarjetas, Zelle y Cashea). Esta ruta se conserva solo para
 * que los links viejos a `/minimarket/bancos` (ej. "Ver Bancos →" en
 * Finanzas) sigan funcionando — redirige a la primera sub-sección.
 */
export default function BancosIndexPage() {
  redirect("/minimarket/bancos/pago-movil");
}
