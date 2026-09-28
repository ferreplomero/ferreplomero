/**
 * Rango de fechas del Reporte general: un preset (Hoy / 7 días / 30 días /
 * Mes anterior) o un rango personalizado Desde/Hasta. Compartido por la
 * página y por las descargas (Excel/PDF) para que siempre usen el mismo rango.
 */
import { rangoPreset, type RangoFechas } from "@/lib/minimarket/data/reportes";
import { hoyEnTz, rangoLocalAUtc } from "@/lib/minimarket/date-format";

export type PresetReporte = "hoy" | "semana" | "mes" | "mes-anterior";
export type PeriodoReporte = PresetReporte | "personalizado";

const PRESETS = new Set<string>(["hoy", "semana", "mes", "mes-anterior"]);
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function fechaValida(s: string | null | undefined): s is string {
  if (!s || !FECHA_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function resolverRangoReporte(
  params: { periodo?: string | null; desde?: string | null; hasta?: string | null },
  tz: string,
): { rango: RangoFechas; periodo: PeriodoReporte } {
  const hoy = hoyEnTz(tz);
  if (fechaValida(params.desde) && fechaValida(params.hasta)) {
    // Nunca más allá de hoy; si vienen invertidas se ordenan.
    const a = params.desde <= params.hasta ? params.desde : params.hasta;
    const b = params.desde <= params.hasta ? params.hasta : params.desde;
    const hasta = b > hoy ? hoy : b;
    const desde = a > hasta ? hasta : a;
    return { rango: { desde, hasta }, periodo: "personalizado" };
  }
  const preset = (
    params.periodo && PRESETS.has(params.periodo) ? params.periodo : "mes"
  ) as PresetReporte;
  return { rango: rangoPreset(preset, tz), periodo: preset };
}

/**
 * Corte del inventario al final del día `hasta` (zona del negocio). Si
 * `hasta` es hoy (o futuro), NO hay corte: stock actual, igual que siempre.
 */
export function corteInventario(
  hasta: string,
  tz: string,
): { fechaCorte: string; corteIso: string | undefined } {
  const hoy = hoyEnTz(tz);
  if (!fechaValida(hasta) || hasta >= hoy) return { fechaCorte: hoy, corteIso: undefined };
  return { fechaCorte: hasta, corteIso: rangoLocalAUtc({ desde: hasta, hasta }, tz).hastaIso };
}
