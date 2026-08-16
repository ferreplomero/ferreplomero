import { Info } from "lucide-react";

/** Nota fija de los libros contables (Diario, Mayor) — deja claro que es un
 * registro de apoyo interno, no sustituye la contabilidad formal. */
export function NotaLibroContable() {
  return (
    <p className="text-muted-foreground flex items-start gap-2 rounded-md border border-dashed px-3 py-2.5 text-xs">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      Registro contable interno de apoyo. No sustituye la contabilidad formal ni los libros legales;
      consulte a su contador.
    </p>
  );
}
