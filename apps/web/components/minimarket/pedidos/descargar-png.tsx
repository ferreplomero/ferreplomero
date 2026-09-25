"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "@arkiteq/ui";

/**
 * Envuelve un documento y ofrece descargarlo como imagen PNG (html-to-image,
 * cargada bajo demanda para no pesar en la carga inicial de la tienda).
 */
export function ConDescargaPng({
  nombreArchivo,
  children,
}: {
  nombreArchivo: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [generando, setGenerando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function descargar() {
    if (!ref.current) return;
    setGenerando(true);
    setError(null);
    try {
      const { toPng } = await import("html-to-image");
      // `skipFonts`: sin esto html-to-image descarga e incrusta TODAS las
      // fuentes web de la página y puede quedarse colgado; el recibo se
      // dibuja igual con la fuente del sistema. El tiempo límite garantiza
      // que el botón nunca quede en "Generando…" para siempre.
      const dataUrl = await Promise.race([
        toPng(ref.current, {
          pixelRatio: 2,
          backgroundColor: "#ffffff",
          cacheBust: true,
          skipFonts: true,
        }),
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error("tiempo agotado")), 20000),
        ),
      ]);
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = nombreArchivo;
      a.click();
    } catch {
      setError("No se pudo generar la imagen. Intenta de nuevo.");
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className="space-y-2">
      <div ref={ref} className="overflow-hidden rounded-xl border border-gray-200">
        {children}
      </div>
      <Button variant="outline" className="w-full" onClick={descargar} disabled={generando}>
        <Download className="size-4" />
        {generando ? "Generando imagen…" : "Descargar recibo (imagen)"}
      </Button>
      {error ? <p className="text-danger text-center text-xs">{error}</p> : null}
    </div>
  );
}
