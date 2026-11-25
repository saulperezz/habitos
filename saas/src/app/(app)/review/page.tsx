import type { Metadata } from 'next';
import { requireSession } from '@/lib/server/session';
import { listHabits } from '@/features/habits/queries';
import { getReview } from '@/features/review/queries';
import { formatDay } from '@/lib/dates';
import { ReviewFlow } from './review-flow';

export const metadata: Metadata = { title: 'Repaso' };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ desde?: string }> }) {
  const [{ db, reviewDay }, params] = await Promise.all([requireSession(), searchParams]);
  const [habits, review] = await Promise.all([listHabits(db, { from: reviewDay, to: reviewDay }), getReview(db, reviewDay)]);
  return (
    <ReviewFlow
      day={reviewDay}
      dayLabel={formatDay(reviewDay)}
      habits={habits.map((h) => ({ id: h.id, name: h.name, description: h.description }))}
      answered={review.answers}
      completed={review.completed}
      fromReminder={params.desde === 'aviso'}
    />
  );
}
