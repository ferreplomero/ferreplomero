import type { ReactElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";

type DocumentoPdf = Parameters<typeof renderToBuffer>[0];

/** Renderiza un `<Document>` de `@react-pdf/renderer` a una respuesta HTTP con el PDF
 * real. Utilidad genérica de 15 líneas, deliberadamente NO compartida con
 * `lib/condominio/pdf/render.ts` (idéntica) — cada vertical mantiene su propia
 * copia para no mezclar sus carpetas (ver CLAUDE.md, aislamiento entre
 * verticales); se extraerá a `@arkiteq/core` si un tercer vertical la necesita. */
export async function renderPresupuestoAResponse(
  documento: ReactElement,
  filename: string,
  disposition: "inline" | "attachment" = "inline",
): Promise<NextResponse> {
  const buffer = await renderToBuffer(documento as DocumentoPdf);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
