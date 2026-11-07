import type { DB } from '@/lib/supabase/server';
import type { Day } from '@/lib/dates';
import { check } from '@/lib/errors';

export type Answers = Record<string, 'yes' | 'no'>;

export async function getReview(db: DB, day: Day): Promise<{ answers: Answers; completed: boolean }> {
  const row = check(await db.from('review_sessions').select('answers, completed_at').eq('day', day).maybeSingle());
  return { answers: (row?.answers ?? {}) as Answers, completed: Boolean(row?.completed_at) };
}

/** Registra una respuesta del repaso. «Sí» marca el hábito; «No» lo desmarca; «Saltar» no guarda nada. */
export async function answerReview(db: DB, day: Day, habitId: string, answer: 'yes' | 'no' | 'skip'): Promise<void> {
  if (answer === 'skip') return;
  check(await db.rpc('record_review_answer', { p_day: day, p_habit_id: habitId, p_answer: answer }));
}

export async function completeReview(db: DB, day: Day): Promise<void> {
  check(
    await db
      .from('review_sessions')
      .upsert({ day, completed_at: new Date().toISOString() }, { onConflict: 'user_id,day' }),
  );
}
