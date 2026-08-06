/** Textos y formateadores del PDF de Presupuestos — string plano (no JSX):
 * `@react-pdf/renderer` no renderiza DOM/HTML, así que `<LeyendaNoFiscal/>` de
 * `@arkiteq/ui` no es compatible aquí (mismo criterio que
 * `lib/condominio/pdf/constants.ts`). Se usa el texto plano
 * `LEYENDA_NO_FISCAL_TEXTO` de `@arkiteq/ui` en su lugar. */
export const NOTA_PRESUPUESTO_TEXTO =
  "Este documento es un presupuesto/cotización, no es una factura ni un recibo de venta. " +
  "Los precios pueden variar si cambia la tasa de cambio o el stock disponible al momento de " +
  "aceptar la compra.";

export function fmtUsd(n: number): string {
  return `US$ ${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtBs(n: number): string {
  return `Bs ${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
