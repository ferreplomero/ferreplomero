/**
 * Etiquetas de precio para pegar en los productos (Inventario → Etiquetas).
 *
 * Solo LEEN datos: no tocan precios, stock ni dinero. El precio de un
 * producto (`mm_productos.precio_usd`) está guardado SIN IVA; el IVA solo se
 * suma si el producto no es exento, con el % de `parametros.iva_pct` del
 * negocio — mismo criterio que el POS (`pos-calc.ts`). El precio en Bs es el
 * precio en USD por la tasa vigente, igual que en la lista del inventario.
 */

export type TamanoEtiqueta = "pequena" | "mediana" | "grande";
export type MonedaEtiqueta = "bs" | "usd" | "ambas";
export type ModoImpresionEtiqueta = "hoja" | "rollo";

export interface MedidasEtiqueta {
  etiqueta: string;
  /** Medidas físicas de la etiqueta impresa, en milímetros. */
  anchoMm: number;
  altoMm: number;
  /** Tamaños de letra en puntos (pt): nombre del negocio, producto, precio principal, secundario. */
  negocioPt: number;
  productoPt: number;
  precioPt: number;
  secundarioPt: number;
  /** Alto del código de barras en milímetros. */
  barrasMm: number;
  /** Margen interno y separación entre líneas, en milímetros (más finos en la
   * pequeña para que nombre, precios, SKU y código de barras quepan con holgura). */
  paddingMm: number;
  gapMm: number;
}

export const TAMANOS_ETIQUETA: Record<TamanoEtiqueta, MedidasEtiqueta> = {
  pequena: {
    etiqueta: "Pequeña (50 × 25 mm)",
    anchoMm: 50,
    altoMm: 25,
    negocioPt: 5,
    productoPt: 7,
    precioPt: 12,
    secundarioPt: 6,
    barrasMm: 4.5,
    paddingMm: 1,
    gapMm: 0.2,
  },
  mediana: {
    etiqueta: "Mediana (70 × 40 mm)",
    anchoMm: 70,
    altoMm: 40,
    negocioPt: 6.5,
    productoPt: 9,
    precioPt: 17,
    secundarioPt: 7.5,
    barrasMm: 9,
    paddingMm: 1.5,
    gapMm: 0.4,
  },
  grande: {
    etiqueta: "Grande (100 × 60 mm)",
    anchoMm: 100,
    altoMm: 60,
    negocioPt: 8,
    productoPt: 12,
    precioPt: 26,
    secundarioPt: 10,
    barrasMm: 13,
    paddingMm: 2,
    gapMm: 0.6,
  },
};

const redondear = (n: number) => Math.round(n * 100) / 100;

export interface PrecioEtiquetaInput {
  /** Precio del producto en USD, sin IVA (tal como está guardado). */
  precioUsd: number;
  impuestoId: string;
  /** % de IVA del negocio (16 = 16 %). */
  ivaPct: number;
  conIva: boolean;
  /** Tasa vigente Bs/USD; null si el negocio aún no tiene tasa. */
  tasa: number | null;
}

export interface PrecioEtiqueta {
  usd: number;
  /** null si no hay tasa: la etiqueta no puede mostrar Bs. */
  bs: number | null;
  exento: boolean;
}

/** Precio que lleva la etiqueta según las opciones elegidas. */
export function precioEtiqueta(input: PrecioEtiquetaInput): PrecioEtiqueta {
  const exento = input.impuestoId === "exento";
  const base = Number.isFinite(input.precioUsd) ? input.precioUsd : 0;
  const factor = input.conIva && !exento && input.ivaPct > 0 ? 1 + input.ivaPct / 100 : 1;
  const usd = redondear(base * factor);
  const bs = input.tasa && input.tasa > 0 ? redondear(usd * input.tasa) : null;
  return { usd, bs, exento };
}

/** Leyenda de impuesto bajo el precio. */
export function leyendaIvaEtiqueta(conIva: boolean, exento: boolean): string {
  if (exento) return "Exento de IVA";
  return conIva ? "IVA incluido" : "Precio sin IVA";
}

const fmtNumero = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "USD 17,40" */
export function fmtUsdEtiqueta(valor: number): string {
  return `USD ${fmtNumero.format(valor)}`;
}

/** "Bs 15.256,32" */
export function fmtBsEtiqueta(valor: number): string {
  return `Bs ${fmtNumero.format(valor)}`;
}

/**
 * Factor (0,6–1) para achicar la letra del nombre del producto según su largo,
 * de modo que nombres largos entren completos en la etiqueta en vez de
 * cortarse. Referencia: caracteres que caben cómodos en 2 líneas por tamaño.
 */
export function escalaNombreEtiqueta(nombre: string, tamano: TamanoEtiqueta): number {
  const comodos = tamano === "pequena" ? 34 : tamano === "mediana" ? 44 : 56;
  const largo = nombre.trim().length;
  if (largo <= comodos) return 1;
  return Math.max(0.6, Math.round((comodos / largo) * 100) / 100);
}
