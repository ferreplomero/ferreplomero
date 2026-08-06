/**
 * Convierte una imagen (WebP/PNG/JPEG, la que sea) a un buffer PNG para
 * incrustarla en el PDF (`@react-pdf/renderer`) o el Excel (`exceljs`) del
 * presupuesto — ninguna de las dos librerías soporta WebP (el formato en el
 * que quedan casi todas las fotos de producto, ver
 * `lib/minimarket/comprimir-imagen.ts`), así que hace falta reconvertir.
 *
 * Tolerante a fallos: cualquier error (red, imagen inválida, url vacía)
 * devuelve `null` en vez de lanzar — un presupuesto nunca debe fallar por una
 * foto de producto rota o inaccesible; esa línea simplemente queda sin
 * miniatura (placeholder) en el documento exportado.
 */
import sharp from "sharp";

const TIMEOUT_MS = 8000;

export async function convertirImagenAPng(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return await sharp(Buffer.from(arrayBuffer)).png().toBuffer();
  } catch {
    return null;
  }
}

/**
 * Convierte varias URLs en paralelo, cacheando por URL — varias líneas que
 * comparten el mismo producto (o el logo, si coincidiera) no descargan ni
 * convierten la misma imagen dos veces.
 */
export async function convertirImagenesAPng(
  urls: (string | null)[],
): Promise<Map<string, Buffer | null>> {
  const unicas = [...new Set(urls.filter((u): u is string => !!u))];
  const resultados = await Promise.all(unicas.map((u) => convertirImagenAPng(u)));
  return new Map(unicas.map((u, i) => [u, resultados[i] ?? null]));
}
