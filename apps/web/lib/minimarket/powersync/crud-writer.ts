/**
 * Traducción de la cola de mutaciones local de PowerSync a escrituras en
 * Supabase. Es la pieza "server-authoritative" del write-path offline-first:
 * cuando vuelve la conexión, cada operación encolada se reproduce contra
 * Postgres con el cliente autenticado del usuario (respeta RLS).
 *
 * La lógica de mapeo (`applyCrudEntry`) es pura y se prueba sin red ni SDK de
 * navegador; importa SOLO `@powersync/common` (sin WASM), por eso vive separada
 * del conector que arranca el motor en el navegador.
 */
import { UpdateType } from "@powersync/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@arkiteq/db";

type Client = SupabaseClient<Database>;
type TableName = keyof Database["public"]["Tables"];

/** Operación pendiente extraída de la cola local (forma de `CrudEntry`). */
export interface PendingCrud {
  op: UpdateType;
  table: string;
  id: string;
  opData?: Record<string, unknown> | null;
}

/**
 * Códigos SQLSTATE de Postgres que indican un problema PERMANENTE con los
 * datos enviados (viola una restricción de la tabla) — reintentar exactamente
 * el mismo payload nunca va a funcionar, a diferencia de un error de red o de
 * servidor (5xx, timeout), donde sí conviene reintentar más tarde. Sin esta
 * distinción, una sola fila local con datos inválidos (ej. de una carrera de
 * inicialización ya corregida en el código, pero cuya fila mala quedó guardada
 * localmente antes de esa corrección) bloquea la cola de subida de PowerSync
 * PARA SIEMPRE — cada ciclo de sincronización la reintenta, sin éxito posible,
 * consumiendo red y CPU sin parar (ver diagnóstico del lector de código de
 * barras: ese bucle infinito saturaba el hilo principal en TODA la app).
 */
const CODIGOS_ERROR_PERMANENTE = new Set([
  "23502", // not_null_violation
  "23503", // foreign_key_violation
  "23505", // unique_violation
  "23514", // check_violation
  "22P02", // invalid_text_representation (ej. UUID inválido)
]);

/** Error de subida que NO se debe reintentar: los datos en sí son inválidos. */
export class ErrorSubidaPermanente extends Error {}

function lanzarError(mensaje: string, codigo: string | undefined): never {
  if (codigo && CODIGOS_ERROR_PERMANENTE.has(codigo)) {
    throw new ErrorSubidaPermanente(mensaje);
  }
  throw new Error(mensaje);
}

/** Destino de escritura. Se abstrae para poder simularlo en pruebas. */
export interface CrudWriter {
  put(table: string, record: Record<string, unknown>): Promise<void>;
  patch(table: string, id: string, changes: Record<string, unknown>): Promise<void>;
  remove(table: string, id: string): Promise<void>;
}

/**
 * Columnas que Postgres modela como `array`/`jsonb` pero que SQLite local
 * guarda serializadas como texto JSON (PowerSync no tiene arrays ni JSON
 * nativos — ver comentario en `powersync/schema.ts`). Antes de subir a
 * Supabase hay que revertir la serialización, si no Postgrest rechaza un
 * string donde espera un array/objeto.
 */
const COLUMNAS_ARRAY_JSON: Partial<Record<TableName, string[]>> = {
  mm_productos: ["etiquetas"],
  mm_ventas_pendientes: ["carrito_json", "pagos_json"],
};

export function normalizarArraysJson(
  table: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const columnas = COLUMNAS_ARRAY_JSON[table as TableName];
  if (!columnas) return data;
  const out = { ...data };
  for (const col of columnas) {
    const valor = out[col];
    if (typeof valor === "string") {
      try {
        out[col] = JSON.parse(valor);
      } catch {
        // Deja el valor tal cual si no era JSON válido; Postgrest lo rechazará
        // con un error explícito en vez de fallar en silencio aquí.
      }
    }
  }
  return out;
}

/**
 * Reproduce UNA operación de la cola sobre el destino dado. Pura y determinista:
 *  - PUT   (insert/replace) -> upsert con el id incluido.
 *  - PATCH (update parcial) -> update de las columnas cambiadas por id.
 *  - DELETE                 -> borrado por id (con soft-delete el cliente emite
 *                              PATCH de deleted_at; DELETE queda para casos duros).
 */
export async function applyCrudEntry(writer: CrudWriter, entry: PendingCrud): Promise<void> {
  const data = entry.opData ?? {};
  switch (entry.op) {
    case UpdateType.PUT:
      return writer.put(entry.table, { ...data, id: entry.id });
    case UpdateType.PATCH:
      return writer.patch(entry.table, entry.id, data);
    case UpdateType.DELETE:
      return writer.remove(entry.table, entry.id);
    default:
      return;
  }
}

/** Crea un `CrudWriter` respaldado por el cliente Supabase autenticado. */
export function createSupabaseWriter(client: Client): CrudWriter {
  return {
    async put(table, record) {
      const { error } = await client
        .from(table as TableName)
        .upsert(normalizarArraysJson(table, record) as never);
      if (error) lanzarError(`PowerSync upload (PUT ${table}): ${error.message}`, error.code);
    },
    async patch(table, id, changes) {
      const { error } = await client
        .from(table as TableName)
        .update(normalizarArraysJson(table, changes) as never)
        .eq("id", id);
      if (error) lanzarError(`PowerSync upload (PATCH ${table}): ${error.message}`, error.code);
    },
    async remove(table, id) {
      const { error } = await client
        .from(table as TableName)
        .delete()
        .eq("id", id);
      if (error) lanzarError(`PowerSync upload (DELETE ${table}): ${error.message}`, error.code);
    },
  };
}
