import { route, readJson, parse, searchParams } from '@/lib/server/api';
import { habitCreate, rangeQuery } from '@/lib/validation';
import { createHabit, listHabits } from '@/features/habits/queries';

/** GET /api/v1/habits?from=AAAA-MM-DD&to=AAAA-MM-DD → hábitos activos con los días cumplidos del rango. */
export const GET = route(async ({ db, request }) => {
  const q = searchParams(request);
  return listHabits(db, q.from || q.to ? parse(rangeQuery, q) : undefined);
});

export const POST = route(async ({ db, request }) => createHabit(db, await readJson(request, habitCreate)));
