import type { NextResponse } from "next/server";
import { convertirImagenAPng } from "@/lib/minimarket/pdf/convertir-imagen";
import { NotaEntregaDocumento } from "@/lib/minimarket/pdf/nota-entrega-documento";
import { renderPresupuestoAResponse } from "@/lib/minimarket/pdf/render";
import type { NotaEntregaDatos } from "./datos";

/** Respuesta HTTP con el PDF de la nota de entrega (logo convertido a PNG:
 * `@react-pdf` no soporta WebP). Compartida por la ruta interna y la pública. */
export async function respuestaPdfNotaEntrega(
  datos: NotaEntregaDatos,
  disposition: "inline" | "attachment",
): Promise<NextResponse> {
  const logoPng = datos.doc.mostrarEncabezado
    ? await convertirImagenAPng(datos.doc.negocio.logoUrl)
    : null;
  return renderPresupuestoAResponse(
    NotaEntregaDocumento({ datos, logoPng }),
    `nota-entrega-${datos.numero}.pdf`,
    disposition,
  );
}
