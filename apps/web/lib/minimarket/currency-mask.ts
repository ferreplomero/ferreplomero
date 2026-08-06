/**
 * Máscara de monto estilo bancario para los inputs de monto del diálogo de
 * cobro: el usuario solo escribe dígitos y el valor se va formateando de
 * derecha a izquierda (punto de miles, coma decimal — 2 decimales fijos).
 *
 * El estado real de cada pago (`PagoRow.monto`) sigue siendo un string
 * numérico limpio con punto decimal (ej. "1919.17"), compatible con
 * `parseFloat` y con `pos-calc.ts` sin cambios. Estas funciones solo
 * convierten entre ese valor limpio y el texto enmascarado que ve el usuario.
 */

/** Máximo de dígitos aceptados (Bs 9.999.999.999,99 — más que suficiente). */
const MAX_DIGITS = 12;

/** Convierte lo que el usuario acaba de escribir/borrar en el monto limpio ("1919.17" o ""). */
export function parseMaskedInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, MAX_DIGITS);
  if (!digits) return "";
  const cents = parseInt(digits, 10);
  return (cents / 100).toFixed(2);
}

/** Formatea un monto limpio ("1919.17") como texto bancario ("1.919,17"). */
export function formatMaskedAmount(monto: string): string {
  if (!monto) return "";
  const num = Number(monto);
  if (!Number.isFinite(num) || num < 0) return "";
  const [intPart, decPart] = num.toFixed(2).split(".") as [string, string];
  const intConSeparador = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${intConSeparador},${decPart}`;
}
