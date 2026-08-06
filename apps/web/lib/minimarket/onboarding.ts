/**
 * Aprovisionamiento inicial del vertical Minimarket, la PRIMERA vez que un
 * tenant obtiene acceso (demo 24h o Plan Mensual aprobado) — para que el
 * usuario no tenga que configurar nada a mano antes de poder vender:
 *
 *  - `mm_config_negocio`: IVA e IGTF APAGADOS por defecto (que el dueño los
 *    prenda si los necesita, nunca al revés), fuente de tasa BCV, y
 *    `datos_completados_en` en NULL a propósito — eso fuerza el asistente
 *    guiado en `/minimarket/bienvenida` la primera vez que el dueño entra
 *    (ver `lib/minimarket/permisos.ts` y el layout del vertical). Las
 *    categorías de inventario ya NO se precargan aquí: el propio asistente
 *    las crea según el tipo de negocio que el dueño elija
 *    (`lib/minimarket/tipos-negocio.ts`).
 *  - `mm_sucursales`: una sucursal "Principal" activa.
 *  - `mm_usuarios_sucursal`: el dueño queda asignado a esa sucursal con rol
 *    "dueno" (su nombre se resuelve de `profiles` donde se lo necesite, esta
 *    tabla no lo duplica).
 *  - `mm_tasas_cambio`: BCV y Euro BCV YA sincronizadas — nunca entra a ver
 *    tasas en cero. Primero copia la última conocida de
 *    `platform_tasas_cambio` (el cron de plataforma la mantiene fresca cada
 *    12h, sin depender de red en este momento); si la plataforma tampoco la
 *    tiene aún, intenta traerla en vivo (y si eso también falla por falta de
 *    conexión, no rompe el aprovisionamiento — el cron o el dueño la
 *    completan después).
 *  - `mm_caja_sesiones`: una caja ya ABIERTA en $0,00 / Bs 0,00, para que el
 *    dueño pueda vender de inmediato sin el paso de abrir caja a mano (el
 *    tablero avisa de esto de forma descartable, ver
 *    `components/minimarket/tablero/avisos-bienvenida.tsx`).
 *
 * Idempotente: si el tenant YA tiene una sucursal, una config, una tasa de
 * un tipo dado, o alguna sesión de caja (negocio que el dueño ya venía
 * operando), no toca esa parte — nunca resetea ajustes existentes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@arkiteq/db";
import { getTasaPlataformaPorTipo } from "@/lib/platform/tasa";
import { refreshTasaAuto } from "./exchange-rate";
// Registra las fuentes 'bcv' y 'euro' como efecto secundario (respaldo en vivo).
import "./rate-sources";

type Client = SupabaseClient<Database>;

/**
 * Deja lista la tasa `tipo` (bcv/euro) del tenant si aún no tiene ninguna:
 * copia la última conocida de plataforma o, en su defecto, la trae en vivo.
 * Nunca lanza — un fallo aquí no debe tumbar el resto del aprovisionamiento.
 */
async function sincronizarTasaInicial(
  supabase: Client,
  tenantId: string,
  tipo: "bcv" | "euro",
): Promise<void> {
  const { data: existente } = await supabase
    .from("mm_tasas_cambio")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("tipo", tipo)
    .limit(1)
    .maybeSingle();
  if (existente) return;

  try {
    const plataforma = await getTasaPlataformaPorTipo(supabase, tipo);
    if (plataforma) {
      const { error } = await supabase.from("mm_tasas_cambio").insert({
        tenant_id: tenantId,
        valor: plataforma.valor,
        fuente: "auto",
        tipo,
      });
      if (error) {
        console.error(`[aprovisionarMinimarketInicial] tasa ${tipo} (plataforma):`, error);
      }
      return;
    }

    // Respaldo: la plataforma tampoco la tiene aún (cron nunca corrió) —
    // intenta traerla en vivo. Si no hay conexión, se queda pendiente para
    // el próximo cron o para que el dueño la escriba a mano.
    await refreshTasaAuto(supabase, tenantId, tipo);
  } catch (err) {
    console.error(`[aprovisionarMinimarketInicial] tasa ${tipo}:`, err);
  }
}

export async function aprovisionarMinimarketInicial(
  supabase: Client,
  tenantId: string,
  duenoProfileId: string,
): Promise<void> {
  const [{ data: config }, { data: sucursalExistente }, { data: sesionCajaExistente }] =
    await Promise.all([
      supabase.from("mm_config_negocio").select("id").eq("tenant_id", tenantId).maybeSingle(),
      supabase
        .from("mm_sucursales")
        .select("id")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("mm_caja_sesiones")
        .select("id")
        .eq("tenant_id", tenantId)
        .limit(1)
        .maybeSingle(),
    ]);

  if (!config) {
    const { error } = await supabase.from("mm_config_negocio").insert({
      tenant_id: tenantId,
      fuente_tasa: "bcv",
      parametros: { igtf_activo: false, iva_activo: false },
    });
    if (error) console.error("[aprovisionarMinimarketInicial] mm_config_negocio:", error);
  }

  await Promise.all([
    sincronizarTasaInicial(supabase, tenantId, "bcv"),
    sincronizarTasaInicial(supabase, tenantId, "euro"),
  ]);

  let sucursalId = sucursalExistente?.id ?? null;
  if (!sucursalId) {
    const { data: nuevaSucursal, error } = await supabase
      .from("mm_sucursales")
      .insert({ tenant_id: tenantId, nombre: "Principal", activa: true })
      .select("id")
      .single();
    if (error) console.error("[aprovisionarMinimarketInicial] mm_sucursales:", error);
    sucursalId = nuevaSucursal?.id ?? null;
  }

  if (sucursalId) {
    const { data: rolDueno } = await supabase
      .from("mm_roles")
      .select("id")
      .eq("slug", "dueno")
      .is("tenant_id", null)
      .maybeSingle();

    if (rolDueno) {
      const { error } = await supabase.from("mm_usuarios_sucursal").upsert(
        {
          tenant_id: tenantId,
          profile_id: duenoProfileId,
          sucursal_id: sucursalId,
          rol_id: rolDueno.id,
          activo: true,
          deleted_at: null,
        },
        { onConflict: "tenant_id,profile_id,sucursal_id" },
      );
      if (error) console.error("[aprovisionarMinimarketInicial] mm_usuarios_sucursal:", error);
    } else {
      console.error("[aprovisionarMinimarketInicial] rol 'dueno' predefinido no encontrado.");
    }

    if (!sesionCajaExistente) {
      const { error } = await supabase.from("mm_caja_sesiones").insert({
        tenant_id: tenantId,
        sucursal_id: sucursalId,
        usuario_id: duenoProfileId,
        monto_inicial_usd: 0,
        monto_inicial_bs: 0,
        estado: "abierta",
      });
      if (error) console.error("[aprovisionarMinimarketInicial] mm_caja_sesiones:", error);
    }
  }
}
