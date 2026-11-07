'use client';
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { answerReviewAction, completeReviewAction } from '@/features/review/actions';

type H = { id: string; name: string; description: string | null };
type Answer = 'yes' | 'no' | 'skip';

export function ReviewFlow({
  day,
  dayLabel,
  habits,
  answered,
  completed,
}: {
  day: string;
  dayLabel: string;
  habits: H[];
  answered: Record<string, 'yes' | 'no'>;
  completed: boolean;
}) {
  // Si se interrumpió, se continúa por los hábitos sin responder; si ya se completó, se repasan todos.
  const queue = useMemo(() => (completed ? habits : habits.filter((h) => !answered[h.id])), [habits, answered, completed]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Record<string, Answer>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const current = queue[index];
  const finished = index >= queue.length;

  function answer(a: Answer) {
    if (!current) return;
    setError(null);
    const habit = current;
    setResults((r) => ({ ...r, [habit.id]: a }));
    setIndex((i) => i + 1);
    const isLast = index + 1 >= queue.length;
    start(async () => {
      const r = await answerReviewAction({ day, habitId: habit.id, answer: a });
      if (!r.ok) setError(r.error);
      if (isLast) await completeReviewAction(day);
    });
  }

  if (habits.length === 0) {
    return (
      <div className="card space-y-3 text-center">
        <p>Aún no tienes hábitos que repasar.</p>
        <Link href="/today" className="btn-primary">Crear un hábito</Link>
      </div>
    );
  }

  if (finished) {
    const yes = habits.filter((h) => (results[h.id] ?? answered[h.id]) === 'yes').length;
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-5xl" aria-hidden>{yes === habits.length ? '🎉' : '🌙'}</p>
        <h1 className="text-2xl font-bold">{yes} de {habits.length} cumplidos</h1>
        <p className="text-muted">{yes === habits.length ? '¡Día perfecto!' : 'Mañana es otra oportunidad.'}</p>
        {error && <p className="error" role="alert">{error}</p>}
        <Link href="/today" className="btn-primary" aria-disabled={pending}>Volver a hoy</Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70dvh] flex-col">
      <div className="flex items-center justify-between text-sm text-muted">
        <span className="first-letter:uppercase">{dayLabel}</span>
        <span>{index + 1} / {queue.length}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-accent transition-all" style={{ width: `${(index / queue.length) * 100}%` }} />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm text-muted">¿Has cumplido hoy…?</p>
        <h1 className="text-3xl font-bold">{current!.name}</h1>
        {current!.description && <p className="text-muted">{current!.description}</p>}
      </div>
      {error && <p className="error mb-3" role="alert">{error}</p>}
      <div className="grid gap-3">
        <button type="button" className="btn-primary min-h-14 text-base" onClick={() => answer('yes')}>Sí, cumplido</button>
        <button type="button" className="btn-ghost min-h-14 text-base" onClick={() => answer('no')}>No</button>
        <button type="button" className="btn min-h-11 text-muted" onClick={() => answer('skip')}>Saltar</button>
      </div>
    </div>
  );
}
