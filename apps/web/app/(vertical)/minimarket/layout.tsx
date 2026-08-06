import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionContext } from "@/lib/auth/session";
import { getDisplayName } from "@/lib/auth/display-name";
import { createClient } from "@/lib/supabase/server";
import { getPlatformSettings } from "@/lib/platform/settings";
import { PowerSyncProvider } from "@/components/minimarket/powersync-provider";
import { VerticalShell } from "@/components/minimarket/vertical-shell";
import { MINIMARKET_BASE } from "@/lib/minimarket/nav";
import { moduloPermitido, resolverContextoPermisos } from "@/lib/minimarket/permisos";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { saludoPorHora } from "@/lib/saludo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Minimarket", template: "%s · Minimarket" },
};

/**
 * Layout del vertical Minimarket. Vive en su propio grupo de rutas (fuera del
 * shell de plataforma) para tomar la pantalla completa con su shell propio.
 * Sistema de un solo cliente dedicado: el acceso siempre está abierto para el
 * tenant activo, sin estados de suscripción/demo/pago. La única restricción
 * de acceso es el rol operativo (sección 6.9): un miembro con rol de cajero o
 * almacén no puede entrar a módulos fuera de su rol.
 */
export default async function MinimarketLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const tenantId = session.activeTenant?.id;
  if (!tenantId) redirect("/login");

  const supabase = await createClient();

  const [
    { data: configBase, error: configError },
    { data: configSaldos, error: configSaldosError },
    tz,
    platformSettings,
  ] = await Promise.all([
    // Consulta MÍNIMA y ROBUSTA para saber si el negocio ya completó el
    // onboarding: toca SOLO columnas de larga data (`nombre_comercial` y
    // `datos_completados_en`, esta última desde la migración 0040). La
    // bienvenida NUNCA bloquea el acceso (ver `necesitaDatosIniciales` más
    // abajo) — esta bandera solo decide si se ofrece la tarjeta opcional
    // "Completa los datos de tu negocio" en el tablero (`NegocioCard`).
    supabase
      .from("mm_config_negocio")
      .select("nombre_comercial, datos_completados_en")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    // Consulta APARTE (mismo criterio de "falla abierto" que la de arriba)
    // para el aviso de medios de pago y saldo inicial (migración 0106): si
    // estas columnas fallan por lo que sea, solo se apaga ese aviso, nunca la
    // compuerta del onboarding de datos iniciales de arriba.
    supabase
      .from("mm_config_negocio")
      .select("medios_saldos_completados_en, medios_saldos_aviso_visto_en, medios_saldos_es_legado")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    getTimezoneNegocio(supabase, tenantId),
    getPlatformSettings(),
  ]);
  if (configError) {
    console.error("[MinimarketLayout] mm_config_negocio (base):", configError);
  }
  if (configSaldosError) {
    console.error("[MinimarketLayout] mm_config_negocio (medios/saldos):", configSaldosError);
  }
  // Este layout envuelve TODA página del vertical y se re-ejecuta en cada
  // navegación (incluida Ventas, la más visitada) — las consultas de arriba
  // son independientes entre sí (ninguna necesita el resultado de otra), así
  // que se piden en paralelo en vez de en cadena.
  const [permisos, { data: membresia }] = await Promise.all([
    resolverContextoPermisos(supabase, tenantId, session.user.id),
    supabase
      .from("memberships")
      .select("onboarding_minimarket_completado_en")
      .eq("tenant_id", tenantId)
      .eq("profile_id", session.user.id)
      .maybeSingle(),
  ]);

  const pathname = (await headers()).get("x-pathname") ?? MINIMARKET_BASE;
  const enBienvenida = pathname.startsWith(`${MINIMARKET_BASE}/bienvenida`);

  if (!moduloPermitido(pathname, permisos)) {
    redirect(`${MINIMARKET_BASE}?acceso=restringido`);
  }

  // Onboarding guiado de datos iniciales del negocio (nombre, RIF, tipo de
  // negocio -> precarga categorías, ver app/(vertical)/minimarket/bienvenida):
  // es OPCIONAL — NUNCA redirige ni bloquea el acceso al resto del vertical,
  // completada o no. `necesitaDatosIniciales` solo indica si al dueño /
  // administrador (`puedeConfigurar`; un cajero nunca ve este aviso) todavía
  // le falta pasar por ahí, para ofrecerle la tarjeta descartable en el
  // tablero (`NegocioCard`). Si nunca la completa, el sistema sigue
  // funcionando con los valores por defecto (nombre genérico, sin RIF/rubro).
  const puedeConfigurar = moduloPermitido(`${MINIMARKET_BASE}/configuracion`, permisos);
  const necesitaDatosIniciales =
    puedeConfigurar && !configError && !configBase?.datos_completados_en;

  // El nombre comercial configurado en `mm_config_negocio` (bienvenida o
  // Configuración) es la fuente de verdad de cara al usuario; `tenants.name`
  // es solo el nombre interno genérico que se asigna una única vez al
  // registrarse y nunca se actualiza — sin este fallback a config, el
  // encabezado seguía mostrando ese nombre genérico aunque el negocio ya
  // hubiera guardado su nombre real.
  const businessName = configBase?.nombre_comercial || session.activeTenant?.name || "Tu negocio";

  // Tour de bienvenida de Arki: solo la primera vez (marca en `memberships`,
  // nunca en localStorage — debe respetarse aunque entre desde otro
  // dispositivo). Tampoco se muestra mientras el usuario sigue EN
  // `/minimarket/bienvenida`: ese asistente va primero y solo, sin Arki
  // superpuesto — Arki recibe al usuario DESPUÉS, ya en el tablero (ver
  // `ArkiTour`, que reacciona a este valor pasando de `false` a `true` tras
  // la navegación, no solo al montar).
  const mostrarOnboarding = !enBienvenida && !membresia?.onboarding_minimarket_completado_en;

  // La pantalla de bienvenida (saludo por hora + nombre) nunca compite con el
  // tour guiado de Arki (ambos son overlays de "entrada") — solo en el
  // tablero normal, ya recurrente para este usuario.
  const mostrarBienvenida = !enBienvenida && !mostrarOnboarding;
  const nombreUsuario = getDisplayName(session.user);

  // Configuración obligatoria de medios de pago y saldo inicial (migración
  // 0106, bloqueo SUAVE — nunca redirecciones forzadas en cada navegación).
  // Se calcula igual que `necesitaDatosIniciales` (solo a quien puede
  // configurar, y SOLO después de que ese onboarding ya se completó — este
  // paso va después, nunca compite con él) pero NUNCA redirige: solo decide
  // si se muestra el modal (una vez) montado en `VerticalShell`. El aviso
  // persistente (no descartable) que además insiste en el tablero y en
  // Bancos hasta que se complete de verdad vive en esas páginas, no aquí.
  const necesitaMediosSaldos =
    puedeConfigurar &&
    !necesitaDatosIniciales &&
    !configSaldosError &&
    !configSaldos?.medios_saldos_completados_en;
  // Si la consulta falla, se trata como "legado" (modal descartable, nunca el
  // paso de "nuevo cliente") — el criterio más conservador ante un dato que
  // no se pudo leer.
  const esLegadoMediosSaldos = configSaldos?.medios_saldos_es_legado ?? true;
  const mostrarModalSaldosIniciales =
    necesitaMediosSaldos && !enBienvenida && !configSaldos?.medios_saldos_aviso_visto_en;

  return (
    <PowerSyncProvider>
      <VerticalShell
        businessName={businessName}
        permisos={permisos}
        mostrarOnboarding={mostrarOnboarding}
        bienvenida={mostrarBienvenida ? { nombre: nombreUsuario, saludo: saludoPorHora(tz) } : null}
        saldosIniciales={
          mostrarModalSaldosIniciales
            ? { tipo: esLegadoMediosSaldos ? "existente" : "nuevo" }
            : null
        }
        numeroSoporte={platformSettings.soporteWhatsapp}
        contextoSoporte={{
          nombre: nombreUsuario,
          correo: session.user.email ?? "",
          negocio: businessName,
          modulo: "Minimarket",
        }}
      >
        {children}
      </VerticalShell>
    </PowerSyncProvider>
  );
}
