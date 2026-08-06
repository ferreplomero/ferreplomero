/**
 * Reintenta una operación asíncrona que devuelve `boolean` (éxito/fracaso)
 * hasta que tenga éxito o se agoten los intentos.
 *
 * Caso de uso: al montar el POS, la base local de PowerSync tarda un
 * instante en inicializar (WASM + IndexedDB). Si el cajero cierra el diálogo
 * de cobro en esa ventana exacta, la función de guardado (cerrada sobre el
 * valor de `powerSyncDb` de ESE render) puede capturar `null` aunque un
 * instante después ya esté lista — sin reintento, esa venta en espera se
 * pierde en silencio. `reintentar` cubre justo esa carrera: como cada
 * intento se hace llamando a `intentar()` de nuevo (no una promesa cacheada),
 * si el llamador pasa siempre la versión más reciente de la función (p.ej.
 * leyendo un ref actualizado en cada render), cada reintento ve el estado
 * más actual.
 */
export interface OpcionesReintentar {
  /** Cuántas veces llamar a `intentar` como máximo (incluye el primer intento). */
  intentos?: number;
  /** Espera entre intentos, en milisegundos. */
  esperaMs?: number;
}

export async function reintentar(
  intentar: () => Promise<boolean>,
  opciones: OpcionesReintentar = {},
): Promise<boolean> {
  const { intentos = 10, esperaMs = 300 } = opciones;
  for (let i = 0; i < intentos; i++) {
    const ok = await intentar();
    if (ok) return true;
    if (i < intentos - 1) {
      await new Promise((resolve) => setTimeout(resolve, esperaMs));
    }
  }
  return false;
}
