'use client';
import { useState, useTransition } from 'react';
import { createTaskAction } from '@/features/tasks/actions';

/** Alta de tarea. Con `fixedDate` (desde el calendario) la fecha viene dada. */
export function TaskForm({ fixedDate }: { fixedDate?: string }) {
  const [pending, start] = useTransition();
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState(fixedDate ?? '');
  const [dueTime, setDueTime] = useState('');
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="card space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createTaskAction({ title, note, dueDate, dueTime: dueDate ? dueTime : '' });
          if (r.ok) {
            setTitle('');
            setNote('');
            setDueTime('');
            if (!fixedDate) setDueDate('');
          }
          setError(r.ok ? null : r.error);
        });
      }}
    >
      <div className="flex gap-2">
        <label htmlFor={`task-title-${fixedDate ?? 'x'}`} className="sr-only">Nueva tarea</label>
        <input id={`task-title-${fixedDate ?? 'x'}`} className="input" placeholder="Nueva tarea" maxLength={80} required value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className="btn-primary shrink-0" disabled={pending || !title.trim()}>Añadir</button>
      </div>
      {more ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {!fixedDate && (
            <div>
              <label className="label" htmlFor="task-date">Fecha</label>
              <input id="task-date" type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          )}
          <div>
            <label className="label" htmlFor={`task-time-${fixedDate ?? 'x'}`}>Hora (opcional)</label>
            <input id={`task-time-${fixedDate ?? 'x'}`} type="time" className="input" disabled={!dueDate} value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor={`task-note-${fixedDate ?? 'x'}`}>Nota</label>
            <input id={`task-note-${fixedDate ?? 'x'}`} className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      ) : (
        <button type="button" className="text-sm font-semibold text-muted hover:text-text" onClick={() => setMore(true)}>
          + {fixedDate ? 'Hora y nota' : 'Fecha, hora y nota'}
        </button>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
