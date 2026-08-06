/** Normaliza un número venezolano para usarlo en un link `wa.me`: quita todo lo
 * que no sea dígito y sustituye el 0 inicial local por el código de país 58. */
export function normalizarTelefonoWhatsapp(numero: string): string {
  return numero.replace(/\D/g, "").replace(/^0/, "58");
}
