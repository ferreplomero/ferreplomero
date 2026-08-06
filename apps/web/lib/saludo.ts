const LOCALE = "es-VE";

/**
 * Saludo según la hora del día en la zona horaria indicada:
 *   00:00–05:59 "Buenas madrugadas" · 06:00–11:59 "Buenos días"
 *   12:00–18:59 "Buenas tardes"      · 19:00–23:59 "Buenas noches"
 * `hourCycle: "h23"` evita el "24" que algunos motores devuelven a
 * medianoche con `hour12: false` (mismo criterio que date-format.ts).
 */
export function saludoPorHora(tz: string, ahora: Date = new Date()): string {
  const hora = Number(
    new Intl.DateTimeFormat(LOCALE, { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(
      ahora,
    ),
  );
  if (hora < 6) return "Buenas madrugadas";
  if (hora < 12) return "Buenos días";
  if (hora < 19) return "Buenas tardes";
  return "Buenas noches";
}
