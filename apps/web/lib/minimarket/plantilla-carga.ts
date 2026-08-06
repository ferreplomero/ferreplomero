/**
 * Plantilla descargable y lectura de archivos para la carga masiva de
 * inventario. Genera un .xlsx con el formato EXACTO que espera `cargaMasiva`
 * (mismo orden de columnas que la exportación) y sabe convertir cualquier
 * archivo que suba el comercio (.xlsx, .xls o .csv) al mismo texto CSV
 * canónico que ya procesa el servidor, para no duplicar el parser.
 */
import * as XLSX from "xlsx";

/**
 * Orden de columnas — debe coincidir con las posiciones que lee
 * `parseFilasCsv` en `actions.ts`. `margen_pct` y `tasa` se agregaron AL
 * FINAL (no insertadas entre las columnas existentes) para que un archivo
 * exportado o pegado con el formato anterior se siga leyendo sin corrimiento
 * de columnas.
 */
export const COLUMNAS_CARGA = [
  "nombre",
  "sku",
  "codigo_barras",
  "categoria",
  "tipo_venta",
  "unidad",
  "costo_usd",
  "precio_usd",
  "impuesto",
  "aplica_igtf",
  "proveedor",
  "stock_inicial",
  "stock_minimo",
  "etiquetas",
  "margen_pct",
  "tasa",
] as const;

const FILAS_EJEMPLO: (string | number)[][] = [
  [
    "Café Fama de América 500g",
    "CAF-500",
    "7591234500017",
    "Abarrotes",
    "unidad",
    "unidad",
    2.6,
    3.5,
    "iva",
    "si",
    "Distribuidora Polar",
    12,
    4,
    "perecedero",
    "",
    "bcv",
  ],
  [
    // Sin precio_usd: se calcula solo con costo_usd + margen_pct (3.20 × 1.50 = 4.80).
    "Queso blanco (granel)",
    "QUE-GRA",
    "",
    "Charcutería",
    "granel",
    "kg",
    3.2,
    "",
    "exento",
    "si",
    "Lácteos Los Andes",
    10,
    2,
    "frío;perecedero",
    50,
    "",
  ],
  [
    "Jugo Yukery 1.5L",
    "JUG-15",
    "7591234500031",
    "Bebidas",
    "unidad",
    "unidad",
    1.0,
    1.4,
    "iva",
    "si",
    "",
    20,
    6,
    "frío;promoción",
    "",
    "euro",
  ],
];

const INSTRUCCIONES: [string, string][] = [
  ["nombre", "Obligatorio. Nombre del producto tal como debe verse en el inventario y la venta."],
  ["sku", "Opcional. Código interno propio del comercio. Debe ser único; déjalo vacío si no usas."],
  [
    "codigo_barras",
    "Opcional. Código de barras del producto (el que lee el escáner). Si el producto tiene varios, sepáralos con punto y coma ( ; ). Debe ser único.",
  ],
  ["categoria", "Opcional. Si la categoría no existe todavía, el sistema la crea automáticamente."],
  [
    "tipo_venta",
    "Escribe unidad (se vende por pieza) o granel (se vende por peso, ej. queso, embutidos). Vacío = unidad.",
  ],
  [
    "unidad",
    "Unidad de medida: unidad, kg, g, l, ml, caja, paquete, docena, sixpack, bulto, saco. Vacío = unidad.",
  ],
  ["costo_usd", "Precio de COMPRA en USD. Usa punto o coma decimal (ej. 2.60 o 2,60). Vacío = 0."],
  ["precio_usd", "Obligatorio. Precio de VENTA en USD. Usa punto o coma decimal (ej. 3.50)."],
  [
    "impuesto",
    "Escribe exento, iva u otro. Vacío o inválido hereda la configuración fiscal del negocio (Configuración → Parámetros): si trabajas con IVA se importa como iva, si no, como exento.",
  ],
  [
    "aplica_igtf",
    "Escribe si o no. Indica si al pagar este producto en efectivo USD o Zelle se cobra el 3% de IGTF. Vacío hereda el interruptor de IGTF de Configuración → Parámetros.",
  ],
  ["proveedor", "Opcional. Si el proveedor no existe todavía, el sistema lo crea automáticamente."],
  ["stock_inicial", "Opcional. Cantidad con la que entra el producto al inventario. Vacío = 0."],
  [
    "stock_minimo",
    "Opcional. Cantidad mínima antes de avisar que el producto se está agotando. Vacío = 0.",
  ],
  [
    "etiquetas",
    "Opcional. Palabras libres para agrupar/filtrar (ej. perecedero, frío, promoción). Sepáralas con punto y coma ( ; ).",
  ],
  [
    "margen_pct",
    "Opcional. Margen de ganancia sobre el costo, en %. Si dejas precio_usd VACÍO y llenas esta columna (con costo_usd puesto), el sistema calcula solo el precio de venta: costo × (1 + margen/100). Ej. costo 1.00 y margen 40 → precio de venta 1.40. Si llenas AMBAS columnas, se respeta el precio_usd que escribiste.",
  ],
  [
    "tasa",
    "Opcional. Con qué tasa mostrar el precio en bolívares en la vista previa: bcv, euro o personalizada. Vacío = la tasa predeterminada del negocio (normalmente BCV). Esto es solo para que veas el equivalente en Bs antes de importar — el producto siempre se guarda en USD, igual que el resto del sistema, y el Bs se sigue calculando con la tasa vigente en cada venta o reporte.",
  ],
];

function construirLibro(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const hojaProductos = XLSX.utils.aoa_to_sheet([[...COLUMNAS_CARGA], ...FILAS_EJEMPLO]);
  hojaProductos["!cols"] = COLUMNAS_CARGA.map((c) => ({ wch: Math.max(14, c.length + 4) }));
  XLSX.utils.book_append_sheet(wb, hojaProductos, "Productos");

  const hojaInstrucciones = XLSX.utils.aoa_to_sheet([
    ["Cómo llenar la plantilla de carga masiva"],
    [""],
    ["1. No cambies los nombres de las columnas de la hoja Productos."],
    ["2. Copia tus productos desde tu propio Excel y pégalos debajo del encabezado."],
    [
      "3. Borra las 3 filas de ejemplo antes de subir el archivo (o déjalas y bórralas en la vista previa).",
    ],
    ["4. Guarda el archivo y súbelo en Inventario → Carga masiva."],
    [""],
    [
      "Precio de venta automático: si no conoces el precio de venta pero sí tu margen de ganancia, deja precio_usd vacío y llena margen_pct (con costo_usd puesto) — el sistema calcula el precio de venta por ti.",
    ],
    [
      "Categorías y proveedores nuevos: si escribes una categoría o proveedor que no existe todavía, el sistema lo crea automáticamente y lo asocia al producto. La vista previa te muestra cuáles se van a crear antes de confirmar.",
    ],
    [""],
    ["Columna", "Qué va aquí"],
    ...INSTRUCCIONES,
  ]);
  hojaInstrucciones["!cols"] = [{ wch: 16 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, hojaInstrucciones, "Instrucciones");

  return wb;
}

/** Descarga la plantilla .xlsx de ejemplo en el navegador. */
export function descargarPlantillaCarga(): void {
  const wb = construirLibro();
  XLSX.writeFile(wb, "plantilla-productos-arkiteq.xlsx");
}

/**
 * Lee un archivo subido (.xlsx, .xls o .csv) y lo convierte al texto CSV
 * canónico (misma cabecera y orden que espera `cargaMasiva`). Usa la primera
 * hoja del archivo.
 */
export async function leerArchivoComoCsv(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const nombreHoja = wb.SheetNames[0];
  if (!nombreHoja) throw new Error("El archivo no tiene hojas de datos.");
  const hoja = wb.Sheets[nombreHoja];
  if (!hoja) throw new Error("No se pudo leer la hoja del archivo.");
  return XLSX.utils.sheet_to_csv(hoja, { blankrows: false });
}

/**
 * Lee la PRIMERA hoja de un archivo subido como matriz cruda (fila por fila,
 * celda por celda), SIN asumir dónde está el encabezado — a diferencia de
 * `leerArchivoComoCsv` (que sí asume que la fila 1 es el encabezado y solo
 * sirve para el formato canónico). La usa el detector de columnas de la
 * carga masiva de fiados para tolerar archivos exportados de otros sistemas
 * (filas de título arriba, encabezado en cualquier posición, columnas en
 * cualquier orden). `raw: false` deja fechas/números ya formateados como
 * texto, igual criterio que `sheet_to_csv` en `leerArchivoComoCsv`.
 */
export async function leerArchivoComoFilas(file: File): Promise<unknown[][]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const nombreHoja = wb.SheetNames[0];
  if (!nombreHoja) throw new Error("El archivo no tiene hojas de datos.");
  const hoja = wb.Sheets[nombreHoja];
  if (!hoja) throw new Error("No se pudo leer la hoja del archivo.");
  return XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, blankrows: false, raw: false });
}
