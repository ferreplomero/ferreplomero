/**
 * PostgREST (Supabase) nunca devuelve más de 1000 filas por consulta salvo que
 * se pida explícitamente con `.range()` — un `.select()` sin límite se corta
 * en 1000 en silencio, sin error. Cualquier tabla del tenant que pueda superar
 * esa cifra (catálogo de productos, stock por sucursal, códigos de barra…)
 * tiene que paginarse con esto en vez de un `.select()` plano.
 */
export async function fetchAllRows<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
