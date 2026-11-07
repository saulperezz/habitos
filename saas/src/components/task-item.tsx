'use client';
import { useOptimistic, useState, useTransition } from 'react';
import { deleteTaskAction, updateTaskAction } from '@/features/tasks/actions';
import type { Task } from '@/lib/db/types';
import { formatDay } from '@/lib/dates';

export function TaskItem({ task, overdue, showDate = true }: { task: Task; overdue?: boolean; showDate?: boolean }) {
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useOptimistic(Boolean(task.done_at));

  const toggle = () =>
    start(async () => {
      setDone(!done);
      const r = await updateTaskAction(task.id, { done: !done });
      setError(r.ok ? null : r.error);
    });

  const when = [
    showDate && task.due_date ? formatDay(task.due_date, { weekday: 'short', day: 'numeric', month: 'short' }) : null,
    task.due_time ? task.due_time.slice(0, 5) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="card flex items-start gap-3">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={done}
        aria-label={done ? 'Marcar como pendiente' : 'Marcar como hecha'}
        className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border-2 text-xs font-bold ${done ? 'border-accent bg-accent text-accent-ink' : 'border-border'}`}
      >
        {done ? '✓' : ''}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`font-semibold break-words ${done ? 'text-muted line-through' : ''}`}>{task.title}</p>
        {task.note && <p className="text-sm break-words text-muted">{task.note}</p>}
        {when && (
          <p className={`mt-0.5 text-xs font-semibold first-letter:uppercase ${overdue ? 'text-danger' : 'text-muted'}`}>
            {overdue ? 'Vencida · ' : ''}
            {when}
          </p>
        )}
        {error && <p className="error mt-2" role="alert">{error}</p>}
      </div>
      <button
        type="button"
        aria-label="Eliminar tarea"
        className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-danger"
        onClick={() =>
          start(async () => {
            const r = await deleteTaskAction(task.id);
            setError(r.ok ? null : r.error);
          })
        }
      >
        ✕
      </button>
    </li>
  );
}
