const LOCALE = "es-VE";

/** "lun. 29 jun. 2026, 2:14 p. m." */
export function fmtFechaHora(iso: string, tz: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: tz,
  }).format(new Date(iso));
}

/** "lunes, 29 de junio de 2026" */
export function fmtFechaLarga(iso: string, tz: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: tz,
  }).format(new Date(iso));
}

/** "29/6/2026" */
export function fmtFechaCorta(iso: string, tz: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: "short",
    timeZone: tz,
  }).format(new Date(iso));
}

/** Solo la hora: "2:14 p. m." */
export function fmtHora(iso: string, tz: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeStyle: "short",
    timeZone: tz,
  }).format(new Date(iso));
}

/**
 * Fecha de calendario (YYYY-MM-DD) de un instante cualquiera, en la zona
 * horaria del negocio. Base de `hoyEnTz` y de la agrupación por día de los
 * reportes — nunca usar `iso.slice(0,10)` directamente sobre un timestamptz,
 * porque eso da la fecha en UTC, no la del negocio.
 */
export function fechaEnTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
}

/**
 * Devuelve la fecha actual en la zona horaria del negocio como YYYY-MM-DD.
 * Usar para filtros "de hoy" en lugar de `new Date().toISOString().slice(0,10)`.
 */
export function hoyEnTz(tz: string): string {
  return fechaEnTz(new Date().toISOString(), tz);
}

/**
 * Instante UTC (ISO) que corresponde a la medianoche de `fechaISO`
 * (YYYY-MM-DD) en la zona horaria `tz`. Técnica estándar sin dependencias:
 * adivina el instante interpretando la fecha como UTC, lee cómo se ve ese
 * instante en `tz`, y corrige por la diferencia — válida incluso cruzando
 * cambios de horario de verano (Caracas no tiene, pero otras zonas del
 * selector sí).
 */
export function medianocheLocalAUtcISO(fechaISO: string, tz: string): string {
  const guessMs = new Date(`${fechaISO}T00:00:00.000Z`).getTime();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(guessMs)).map((p) => [p.type, p.value]),
  );
  const asLocalMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMs = asLocalMs - guessMs;
  return new Date(guessMs - offsetMs).toISOString();
}

/** Rango de fechas de calendario (YYYY-MM-DD, inclusivo en ambos extremos). */
export interface RangoFechasSimple {
  desde: string;
  hasta: string;
}

/** Límites UTC de un rango, listos para `.gte(desdeIso).lt(hastaIso)`. */
export interface RangoUtc {
  desdeIso: string;
  hastaIso: string;
}

/**
 * Convierte un rango de días de calendario del negocio (`desde`..`hasta`,
 * ambos inclusive) a límites de instante UTC exactos para filtrar columnas
 * `timestamptz`: `[medianoche local de "desde", medianoche local del día
 * después de "hasta")`. Usar siempre `.gte(desdeIso).lt(hastaIso)` — nunca
 * comparar un timestamptz contra un string de fecha plano ("YYYY-MM-DD"),
 * porque Postgres lo interpreta en UTC, no en la zona horaria del negocio.
 */
export function rangoLocalAUtc(rango: RangoFechasSimple, tz: string): RangoUtc {
  const desdeIso = medianocheLocalAUtcISO(rango.desde, tz);

  const diaSiguiente = new Date(`${rango.hasta}T00:00:00.000Z`);
  diaSiguiente.setUTCDate(diaSiguiente.getUTCDate() + 1);
  const hastaIso = medianocheLocalAUtcISO(diaSiguiente.toISOString().slice(0, 10), tz);

  return { desdeIso, hastaIso };
}
