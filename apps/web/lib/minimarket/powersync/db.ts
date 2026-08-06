/**
 * Inicialización de la base local de PowerSync (SQLite en el dispositivo).
 *
 * Este módulo importa el SDK de navegador (WASM/Web Workers); SOLO debe cargarse
 * de forma dinámica en el cliente (ver PowerSyncProvider), nunca en SSR/build.
 *
 * Si `NEXT_PUBLIC_POWERSYNC_URL` no está definida (aún sin provisionar la
 * instancia), la base local se crea igual para operar offline, pero no se conecta.
 */
import { PowerSyncDatabase, type AbstractPowerSyncDatabase } from "@powersync/web";
import { AppSchema } from "./schema";
import { SupabaseConnector } from "./connector";

let singleton: AbstractPowerSyncDatabase | null = null;

/**
 * Pide al navegador que el storage de este origen sea "persistente" (no
 * elegible para el borrado automático que hacen Chrome/Android bajo presión
 * de espacio en disco). Protege la base local de PowerSync (IndexedDB) — sin
 * esto, un dispositivo modesto con poco espacio podría perder ventas o
 * movimientos aún no sincronizados.
 *
 * Best-effort: si la API no existe, si el navegador deniega el permiso, o si
 * la llamada falla por cualquier motivo, se registra en consola y se sigue
 * igual — nunca debe impedir que PowerSync se inicialice y la app funcione.
 */
async function solicitarStoragePersistente(): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return;
    const yaPersistente = await navigator.storage.persisted?.();
    if (yaPersistente) return;
    const concedido = await navigator.storage.persist();
    if (!concedido) {
      console.warn(
        "[PowerSync] Storage persistente no concedido por el navegador — los datos locales podrían liberarse bajo presión de espacio.",
      );
    }
  } catch (error) {
    console.error("[PowerSync] No se pudo solicitar storage persistente:", error);
  }
}

export async function createPowerSyncDatabase(): Promise<AbstractPowerSyncDatabase> {
  if (singleton) return singleton;

  // No se espera (fire-and-forget): es una petición de permiso al navegador,
  // independiente de la base local — no debe retrasar `db.init()`/`connect()`.
  void solicitarStoragePersistente();

  const db = new PowerSyncDatabase({
    schema: AppSchema,
    database: { dbFilename: "arkiteq-minimarket.db" },
  });

  await db.init();

  const endpoint = process.env.NEXT_PUBLIC_POWERSYNC_URL;
  if (endpoint) {
    await db.connect(new SupabaseConnector(endpoint));
  }

  singleton = db;
  return db;
}
