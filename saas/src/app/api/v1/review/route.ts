import { route, readJson, parse, searchParams } from '@/lib/server/api';
import { dayParam, reviewAnswer } from '@/lib/validation';
import { answerReview, getReview } from '@/features/review/queries';

export const GET = route(async ({ db, request }) => getReview(db, parse(dayParam, searchParams(request).day ?? '')));

export const POST = route(async ({ db, request }) => {
  const { day, habitId, answer } = await readJson(request, reviewAnswer);
  await answerReview(db, day, habitId, answer);
  return getReview(db, day);
});
