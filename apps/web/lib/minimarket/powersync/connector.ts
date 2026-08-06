/**
 * Conector de PowerSync hacia Supabase para el vertical Minimarket.
 *
 *  - fetchCredentials(): entrega el endpoint de la instancia PowerSync y el
 *    access token de Supabase (la instancia se configura para confiar en el JWT
 *    de Supabase; no hace falta un endpoint propio de tokens).
 *  - uploadData(): reproduce la cola local de mutaciones contra Supabase con el
 *    cliente autenticado del usuario, respetando RLS (write-path server-authoritative).
 */
import type {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from "@powersync/web";
import { createBrowserClient, type SupabaseClient } from "@arkiteq/db";
import { applyCrudEntry, createSupabaseWriter, ErrorSubidaPermanente } from "./crud-writer";

export class SupabaseConnector implements PowerSyncBackendConnector {
  private readonly supabase: SupabaseClient;

  constructor(private readonly endpoint: string) {
    this.supabase = createBrowserClient();
  }

  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const { data, error } = await this.supabase.auth.getSession();
    if (error || !data.session) return null;
    return { endpoint: this.endpoint, token: data.session.access_token };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    const writer = createSupabaseWriter(this.supabase);
    for (const entry of transaction.crud) {
      try {
        await applyCrudEntry(writer, {
          op: entry.op,
          table: entry.table,
          id: entry.id,
          opData: entry.opData,
        });
      } catch (err) {
        if (err instanceof ErrorSubidaPermanente) {
          // Los datos de ESTA entrada son inválidos (viola una restricción de
          // la tabla) — reintentarla nunca va a funcionar. Se descarta solo
          // esta entrada (se sigue con el resto del lote) en vez de lanzar,
          // que bloquearía la cola entera para siempre reintentando lo mismo
          // sin éxito posible (consumiendo red y CPU sin parar en cada ciclo
          // de sincronización, en cualquier página del vertical).
          console.error(
            `[PowerSync] Se descartó una entrada con datos inválidos (no se puede subir): ${entry.table} ${entry.op} ${entry.id} — ${err.message}`,
          );
          continue;
        }
        throw err; // error transitorio (red, servidor, auth): reintenta todo el lote después.
      }
    }

    // Confirma el lote: PowerSync lo retira de la cola. Si algo lanzó arriba
    // (error transitorio), no se confirma y se reintentará en el próximo ciclo.
    await transaction.complete();
  }
}
