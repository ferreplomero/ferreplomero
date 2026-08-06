/**
 * Plantilla descargable para la carga masiva de FIADOS (clientes con deuda
 * previa). Mismo enfoque que `plantilla-carga.ts` (inventario): un .xlsx con
 * encabezados + ejemplos + hoja de instrucciones. La lectura de archivo
 * (.xlsx/.csv -> texto CSV canónico) se reutiliza de `plantilla-carga.ts`,
 * es genérica y no depende del inventario.
 */
import * as XLSX from "xlsx";

export { leerArchivoComoCsv } from "./plantilla-carga";

/** Orden de columnas — debe coincidir con las posiciones que lee `parseFilasFiado` en `clientes/actions.ts`. */
export const COLUMNAS_CARGA_FIADOS = [
  "nombre",
  "cedula",
  "telefono",
  "whatsapp",
  "direccion",
  "limite_fiado_usd",
  "monto_adeudado",
  "moneda",
  "tasa",
  "fecha_deuda",
  "nota",
] as const;

const FILAS_EJEMPLO: (string | number)[][] = [
  [
    "María Pérez",
    "V12345678",
    "04121234567",
    "",
    "Calle Principal, Casa 12, Los Teques",
    50,
    35.5,
    "USD",
    "",
    "",
    "Productos varios de enero",
  ],
  [
    // Deuda anotada en Bs: se convierte a USD con la tasa BCV vigente al momento de importar.
    "José Rodríguez",
    "V87654321",
    "",
    "04141234567",
    "",
    0,
    1200,
    "Bs",
    "bcv",
    "2026-06-15",
    "Fiado de mercado (cuaderno)",
  ],
  [
    // Cliente nuevo sin deuda actual: solo se registra con su límite de fiado.
    "Ana Gómez",
    "",
    "",
    "",
    "",
    100,
    0,
    "USD",
    "",
    "",
    "",
  ],
];

const INSTRUCCIONES: [string, string][] = [
  [
    "nombre",
    "Obligatorio. Nombre completo del cliente (nombre y apellido en la misma celda), tal como debe verse en el sistema.",
  ],
  [
    "cedula",
    "Opcional pero recomendada. Formato V12345678, E12345678, J12345678 o G12345678 (letra + 6 a 9 dígitos, sin guion). Si dos filas traen la misma cédula, se tratan como el mismo cliente.",
  ],
  ["telefono", "Opcional. Número de contacto."],
  [
    "whatsapp",
    "Opcional. Si es distinto al teléfono. Se usa para el recordatorio de cobro por WhatsApp.",
  ],
  ["direccion", "Opcional."],
  [
    "limite_fiado_usd",
    "Opcional. Límite de crédito del cliente en USD. Vacío = 0 (se puede editar después en la ficha del cliente).",
  ],
  [
    "monto_adeudado",
    "Opcional. Lo que el cliente debe HOY. Vacío o 0 = el cliente se crea sin deuda (útil si solo quieres cargar su límite de fiado). El monto va en la moneda que indiques en la columna moneda.",
  ],
  [
    "moneda",
    "Escribe USD o Bs. Vacío = USD. Si pones Bs, monto_adeudado se convierte a USD con la tasa.",
  ],
  [
    "tasa",
    "Solo si moneda es Bs: con qué tasa convertir — bcv, euro o personalizada. Vacío = la tasa predeterminada del negocio. No aplica si moneda es USD.",
  ],
  [
    "fecha_deuda",
    "Opcional. Formato AAAA-MM-DD (ej. 2026-06-15) — la fecha real en que se originó la deuda, para que la cuenta se vea correctamente como al día o morosa (+30 días sin pagar). Vacío = la fecha en que importas el archivo.",
  ],
  [
    "nota",
    'Opcional. Descripción libre de la deuda, ej. "productos varios", "mercado de diciembre".',
  ],
];

function construirLibro(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const hojaFiados = XLSX.utils.aoa_to_sheet([[...COLUMNAS_CARGA_FIADOS], ...FILAS_EJEMPLO]);
  hojaFiados["!cols"] = COLUMNAS_CARGA_FIADOS.map((c) => ({ wch: Math.max(14, c.length + 4) }));
  XLSX.utils.book_append_sheet(wb, hojaFiados, "Fiados");

  const hojaInstrucciones = XLSX.utils.aoa_to_sheet([
    ["Cómo llenar la plantilla de carga masiva de fiados"],
    [""],
    ["1. No cambies los nombres de las columnas de la hoja Fiados."],
    ["2. Copia tus clientes con deuda desde tu cuaderno o Excel y pégalos debajo del encabezado."],
    [
      "3. Borra las 3 filas de ejemplo antes de subir el archivo (o déjalas y bórralas en la vista previa).",
    ],
    ["4. Guarda el archivo y súbelo en Clientes → Carga masiva."],
    [""],
    [
      "Si el cliente ya existe en el sistema (misma cédula, o mismo nombre si no pusiste cédula), la deuda se suma a su cuenta — NO se crea un cliente duplicado.",
    ],
    [
      "Si dos filas del mismo archivo son del mismo cliente (misma cédula o nombre), se agrupan en un solo cliente con dos deudas.",
    ],
    [""],
    [
      "El sistema también acepta archivos exportados de otros sistemas: detecta automáticamente las columnas y te deja ajustarlas antes de importar.",
    ],
    [""],
    ["Columna", "Qué va aquí"],
    ...INSTRUCCIONES,
  ]);
  hojaInstrucciones["!cols"] = [{ wch: 18 }, { wch: 95 }];
  XLSX.utils.book_append_sheet(wb, hojaInstrucciones, "Instrucciones");

  return wb;
}

/** Descarga la plantilla .xlsx de ejemplo para carga masiva de fiados en el navegador. */
export function descargarPlantillaFiados(): void {
  const wb = construirLibro();
  XLSX.writeFile(wb, "plantilla-fiados-arkiteq.xlsx");
}
