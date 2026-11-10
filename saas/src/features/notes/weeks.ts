/**
 * Lógica pura del diario semanal (sin React ni Supabase). Semanas de lunes a domingo,
 * identificadas por la fecha de su lunes.
 */
import { addDays, startOfWeek, type Day } from '@/lib/dates';

const EXCERPT_LENGTH = 80;

/** Semana actual: de lunes a hoy, solo los días con texto, y hoy siempre (nunca días futuros). */
export function visibleDaysCurrentWeek(monday: Day, today: Day, daysWithText: ReadonlySet<Day>): Day[] {
  const days: Day[] = [];
  for (let day = monday; day < today; day = addDays(day, 1)) {
    if (daysWithText.has(day)) days.push(day);
  }
  days.push(today);
  return days;
}

/** Semana pasada: solo los días con texto, de lunes a domingo. */
export function visibleDaysPastWeek(monday: Day, daysWithText: ReadonlySet<Day>): Day[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter((d) => daysWithText.has(d));
}

/** Principio del texto para la lista: espacios colapsados y como mucho 80 caracteres + «…». */
export function excerpt(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH)}…` : flat;
}

export type WeekSummary = { monday: Day; daysWithText: number; excerpt: string };

/** Agrupa notas por semana, de la más reciente a la más antigua; el extracto sale del primer día con texto. */
export function groupWeeks(notes: readonly { day: Day; body: string }[]): WeekSummary[] {
  const weeks = new Map<Day, { day: Day; body: string }[]>();
  for (const note of notes) {
    const monday = startOfWeek(note.day);
    const list = weeks.get(monday) ?? [];
    list.push(note);
    weeks.set(monday, list);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([monday, list]) => {
      const first = list.reduce((min, n) => (n.day < min.day ? n : min));
      return { monday, daysWithText: list.length, excerpt: excerpt(first.body) };
    });
}
