/**
 * Redimensiona y comprime una imagen en el navegador ANTES de subirla —
 * fotos de cámara suelen pesar varios MB y a este tamaño (tarjetas/listas de
 * producto) nunca hace falta más resolución que una miniatura. Evita saturar
 * Supabase Storage y que las listas de Inventario/POS carguen lento.
 *
 * Estrategia: reescala al lado más largo (nunca agranda una imagen ya
 * pequeña), codifica en WebP si el navegador lo soporta (mejor compresión a
 * igual calidad visual) o JPEG como respaldo, y baja la calidad en pasos
 * hasta quedar bajo el peso objetivo o agotar los intentos — lo que pase
 * primero, para no degradar de más una imagen que ya es liviana.
 */
const LADO_MAXIMO_PX = 640;
const PESO_OBJETIVO_BYTES = 150 * 1024;
const CALIDADES = [0.82, 0.7, 0.58, 0.45];

function soportaWebp(): boolean {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

/** `createImageBitmap` es lo ideal (no bloquea, libera memoria con `.close()`),
 * pero algunos navegadores/formatos fallan con él — respaldo vía `<img>`. */
async function cargarFuenteDibujable(blob: Blob): Promise<{
  fuente: ImageBitmap | HTMLImageElement;
  ancho: number;
  alto: number;
  cerrar: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        fuente: bitmap,
        ancho: bitmap.width,
        alto: bitmap.height,
        cerrar: () => bitmap.close(),
      };
    } catch {
      // sigue al respaldo con <img>
    }
  }
  const url = URL.createObjectURL(blob);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("No se pudo leer la imagen."));
    el.src = url;
  });
  return {
    fuente: img,
    ancho: img.naturalWidth,
    alto: img.naturalHeight,
    cerrar: () => URL.revokeObjectURL(url),
  };
}

function canvasABlob(
  canvas: HTMLCanvasElement,
  tipo: string,
  calidad: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, calidad));
}

/** Comprime `origen` a una miniatura liviana. Lanza si el navegador no puede procesarla. */
export async function comprimirImagen(origen: Blob): Promise<File> {
  const { fuente, ancho, alto, cerrar } = await cargarFuenteDibujable(origen);
  try {
    const escala = Math.min(1, LADO_MAXIMO_PX / Math.max(ancho, alto));
    const anchoFinal = Math.max(1, Math.round(ancho * escala));
    const altoFinal = Math.max(1, Math.round(alto * escala));

    const canvas = document.createElement("canvas");
    canvas.width = anchoFinal;
    canvas.height = altoFinal;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Este navegador no puede procesar imágenes.");
    ctx.drawImage(fuente, 0, 0, anchoFinal, altoFinal);

    const mime = soportaWebp() ? "image/webp" : "image/jpeg";
    let mejorBlob: Blob | null = null;
    for (const calidad of CALIDADES) {
      const blob = await canvasABlob(canvas, mime, calidad);
      if (!blob) continue;
      mejorBlob = blob;
      if (blob.size <= PESO_OBJETIVO_BYTES) break;
    }
    if (!mejorBlob) throw new Error("No se pudo comprimir la imagen.");

    const extension = mime === "image/webp" ? "webp" : "jpg";
    return new File([mejorBlob], `producto.${extension}`, { type: mime });
  } finally {
    cerrar();
  }
}
