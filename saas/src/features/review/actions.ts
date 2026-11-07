'use server';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/server/session';
import { safe } from '@/lib/server/action';
import { parse } from '@/lib/server/api';
import { dayParam, reviewAnswer } from '@/lib/validation';
import { answerReview, completeReview } from './queries';

export async function answerReviewAction(input: { day: string; habitId: string; answer: 'yes' | 'no' | 'skip' }) {
  return safe(async () => {
    const { db } = await requireSession();
    const v = parse(reviewAnswer, input);
    await answerReview(db, v.day, v.habitId, v.answer);
  });
}

export async function completeReviewAction(day: string) {
  return safe(async () => {
    const { db } = await requireSession();
    await completeReview(db, parse(dayParam, day));
    revalidatePath('/', 'layout');
  });
}
