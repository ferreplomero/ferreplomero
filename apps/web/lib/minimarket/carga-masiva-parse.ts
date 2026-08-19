import { margenSobreCosto, precioDesdeMargen } from "./producto-opciones";
import type { TipoTasa } from "./exchange-rate";

/** Filas por lote al importar — cada lote es una llamada corta a `cargaMasivaLote`
 * (inserts en batch) en vez de una sola función que procese todo el archivo de una,
 * lo que evitaba el timeout de la función serverless en archivos grandes. */
export const LOTE_TAMANO = 200;

export interface FilaCarga {
  linea: number;
  nombre: string;
  sku: string;
  codigos: string[];
  categoriaNombre: string;
  tipoVenta: "unidad" | "granel";
  unidad: string;
  costo: number;
  precio: number;
  /** true si `precio` se calculó desde `margenPct` (precio_usd venía vacío). */
  precioCalculado: boolean;
  margenPct?: number;
  /** Vacío = sin valor en la columna; se resuelve con el default fiscal del
   * negocio al importar, igual que `aplicaIgtf`. */
  impuesto: string;
  /** undefined = columna vacía → se resuelve con el default fiscal del
   * negocio al importar. Un valor explícito ("si"/"no") siempre gana, sin
   * importar la configuración. */
  aplicaIgtf?: boolean;
  proveedorNombre: string;
  stockInicial: number;
  stockMinimo: number;
  etiquetas: string[];
  /** Tipo de tasa pedido en la fila (columna `tasa`); undefined = usar la del negocio. */
  tasaTipo?: TipoTasa;
  /** Avisos no bloqueantes (margen que no coincide con el precio, tasa no reconocida...). */
  notas: string[];
  /** Fila con formato inválido (falta nombre o precio); no se importa. */
  errorFormato?: string;
}

/** Parser CSV mínimo, consciente de comillas dobles (campos con comas). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let enComillas = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (enComillas) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          enComillas = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      enComillas = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const num = (s: string | undefined): number => Number((s ?? "").replace(",", "."));

const SI_VALORES = new Set(["si", "sí", "1", "true", "x", "verdadero"]);

const partesCelda = (s: string, maxLen: number, max: number) =>
  s
    .split(/[;|]/)
    .map((t) => t.trim().slice(0, maxLen))
    .filter(Boolean)
    .slice(0, max);

/** Normaliza un nombre para comparar (categoría, proveedor, producto): sin
 * mayúsculas ni espacios de más, para que "Lácteos", " lacteos " y "LÁCTEOS "
 * — que el usuario puede escribir distinto en cada fila de su Excel — se
 * traten como el mismo valor y no generen duplicados. */
export function normalizarNombre(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Interpreta la columna `tasa` (bcv/euro/personalizada) de forma flexible. */
function parseTipoTasa(raw: string): TipoTasa | undefined {
  const s = normalizarNombre(raw);
  if (s === "bcv") return "bcv";
  if (s === "euro" || s === "eur") return "euro";
  if (["personalizada", "personalizado", "manual", "digital"].includes(s)) return "manual";
  return undefined;
}

/**
 * Divide el texto CSV completo en líneas de datos: quita la cabecera si la
 * detecta y descarta líneas en blanco. Usado tanto por el servidor (vista
 * previa) como por el cliente (para trocear el archivo en lotes antes de
 * subirlo) — ambos deben ver EXACTAMENTE las mismas líneas con los mismos
 * números, para que los `linea` de la vista previa sigan siendo válidos al
 * confirmar la importación por lotes.
 */
export function dividirLineasCsv(texto: string): { lineas: string[]; errorGeneral?: string } {
  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lineas.length === 0)
    return { lineas: [], errorGeneral: "Sube o pega al menos una fila de datos." };
  const cabecera = lineas[0] ?? "";
  if (/nombre/i.test(cabecera) && /precio/i.test(cabecera)) lineas.shift();
  if (lineas.length === 0) {
    return { lineas: [], errorGeneral: "No hay filas de datos bajo el encabezado." };
  }
  return { lineas };
}

/**
 * Parsea líneas de datos YA divididas (sin cabecera, ver `dividirLineasCsv`)
 * a filas estructuradas, SIN tocar la base de datos. Columnas (en orden):
 *   nombre, sku, codigo_barras, categoria, tipo_venta, unidad, costo_usd,
 *   precio_usd, impuesto, aplica_igtf, proveedor, stock_inicial, stock_minimo,
 *   etiquetas, margen_pct, tasa
 * `lineaInicio` es el número de línea (1-based, sobre el archivo sin
 * cabecera) de `lineas[0]` — permite parsear un lote intermedio del archivo
 * y que los números de línea reportados sigan siendo los del archivo original.
 */
export function parseFilasDesdeLineas(lineas: string[], lineaInicio = 1): FilaCarga[] {
  return lineas.map((linea, i) => {
    const cols = parseCsvLine(linea);
    const nombre = cols[0] ?? "";
    const sku = cols[1] ?? "";
    const codigos = partesCelda(cols[2] ?? "", 64, 10);
    const categoriaNombre = cols[3] ?? "";
    const tipoVenta: "unidad" | "granel" =
      (cols[4] ?? "").trim().toLowerCase() === "granel" ? "granel" : "unidad";
    const unidad = (cols[5] ?? "").trim() || "unidad";
    const costo = num(cols[6]) || 0;
    const precioRaw = (cols[7] ?? "").trim();
    const impuesto = (cols[8] ?? "").trim().toLowerCase();
    const aplicaIgtfRaw = (cols[9] ?? "").trim();
    const aplicaIgtf =
      aplicaIgtfRaw === "" ? undefined : SI_VALORES.has(aplicaIgtfRaw.toLowerCase());
    const proveedorNombre = (cols[10] ?? "").trim();
    const stockInicial = num(cols[11]) || 0;
    const stockMinimo = num(cols[12]) || 0;
    const etiquetas = partesCelda(cols[13] ?? "", 40, 20);
    const margenRaw = (cols[14] ?? "").trim();
    const margenPct = margenRaw === "" ? undefined : num(margenRaw);
    const margenValido = margenPct !== undefined && Number.isFinite(margenPct);
    const tasaRaw = (cols[15] ?? "").trim();
    const tasaTipo = tasaRaw === "" ? undefined : parseTipoTasa(tasaRaw);

    const notas: string[] = [];
    if (tasaRaw !== "" && tasaTipo === undefined) {
      notas.push(
        `Tasa "${tasaRaw}" no reconocida (usa bcv, euro o personalizada); se usó la tasa predeterminada del negocio.`,
      );
    }

    let precio = precioRaw === "" ? NaN : num(precioRaw);
    let precioCalculado = false;
    if (precioRaw === "") {
      if (margenValido && costo > 0) {
        precio = Math.round(precioDesdeMargen(costo, margenPct as number) * 100) / 100;
        precioCalculado = true;
      }
    } else if (margenValido && costo > 0) {
      const margenReal = margenSobreCosto(costo, precio);
      if (margenReal !== null && Math.abs(margenReal - (margenPct as number)) > 1) {
        notas.push(
          `El margen indicado (${margenPct}%) no coincide con el margen real de este precio (${margenReal.toFixed(1)}%); se usó el precio de venta de la columna precio_usd.`,
        );
      }
    }

    let errorFormato: string | undefined;
    if (!nombre) errorFormato = "Falta el nombre.";
    else if (!Number.isFinite(precio) || precio < 0) {
      errorFormato =
        margenRaw !== "" && !(costo > 0)
          ? "Falta el precio de venta (para calcularlo desde el margen también hace falta el costo_usd)."
          : "Falta el precio de venta (o el margen de ganancia junto al costo_usd).";
    }

    return {
      linea: lineaInicio + i,
      nombre,
      sku,
      codigos,
      categoriaNombre,
      tipoVenta,
      unidad,
      costo,
      precio,
      precioCalculado,
      margenPct: margenValido ? margenPct : undefined,
      impuesto,
      aplicaIgtf,
      proveedorNombre,
      stockInicial,
      stockMinimo,
      etiquetas,
      tasaTipo,
      notas,
      errorFormato,
    };
  });
}

/** Conveniencia: parsea el CSV completo (con cabecera) de una sola vez — usado por la vista previa. */
export function parseFilasCsv(texto: string): { filas: FilaCarga[]; errorGeneral?: string } {
  const { lineas, errorGeneral } = dividirLineasCsv(texto);
  if (errorGeneral) return { filas: [], errorGeneral };
  return { filas: parseFilasDesdeLineas(lineas, 1) };
}
