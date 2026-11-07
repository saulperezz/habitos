import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/server/session';
import { listHabits } from '@/features/habits/queries';
import { isOverdue, listTasksInRange } from '@/features/tasks/queries';
import { listNotes } from '@/features/notes/queries';
import { formatDay, formatMonth, isValidDay, monthGrid, shiftMonth } from '@/lib/dates';
import { HabitChecklist } from '@/components/habit-checklist';
import { TaskForm } from '@/components/task-form';
import { TaskItem } from '@/components/task-item';

export const metadata: Metadata = { title: 'Calendario' };

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string; d?: string }> }) {
  const { db, today, nowTime } = await requireSession();
  const sp = await searchParams;
  const selected = sp.d && isValidDay(sp.d) ? sp.d : today;
  const month = sp.m && /^\d{4}-\d{2}$/.test(sp.m) && isValidDay(`${sp.m}-01`) ? sp.m : selected.slice(0, 7);
  const cells = monthGrid(month);
  const from = `${month}-01`;
  const to = cells[cells.length - 1]!;

  const [habits, tasks, notes] = await Promise.all([listHabits(db, { from, to }), listTasksInRange(db, from, to), listNotes(db, from, to)]);

  const doneByDay = new Map<string, number>();
  habits.forEach((h) => h.days.forEach((d) => doneByDay.set(d, (doneByDay.get(d) ?? 0) + 1)));
  const pendingDays = new Set(tasks.filter((t) => !t.done_at).map((t) => t.due_date));
  const noteDays = new Set(notes.map((n) => n.day));

  const selectedInMonth = selected.startsWith(month);
  const dayTasks = selectedInMonth ? tasks.filter((t) => t.due_date === selected) : [];
  const dayHabits = selectedInMonth
    ? habits.map((h) => ({ id: h.id, name: h.name, description: h.description, done: h.days.includes(selected) }))
    : [];
  const note = notes.find((n) => n.day === selected);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href={`/calendar?m=${shiftMonth(month, -1)}`} className="btn-ghost size-11 px-0" aria-label="Mes anterior">‹</Link>
        <h1 className="text-xl font-bold first-letter:uppercase">{formatMonth(month)}</h1>
        <Link href={`/calendar?m=${shiftMonth(month, 1)}`} className="btn-ghost size-11 px-0" aria-label="Mes siguiente">›</Link>
      </div>

      <div className="card p-3">
        <div className="grid grid-cols-7 text-center text-xs font-semibold text-muted">
          {WEEKDAYS.map((w) => (
            <span key={w} className="py-1">{w}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <span key={`e${i}`} />;
            const ratio = habits.length ? (doneByDay.get(d) ?? 0) / habits.length : 0;
            const isSel = d === selected;
            return (
              <Link
                key={d}
                href={`/calendar?m=${month}&d=${d}`}
                scroll={false}
                aria-label={formatDay(d)}
                aria-current={isSel ? 'date' : undefined}
                className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm ${isSel ? 'ring-2 ring-accent' : ''} ${d === today ? 'font-bold' : ''} ${d > today ? 'text-muted' : ''}`}
                style={ratio > 0 ? { background: `color-mix(in srgb, var(--accent) ${Math.round(15 + ratio * 70)}%, transparent)`, color: ratio > 0.6 ? 'var(--accent-ink)' : undefined } : undefined}
              >
                {Number(d.slice(8))}
                <span className="absolute bottom-1 flex gap-0.5">
                  {pendingDays.has(d) && <span className="size-1.5 rounded-full bg-warn" title="Tareas pendientes" />}
                  {noteDays.has(d) && <span className="size-1.5 rounded-full bg-text/60" title="Nota" />}
                </span>
              </Link>
            );
          })}
        </div>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>■ Hábitos cumplidos</span>
          <span><span className="text-warn">●</span> Tareas</span>
          <span>● Nota</span>
        </p>
      </div>

      {selectedInMonth && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold first-letter:uppercase">{formatDay(selected)}</h2>
          {dayHabits.length > 0 && selected <= today && (
            <div className="space-y-2">
              <h3 className="label">Hábitos</h3>
              <HabitChecklist habits={dayHabits} day={selected} />
            </div>
          )}
          <div className="space-y-2">
            <h3 className="label">Tareas</h3>
            {dayTasks.length > 0 && (
              <ul className="space-y-2">
                {dayTasks.map((t) => (
                  <TaskItem key={t.id} task={t} showDate={false} overdue={isOverdue(t, today, nowTime)} />
                ))}
              </ul>
            )}
            <TaskForm key={selected} fixedDate={selected} />
          </div>
          <div className="space-y-2">
            <h3 className="label">Diario</h3>
            <Link href={`/notes?d=${selected}`} className="card block text-sm">
              {note ? <span className="line-clamp-3 whitespace-pre-line">{note.body}</span> : <span className="text-muted">Escribir una nota para este día…</span>}
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
