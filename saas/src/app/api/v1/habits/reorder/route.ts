import { route, readJson } from '@/lib/server/api';
import { habitReorder } from '@/lib/validation';
import { reorderHabits } from '@/features/habits/queries';

export const PUT = route(async ({ db, request }) => {
  await reorderHabits(db, (await readJson(request, habitReorder)).ids);
});
