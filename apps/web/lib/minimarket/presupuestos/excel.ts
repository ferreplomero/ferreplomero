/**
 * Excel profesional del presupuesto — usa `exceljs` (agregado específicamente
 * para esto: `xlsx`, ya instalado, casi no soporta estilos de celda reales y
 * el pedido es un Excel con formato de marca, no un CSV con extensión .xlsx).
 *
 * Columna A reservada para la miniatura de cada producto (imagen PNG ya
 * convertida en `documento-datos.ts` — exceljs, igual que react-pdf, no
 * soporta WebP). El resto del contenido vive en B..E.
 */
import ExcelJS from "exceljs";
import { LEYENDA_NO_FISCAL_TEXTO } from "@arkiteq/ui";
import { NOTA_PRESUPUESTO_TEXTO } from "../pdf/constants";

const BRAND = "FF2E7A6F";
const BRAND_BG = "FFEAF4F2";
const INK = "FF16252B";
const MUTED = "FF4A5A60";
const BORDER: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFDDE7E5" } };

export interface DatosPresupuestoExcel {
  numero: string;
  fechaEmision: string;
  validezHasta: string;
  negocio: { nombre: string; rif: string | null; direccion: string | null };
  cliente: { nombre: string; cedula: string | null; telefono: string | null } | null;
  items: {
    descripcion: string;
    cantidad: number;
    precioUnitarioUsd: number;
    subtotalUsd: number;
    imagenPng: Buffer | null;
  }[];
  subtotalUsd: number;
  ivaUsd: number;
  totalUsd: number;
  totalBs: number;
  tasaUsada: number;
}

export async function construirExcelPresupuesto(
  datos: DatosPresupuestoExcel,
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = datos.negocio.nombre;
  wb.created = new Date();

  const sheet = wb.addWorksheet("Presupuesto", {
    views: [{ showGridLines: false }],
  });
  sheet.columns = [{ width: 6 }, { width: 38 }, { width: 12 }, { width: 16 }, { width: 16 }];

  let fila = 1;

  sheet.mergeCells(`B${fila}:C${fila}`);
  sheet.getCell(`B${fila}`).value = datos.negocio.nombre;
  sheet.getCell(`B${fila}`).font = { size: 16, bold: true, color: { argb: INK } };
  sheet.mergeCells(`D${fila}:E${fila}`);
  sheet.getCell(`D${fila}`).value = "PRESUPUESTO / COTIZACIÓN";
  sheet.getCell(`D${fila}`).font = { size: 12, bold: true, color: { argb: BRAND } };
  sheet.getCell(`D${fila}`).alignment = { horizontal: "right" };
  fila++;

  if (datos.negocio.rif) {
    sheet.getCell(`B${fila}`).value = `RIF: ${datos.negocio.rif}`;
    sheet.getCell(`B${fila}`).font = { size: 9, color: { argb: MUTED } };
    fila++;
  }
  if (datos.negocio.direccion) {
    sheet.getCell(`B${fila}`).value = datos.negocio.direccion;
    sheet.getCell(`B${fila}`).font = { size: 9, color: { argb: MUTED } };
    fila++;
  }
  sheet.mergeCells(`D2:E2`);
  sheet.getCell("D2").value = `N.º ${datos.numero}`;
  sheet.getCell("D2").font = { size: 9, color: { argb: MUTED } };
  sheet.getCell("D2").alignment = { horizontal: "right" };
  sheet.mergeCells(`D3:E3`);
  sheet.getCell("D3").value =
    `Emitido: ${datos.fechaEmision}  ·  Válido hasta: ${datos.validezHasta}`;
  sheet.getCell("D3").font = { size: 9, color: { argb: MUTED } };
  sheet.getCell("D3").alignment = { horizontal: "right" };

  fila = Math.max(fila, 4) + 1;

  // Bloque cliente
  sheet.mergeCells(`B${fila}:E${fila}`);
  sheet.getCell(`B${fila}`).value = `Cliente: ${datos.cliente?.nombre ?? "Cliente ocasional"}`;
  sheet.getCell(`B${fila}`).font = { bold: true, color: { argb: INK } };
  sheet.getCell(`B${fila}`).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: BRAND_BG },
  };
  fila++;
  if (datos.cliente?.cedula || datos.cliente?.telefono) {
    const partes = [
      datos.cliente?.cedula ? `C.I./RIF: ${datos.cliente.cedula}` : null,
      datos.cliente?.telefono ? `Tel: ${datos.cliente.telefono}` : null,
    ].filter(Boolean);
    sheet.mergeCells(`B${fila}:E${fila}`);
    sheet.getCell(`B${fila}`).value = partes.join("   ·   ");
    sheet.getCell(`B${fila}`).font = { size: 9, color: { argb: MUTED } };
    sheet.getCell(`B${fila}`).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: BRAND_BG },
    };
    fila++;
  }
  sheet.mergeCells(`B${fila}:E${fila}`);
  sheet.getCell(`B${fila}`).value = `Tasa usada: Bs ${datos.tasaUsada.toFixed(2)} / USD`;
  sheet.getCell(`B${fila}`).font = { size: 9, color: { argb: MUTED } };
  sheet.getCell(`B${fila}`).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: BRAND_BG },
  };
  fila += 2;

  // Encabezado de la tabla (columna A sin encabezado: es la de la miniatura)
  const headerRow = fila;
  const headers = ["Descripción", "Cantidad", "Precio unit. (USD)", "Subtotal (USD)"];
  sheet.getCell(headerRow, 1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: BRAND },
  };
  sheet.getCell(headerRow, 1).border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
  headers.forEach((h, i) => {
    const cell = sheet.getCell(headerRow, i + 2);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.alignment = { horizontal: i === 0 ? "left" : "right", vertical: "middle" };
    cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
  });
  fila++;

  for (const item of datos.items) {
    const r = sheet.getRow(fila);
    r.height = 28;
    r.getCell(2).value = item.descripcion;
    r.getCell(3).value = item.cantidad;
    r.getCell(4).value = item.precioUnitarioUsd;
    r.getCell(5).value = item.subtotalUsd;
    r.getCell(2).alignment = { vertical: "middle" };
    r.getCell(3).alignment = { horizontal: "right", vertical: "middle" };
    r.getCell(4).numFmt = '"$"#,##0.00';
    r.getCell(4).alignment = { horizontal: "right", vertical: "middle" };
    r.getCell(5).numFmt = '"$"#,##0.00';
    r.getCell(5).alignment = { horizontal: "right", vertical: "middle" };
    for (let c = 1; c <= 5; c++) {
      r.getCell(c).border = { bottom: BORDER };
    }

    if (item.imagenPng) {
      // exceljs declara `buffer` contra su propia copia de los tipos de
      // Node (`Buffer<ArrayBuffer>`), distinta a la que resuelve `sharp` en
      // este paquete (`Buffer<ArrayBufferLike>`) — mismos bytes en tiempo de
      // ejecución, solo un choque de tipos entre dos declaraciones globales
      // de "Buffer" que ningún cast tipado logra reconciliar. Se acota el
      // `eslint-disable` y el `any` estrictamente a este único argumento.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const imageId = wb.addImage({ buffer: item.imagenPng, extension: "png" } as any);
      // Anclado a la columna A (índice 0) de esta fila, con un pequeño margen
      // para que no toque los bordes de la celda.
      sheet.addImage(imageId, {
        tl: { col: 0.08, row: fila - 1 + 0.08 },
        ext: { width: 26, height: 26 },
        editAs: "oneCell",
      });
    }

    fila++;
  }

  fila++;
  const totalesFilas: [string, number, boolean][] = [
    ["Subtotal", datos.subtotalUsd, false],
    ...(datos.ivaUsd > 0 ? ([["IVA", datos.ivaUsd, false]] as [string, number, boolean][]) : []),
    ["TOTAL (USD)", datos.totalUsd, true],
  ];
  for (const [label, valor, destacado] of totalesFilas) {
    sheet.mergeCells(`B${fila}:D${fila}`);
    sheet.getCell(`B${fila}`).value = label;
    sheet.getCell(`B${fila}`).alignment = { horizontal: "right" };
    sheet.getCell(`B${fila}`).font = { bold: destacado, color: { argb: destacado ? BRAND : INK } };
    sheet.getCell(`E${fila}`).value = valor;
    sheet.getCell(`E${fila}`).numFmt = '"$"#,##0.00';
    sheet.getCell(`E${fila}`).alignment = { horizontal: "right" };
    sheet.getCell(`E${fila}`).font = {
      bold: destacado,
      size: destacado ? 13 : 10,
      color: { argb: destacado ? BRAND : INK },
    };
    fila++;
  }
  sheet.mergeCells(`B${fila}:D${fila}`);
  sheet.getCell(`B${fila}`).value = "Equivalente en bolívares";
  sheet.getCell(`B${fila}`).alignment = { horizontal: "right" };
  sheet.getCell(`B${fila}`).font = { color: { argb: MUTED } };
  sheet.getCell(`E${fila}`).value = datos.totalBs;
  sheet.getCell(`E${fila}`).numFmt = '#,##0.00 "Bs"';
  sheet.getCell(`E${fila}`).alignment = { horizontal: "right" };
  sheet.getCell(`E${fila}`).font = { color: { argb: MUTED } };
  fila += 2;

  sheet.mergeCells(`B${fila}:E${fila}`);
  sheet.getCell(`B${fila}`).value = NOTA_PRESUPUESTO_TEXTO;
  sheet.getCell(`B${fila}`).font = { size: 8, italic: true, color: { argb: MUTED } };
  sheet.getCell(`B${fila}`).alignment = { wrapText: true };
  fila++;
  sheet.mergeCells(`B${fila}:E${fila}`);
  sheet.getCell(`B${fila}`).value = LEYENDA_NO_FISCAL_TEXTO;
  sheet.getCell(`B${fila}`).font = { size: 8, italic: true, color: { argb: MUTED } };
  sheet.getCell(`B${fila}`).alignment = { wrapText: true };

  return wb.xlsx.writeBuffer();
}
