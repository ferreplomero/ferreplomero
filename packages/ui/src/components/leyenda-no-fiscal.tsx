/**
 * Leyenda obligatoria en todo documento emitido al cliente mientras no exista
 * la capa fiscal homologada (impresora fiscal, número de control SENIAT).
 *
 * Debe aparecer al pie de: recibos de venta, comprobantes de abono, estados de
 * cuenta imprimibles y cualquier otro documento compartible o descargable.
 */

/** Texto plano de la leyenda, para contextos no-JSX (HTML generado en servidor, PDF, etc.). */
export const LEYENDA_NO_FISCAL_TEXTO = "Comprobante interno de venta — no es una factura fiscal";

export function LeyendaNoFiscal({
  className = "",
  texto = LEYENDA_NO_FISCAL_TEXTO,
}: {
  className?: string;
  /** Texto a mostrar — por defecto la leyenda de venta. Otros verticales con su propia
   * nota legal (ej. Condominio) pueden pasar la suya sin duplicar este componente. */
  texto?: string;
}) {
  return (
    <p
      className={`text-muted-foreground text-center text-[10px] leading-relaxed ${className}`}
      aria-label="Aviso de documento no fiscal"
    >
      {texto}
    </p>
  );
}
