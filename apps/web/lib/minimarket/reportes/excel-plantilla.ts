/**
 * Plantilla común de los Excel (.xlsx real, `exceljs`) de Reportes → Resumen
 * general. Reemplaza los CSV anteriores, que en un Excel configurado en
 * español se abrían "distorsionados" (el separador de lista allí es `;` y la
 * coma decimal, así que todo caía en una sola columna).
 *
 * Cada hoja: encabezado del negocio + título + período, fila de títulos de
 * columna con color, anchos fijos, formatos numéricos (USD, Bs, %, tasa),
 * encabezado congelado, autofiltro y fila de totales. Solo PRESENTACIÓN: los
 * valores llegan ya calculados.
 */
import type ExcelJS from "exceljs";

const BRAND = "FFB45309";
const BRAND_BG = "FFFEF3E2";
const HEAD_BG = "FF1F2A30";
const MUTED = "FF55636A";
const ZEBRA = "FFF8F6F3";
const BORDE: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFE6DED3" } };

export type TipoColumna = "texto" | "entero" | "cantidad" | "usd" | "bs" | "tasa" | "pct";

const FORMATO: Record<TipoColumna, string | undefined> = {
  texto: undefined,
  entero: "#,##0",
  cantidad: "#,##0.###",
  usd: '"US$" #,##0.00',
  bs: '"Bs" #,##0.00',
  tasa: "#,##0.00",
  // Se guarda como fracción (0.253) y Excel lo muestra como 25.3 %.
  pct: "0.0%",
};

export interface ColumnaExcel<T> {
  titulo: string;
  ancho: number;
  tipo: TipoColumna;
  valor: (fila: T) => string | number | null;
}

export interface HojaExcel<T> {
  nombre: string;
  titulo: string;
  negocio: { nombre: string; rif: string | null };
  /** Líneas bajo el título (período, generado, notas). */
  subtitulos: string[];
  columnas: ColumnaExcel<T>[];
  filas: T[];
  /** Valores de la fila de totales por índice de columna (null = vacío). */
  totales?: (string | number | null)[];
}

export function agregarHoja<T>(wb: ExcelJS.Workbook, hoja: HojaExcel<T>): void {
  const ws = wb.addWorksheet(hoja.nombre, { views: [{ showGridLines: false }] });
  const nCols = hoja.columnas.length;
  ws.columns = hoja.columnas.map((c) => ({ width: c.ancho }));
  const ultimaCol = ws.getColumn(nCols).letter;

  let r = 1;
  ws.mergeCells(`A${r}:${ultimaCol}${r}`);
  const celNegocio = ws.getCell(`A${r}`);
  celNegocio.value = hoja.negocio.nombre;
  celNegocio.font = { size: 16, bold: true, color: { argb: HEAD_BG } };
  ws.getRow(r).height = 24;
  r++;

  if (hoja.negocio.rif) {
    ws.mergeCells(`A${r}:${ultimaCol}${r}`);
    ws.getCell(`A${r}`).value = `RIF: ${hoja.negocio.rif}`;
    ws.getCell(`A${r}`).font = { size: 9, color: { argb: MUTED } };
    r++;
  }

  ws.mergeCells(`A${r}:${ultimaCol}${r}`);
  const celTitulo = ws.getCell(`A${r}`);
  celTitulo.value = hoja.titulo.toUpperCase();
  celTitulo.font = { size: 12, bold: true, color: { argb: BRAND } };
  ws.getRow(r).height = 20;
  r++;

  for (const sub of hoja.subtitulos) {
    ws.mergeCells(`A${r}:${ultimaCol}${r}`);
    ws.getCell(`A${r}`).value = sub;
    ws.getCell(`A${r}`).font = { size: 9, color: { argb: MUTED } };
    r++;
  }
  r++; // fila en blanco antes de la tabla

  const filaTitulos = r;
  const header = ws.getRow(filaTitulos);
  hoja.columnas.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.titulo;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_BG } };
    cell.alignment = {
      vertical: "middle",
      horizontal: c.tipo === "texto" ? "left" : "right",
      wrapText: true,
    };
    cell.border = { top: BORDE, bottom: BORDE, left: BORDE, right: BORDE };
  });
  header.height = 30;
  r++;

  hoja.filas.forEach((fila, idx) => {
    const row = ws.getRow(r);
    hoja.columnas.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const v = c.valor(fila);
      cell.value = v === null || v === undefined ? null : v;
      const fmt = FORMATO[c.tipo];
      if (fmt) cell.numFmt = fmt;
      cell.alignment = {
        vertical: "top",
        horizontal: c.tipo === "texto" ? "left" : "right",
        wrapText: c.tipo === "texto",
      };
      cell.border = { bottom: BORDE, left: BORDE, right: BORDE };
      if (idx % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      }
    });
    r++;
  });

  const ultimaFilaDatos = r - 1;

  if (hoja.totales && hoja.filas.length > 0) {
    const row = ws.getRow(r);
    hoja.columnas.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const v = hoja.totales?.[i] ?? null;
      cell.value = v;
      const fmt = FORMATO[c.tipo];
      if (fmt && typeof v === "number") cell.numFmt = fmt;
      cell.font = { bold: true, color: { argb: HEAD_BG } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_BG } };
      cell.alignment = { horizontal: c.tipo === "texto" ? "left" : "right" };
      cell.border = { top: { style: "medium", color: { argb: BRAND } }, bottom: BORDE };
    });
    row.height = 20;
  }

  if (hoja.filas.length === 0) {
    ws.mergeCells(`A${r}:${ultimaCol}${r}`);
    ws.getCell(`A${r}`).value = "Sin datos en este período.";
    ws.getCell(`A${r}`).font = { italic: true, color: { argb: MUTED } };
  } else {
    ws.autoFilter = {
      from: { row: filaTitulos, column: 1 },
      to: { row: ultimaFilaDatos, column: nCols },
    };
  }

  // Congela todo hasta la fila de títulos: al bajar siempre se ven las columnas.
  ws.views = [{ state: "frozen", ySplit: filaTitulos, showGridLines: false }];
  ws.pageSetup = {
    orientation: nCols > 7 ? "landscape" : "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `${filaTitulos}:${filaTitulos}`,
  };
}

export function respuestaXlsx(buffer: ExcelJS.Buffer, filename: string): Response {
  return new Response(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
