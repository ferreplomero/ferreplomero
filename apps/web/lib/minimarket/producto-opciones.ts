/**
 * Opciones y cálculos del producto, compartidos entre el formulario y la lista.
 * Los impuestos se DERIVAN de la capa de país (@arkiteq/core/country) para no
 * incrustar tasas en la lógica del vertical.
 */
import type { CountryConfig } from "@arkiteq/core";

/**
 * Unidades de medida predefinidas para el selector. El usuario puede añadir las
 * suyas (la columna `unidad` es texto libre); estas son solo las sugeridas.
 */
export const UNIDADES_PREDEFINIDAS: { value: string; label: string }[] = [
  { value: "unidad", label: "Unidad" },
  { value: "kg", label: "Kilogramo (kg)" },
  { value: "g", label: "Gramo (g)" },
  { value: "l", label: "Litro (L)" },
  { value: "ml", label: "Mililitro (ml)" },
  { value: "caja", label: "Caja" },
  { value: "paquete", label: "Paquete" },
  { value: "docena", label: "Docena" },
  { value: "sixpack", label: "Six-pack" },
  { value: "bulto", label: "Bulto" },
  { value: "saco", label: "Saco" },
];

/** Tipo de venta del producto: por unidad o a granel (por peso). */
export const TIPOS_VENTA: { value: "unidad" | "granel"; label: string }[] = [
  { value: "unidad", label: "Por unidad" },
  { value: "granel", label: "A granel (por peso)" },
];

/** Unidades que tienen sentido según el tipo de venta (granel = peso/volumen). */
export function unidadesSugeridas(
  tipoVenta: "unidad" | "granel",
): { value: string; label: string }[] {
  if (tipoVenta === "granel") {
    const pesoValores = ["kg", "g", "l", "ml"];
    return UNIDADES_PREDEFINIDAS.filter((u) => pesoValores.includes(u.value));
  }
  return UNIDADES_PREDEFINIDAS;
}

/**
 * SKU autogenerado: prefijo de 3 letras del nombre + correlativo de 4 dígitos.
 * Ej. ("Harina de maíz", 7) -> "HAR-0007". Respaldo "PRD" si no hay letras.
 */
export function generarSku(nombre: string, secuencia: number): string {
  // NFD + quitar todo lo que no sea a-z (las marcas de acento se descartan aquí).
  const letras = nombre
    .normalize("NFD")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase();
  const prefijo = (letras.slice(0, 3) || "PRD").padEnd(3, "X");
  return `${prefijo}-${String(secuencia).padStart(4, "0")}`;
}

export interface OpcionImpuesto {
  id: string;
  label: string;
  /** Fracción: 0.16 = 16 %. */
  rate: number;
}

/**
 * Impuestos aplicables a un producto (clasificación fiscal), derivados de la
 * configuración de país: exento / IVA del país / otro. El IGTF NO va aquí: es un
 * impuesto a pagos en divisa y se modela como booleano por producto (`aplica_igtf`).
 */
export function opcionesImpuesto(country: CountryConfig): OpcionImpuesto[] {
  const opciones: OpcionImpuesto[] = [{ id: "exento", label: "Exento", rate: 0 }];
  for (const t of country.taxes) {
    opciones.push({ id: t.id, label: `${t.label} ${Math.round(t.rate * 100)}%`, rate: t.rate });
  }
  opciones.push({ id: "otro", label: "Otro", rate: 0 });
  return opciones;
}

/** Etiqueta legible de un impuesto por su id (respaldo: el propio id). */
export function etiquetaImpuesto(country: CountryConfig, id: string): string {
  return opcionesImpuesto(country).find((o) => o.id === id)?.label ?? id;
}

/**
 * Defaults fiscales para un producto NUEVO (alta manual o carga masiva),
 * heredados de la configuración fiscal del negocio (Configuración →
 * Parámetros): si el negocio trabaja con IVA, el producto nace gravado con
 * el IVA del país; si no, nace exento. El IGTF nace activo/inactivo según el
 * interruptor general del negocio. Estos son solo el punto de partida — un
 * producto marcado explícitamente como Exento sigue exento sin importar la
 * config (nunca se pisa), y el usuario puede cambiar cualquiera de los dos
 * campos a mano al crear o editar.
 */
export function defaultsFiscalesProducto(
  country: CountryConfig,
  negocio: { ivaActivo: boolean; igtfActivo: boolean },
): { impuestoId: string; aplicaIgtf: boolean } {
  const ivaId = country.taxes[0]?.id ?? "exento";
  return {
    impuestoId: negocio.ivaActivo ? ivaId : "exento",
    aplicaIgtf: negocio.igtfActivo,
  };
}

/**
 * Margen sobre costo en porcentaje (markup): (venta − costo) / costo · 100.
 * Devuelve null si el costo no es positivo (no se puede calcular un margen).
 */
export function margenSobreCosto(costo: number, precio: number): number | null {
  if (!Number.isFinite(costo) || !Number.isFinite(precio) || costo <= 0) return null;
  return ((precio - costo) / costo) * 100;
}

/** Precio de venta a partir del costo y un margen sobre costo (%). */
export function precioDesdeMargen(costo: number, margenPct: number): number {
  return costo * (1 + margenPct / 100);
}
