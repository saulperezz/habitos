import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/server/session';
import { listNotes } from '@/features/notes/queries';
import { addDays, formatDay, isValidDay, startOfWeek } from '@/lib/dates';
import { NoteEditor } from './note-editor';

export const metadata: Metadata = { title: 'Diario' };

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { db, today } = await requireSession();
  const { d } = await searchParams;
  const focus = d && isValidDay(d) ? d : today;
  const week = startOfWeek(focus);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const notes = await listNotes(db, days[0]!, days[6]!);
  const byDay = new Map(notes.map((n) => [n.day, n]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href={`/notes?d=${addDays(week, -7)}`} className="btn-ghost size-11 px-0" aria-label="Semana anterior">‹</Link>
        <div className="text-center">
          <h1 className="text-xl font-bold">Diario</h1>
          <p className="text-sm text-muted">
            {formatDay(days[0]!, { day: 'numeric', month: 'short' })} – {formatDay(days[6]!, { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
        <Link href={`/notes?d=${addDays(week, 7)}`} className="btn-ghost size-11 px-0" aria-label="Semana siguiente">›</Link>
      </div>
      <ul className="space-y-3">
        {days.map((day) => (
          <li key={day}>
            <NoteEditor
              day={day}
              label={formatDay(day, { weekday: 'long', day: 'numeric' })}
              isToday={day === today}
              initial={byDay.get(day)?.body ?? ''}
              autoFocus={day === d}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
