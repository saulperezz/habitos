'use client';
import { useOptimistic, useState, useTransition } from 'react';
import { toggleHabitAction } from '@/features/habits/actions';

export type ChecklistHabit = {
  id: string;
  name: string;
  description: string | null;
  done: boolean;
  /** Racha que termina el día anterior; se muestra +1 si está marcado. */
  streakBefore?: number;
};

/** Lista de hábitos de un día con marcado optimista (la UI responde al instante). */
export function HabitChecklist({ habits, day }: { habits: ChecklistHabit[]; day: string }) {
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useOptimistic(habits, (state, { id, done }: { id: string; done: boolean }) =>
    state.map((h) => (h.id === id ? { ...h, done } : h)),
  );

  function toggle(h: ChecklistHabit) {
    setError(null);
    startTransition(async () => {
      setOptimistic({ id: h.id, done: !h.done });
      const r = await toggleHabitAction(h.id, day, !h.done);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="space-y-2">
      {error && <p className="error" role="alert">{error}</p>}
      <ul className="space-y-2">
        {optimistic.map((h) => (
          <li key={h.id}>
            <button
              type="button"
              onClick={() => toggle(h)}
              aria-pressed={h.done}
              className={`card flex w-full items-center gap-3 text-left transition-colors ${h.done ? 'border-accent bg-accent-soft' : ''}`}
            >
              <span
                aria-hidden
                className={`grid size-8 shrink-0 place-items-center rounded-full border-2 text-sm font-bold ${h.done ? 'border-accent bg-accent text-accent-ink' : 'border-border'}`}
              >
                {h.done ? '✓' : ''}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{h.name}</span>
                {h.description && <span className="block truncate text-sm text-muted">{h.description}</span>}
              </span>
              {h.streakBefore !== undefined && h.streakBefore + (h.done ? 1 : 0) > 0 && (
                <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted" title="Racha de días seguidos">
                  🔥 {h.streakBefore + (h.done ? 1 : 0)}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
