'use client';
import { useState, useTransition } from 'react';
import { createHabitAction, deleteHabitAction, moveHabitAction, updateHabitAction } from '@/features/habits/actions';

type H = { id: string; name: string; description: string | null };

export function HabitManager({ habits }: { habits: H[] }) {
  const [editing, setEditing] = useState(false);
  return (
    <section className="space-y-3">
      <AddHabit />
      {habits.length > 0 && (
        <button type="button" className="text-sm font-semibold text-muted hover:text-text" onClick={() => setEditing(!editing)}>
          {editing ? 'Listo' : 'Editar hábitos'}
        </button>
      )}
      {editing && (
        <ul className="space-y-2">
          {habits.map((h, i) => (
            <EditableHabit key={h.id} habit={h} index={i} ids={habits.map((x) => x.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AddHabit() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createHabitAction({ name });
          if (r.ok) setName('');
          setError(r.ok ? null : r.error);
        });
      }}
    >
      <label htmlFor="new-habit" className="sr-only">Nuevo hábito</label>
      <input id="new-habit" className="input" placeholder="Nuevo hábito (p. ej. Leer 10 min)" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} required />
      <button className="btn-primary shrink-0" disabled={pending || !name.trim()}>Añadir</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}

function EditableHabit({ habit, index, ids }: { habit: H; index: number; ids: string[] }) {
  const [pending, start] = useTransition();
  const [name, setName] = useState(habit.name);
  const [description, setDescription] = useState(habit.description ?? '');
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : (r.error ?? 'Error'));
    });

  const move = (delta: number) => {
    const next = [...ids];
    const j = index + delta;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j]!, next[index]!];
    run(() => moveHabitAction(next));
  };

  return (
    <li className="card space-y-2">
      <input className="input" aria-label="Nombre" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
      <input className="input" aria-label="Descripción" placeholder="Descripción (opcional)" maxLength={120} value={description} onChange={(e) => setDescription(e.target.value)} />
      {error && <p className="error" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={pending} onClick={() => run(() => updateHabitAction(habit.id, { name, description }))}>Guardar</button>
        <button type="button" className="btn-ghost" aria-label="Subir" disabled={pending || index === 0} onClick={() => move(-1)}>↑</button>
        <button type="button" className="btn-ghost" aria-label="Bajar" disabled={pending || index === ids.length - 1} onClick={() => move(1)}>↓</button>
        <button
          type="button"
          className="btn-danger ml-auto"
          disabled={pending}
          onClick={() => {
            if (confirm(`¿Eliminar «${habit.name}» y todo su historial?`)) run(() => deleteHabitAction(habit.id));
          }}
        >
          Eliminar
        </button>
      </div>
    </li>
  );
}
