'use client';
import Link from 'next/link';
import { useState } from 'react';
import { visibleDaysPastWeek } from '@/features/notes/weeks';
import type { Note } from '@/lib/db/types';
import { formatDay, formatDayShort, type Day } from '@/lib/dates';
import { NoteField } from './note-field';
import { ConflictMessage, SaveStatus } from './save-status';
import { useNoteSaver } from './use-note-saver';
import { WeekHeader } from './week-header';

/** Semana pasada: lectura con «Editar»/«Hecho» (FR-020 a FR-022, FR-025). */
export function PastWeek({
  userId,
  monday,
  currentMonday,
  notes,
}: {
  userId: string;
  monday: Day;
  currentMonday: Day;
  notes: Note[];
}) {
  const saver = useNoteSaver(userId, notes);
  // Días visibles al pulsar «Editar»: mientras se edita, un día que se vacía no desaparece hasta
  // pulsar «Hecho». `null` = modo lectura.
  const [editingDays, setEditingDays] = useState<readonly Day[] | null>(null);
  const editing = editingDays !== null;

  const withText = new Set<Day>(editingDays ?? []);
  for (const n of notes) if (saver.valueOf(n.day).trim() !== '') withText.add(n.day);
  for (const [day, body] of Object.entries(saver.local)) if (body.trim() !== '') withText.add(day);
  const days = visibleDaysPastWeek(monday, withText);

  const toggle = () => {
    if (editing) saver.flush();
    setEditingDays(editing ? null : days);
  };

  return (
    <div className="space-y-4">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <Link href="/notes?vista=anteriores" className="btn-ghost">
          ← Notas anteriores
        </Link>
        <div className="flex items-center gap-3">
          <SaveStatus state={saver.state} />
          {(days.length > 0 || editing) && (
            <button type="button" onClick={toggle} className={editing ? 'btn-primary' : 'btn-ghost'}>
              {editing ? 'Hecho' : 'Editar'}
            </button>
          )}
        </div>
      </div>
      <WeekHeader monday={monday} currentMonday={currentMonday} />
      {days.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Esta semana no tiene notas.</p>
      ) : (
        <div className="space-y-5">
          {days.map((day) => (
            <section key={day}>
              {day !== monday && <h2 className="mb-1 text-sm font-semibold tracking-wide text-muted">{formatDayShort(day)}</h2>}
              {saver.notices[day] && <ConflictMessage notice={saver.notices[day]} />}
              {editing ? (
                <NoteField
                  value={saver.valueOf(day)}
                  onChange={(v) => saver.setText(day, v)}
                  label={`Diario del ${formatDay(day)}`}
                  boxed
                />
              ) : (
                <p className="py-1 text-base leading-relaxed break-words whitespace-pre-wrap">{saver.valueOf(day)}</p>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
