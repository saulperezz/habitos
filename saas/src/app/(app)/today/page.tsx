import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/server/session';
import { listHabits } from '@/features/habits/queries';
import { getReview } from '@/features/review/queries';
import { addDays, currentStreak, formatDay } from '@/lib/dates';
import { HabitChecklist } from '@/components/habit-checklist';
import { HabitManager } from './habit-manager';

export const metadata: Metadata = { title: 'Hoy' };

export default async function TodayPage() {
  const { db, profile, today, nowTime, reviewDay } = await requireSession();
  const [habits, review] = await Promise.all([
    listHabits(db, { from: addDays(today, -365), to: today }),
    getReview(db, reviewDay),
  ]);

  const yesterday = addDays(today, -1);
  const items = habits.map((h) => {
    const days = new Set(h.days);
    return { id: h.id, name: h.name, description: h.description, done: days.has(today), streakBefore: currentStreak(days, yesterday) };
  });
  const doneCount = items.filter((h) => h.done).length;
  const reviewDue =
    profile.review_enabled && habits.length > 0 && !review.completed && (reviewDay !== today || nowTime >= profile.review_time.slice(0, 5));

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm text-muted first-letter:uppercase">{formatDay(today)}</p>
        <h1 className="text-2xl font-bold">
          {habits.length === 0 ? 'Empieza con un hábito' : doneCount === habits.length ? '¡Día completo! 🎉' : `${doneCount} de ${habits.length} hechos`}
        </h1>
        {habits.length > 0 && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={habits.length} aria-valuenow={doneCount}>
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(doneCount / habits.length) * 100}%` }} />
          </div>
        )}
      </section>

      {reviewDue && (
        <Link href="/review" className="card flex items-center justify-between gap-3 border-accent">
          <span>
            <strong className="block">Es hora del repaso</strong>
            <span className="text-sm text-muted">Repasa tu día hábito a hábito en menos de un minuto.</span>
          </span>
          <span className="btn-primary shrink-0">Empezar</span>
        </Link>
      )}

      {items.length > 0 && <HabitChecklist habits={items} day={today} />}

      <HabitManager habits={habits.map(({ id, name, description }) => ({ id, name, description }))} />

      {habits.length > 0 && !reviewDue && (
        <Link href="/review" className="btn-ghost w-full">
          {review.completed ? 'Repetir el repaso' : 'Hacer el repaso ahora'}
        </Link>
      )}
    </div>
  );
}
