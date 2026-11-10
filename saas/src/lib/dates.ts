/**
 * Fechas «del usuario». Toda clave de día es `AAAA-MM-DD` en la zona IANA del perfil.
 * El servidor corre en UTC, por eso nunca se usa `new Date().getDate()` para decidir el día.
 */

export type Day = string; // AAAA-MM-DD

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Antes de esta hora local, el repaso sigue perteneciendo al día anterior. */
export const REVIEW_CUTOFF_HOUR = 4;

export function isValidDay(value: string): value is Day {
  if (!DAY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function parts(tz: string, now: Date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}` as Day, time: `${p.hour}:${p.minute}` };
}

export function todayIn(tz: string, now: Date = new Date()): Day {
  return parts(tz, now).day;
}

export function nowTimeIn(tz: string, now: Date = new Date()): string {
  return parts(tz, now).time;
}

/** Día al que pertenece el repaso: entre las 00:00 y las 04:00 cuenta todavía el día anterior. */
export function reviewDayIn(tz: string, now: Date = new Date()): Day {
  const { day, time } = parts(tz, now);
  return Number(time.slice(0, 2)) < REVIEW_CUTOFF_HOUR ? addDays(day, -1) : day;
}

export function addDays(day: Day, n: number): Day {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = lunes … 6 = domingo. */
export function weekdayIndex(day: Day): number {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export function startOfWeek(day: Day): Day {
  return addDays(day, -weekdayIndex(day));
}

/** Celdas de un mes empezando en lunes, con huecos (null) antes del día 1. */
export function monthGrid(month: string): (Day | null)[] {
  const first = `${month}-01`;
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  const daysInMonth = d.getUTCDate();
  const cells: (Day | null)[] = Array.from({ length: weekdayIndex(first) }, () => null);
  for (let i = 0; i < daysInMonth; i++) cells.push(addDays(first, i));
  return cells;
}

export function shiftMonth(month: string, n: number): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}

/** Racha de días seguidos cumplidos hasta hoy (si hoy aún no está, cuenta desde ayer). */
export function currentStreak(done: ReadonlySet<Day>, today: Day): number {
  let day = done.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (done.has(day)) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

export function formatDay(day: Day, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }): string {
  return new Intl.DateTimeFormat('es-ES', { ...opts, timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
}

/** `dd/mm/aaaa`, como en la app original («SEMANA 09/11/2026»). */
export function formatDayShort(day: Day): string {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}

export function formatMonth(month: string): string {
  return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
}
