import type { Metadata } from 'next';
import { requireSession } from '@/lib/server/session';
import { listNotes, listNotesBefore } from '@/features/notes/queries';
import { groupWeeks } from '@/features/notes/weeks';
import { addDays, isValidDay, startOfWeek, type Day } from '@/lib/dates';
import { CurrentWeek } from './current-week';
import { PastWeek } from './past-week';
import { PastWeeksList } from './past-weeks-list';

export const metadata: Metadata = { title: 'Diario' };

type Search = { d?: string; w?: string; vista?: string };

/**
 * Diario semanal. La vista depende de la URL (contracts/diario-ui.md):
 * `/notes` semana actual · `?vista=anteriores` lista · `?w=<día>` semana pasada · `?d=<día>` desde el calendario.
 * Entrar desde la barra inferior (sin parámetros) abre siempre la semana actual (FR-032).
 */
export default async function NotesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { db, user, profile, today } = await requireSession();
  const { d, w, vista } = await searchParams;
  const currentMonday = startOfWeek(today);

  if (vista === 'anteriores') {
    const weeks = groupWeeks(await listNotesBefore(db, currentMonday));
    return <PastWeeksList weeks={weeks} />;
  }

  let pastMonday: Day | null = null;
  let focusDay: Day | undefined;
  if (w && isValidDay(w)) {
    const monday = startOfWeek(w);
    if (monday < currentMonday) pastMonday = monday;
  } else if (d && isValidDay(d) && d <= today) {
    if (d < currentMonday) pastMonday = startOfWeek(d);
    else focusDay = d;
  }

  if (pastMonday) {
    const notes = await listNotes(db, pastMonday, addDays(pastMonday, 6));
    return <PastWeek key={pastMonday} userId={user.id} monday={pastMonday} currentMonday={currentMonday} notes={notes} />;
  }

  const notes = await listNotes(db, currentMonday, today);
  return (
    <CurrentWeek
      key={focusDay ?? 'actual'}
      userId={user.id}
      timezone={profile.timezone}
      today={today}
      monday={currentMonday}
      notes={notes}
      focusDay={focusDay}
    />
  );
}
