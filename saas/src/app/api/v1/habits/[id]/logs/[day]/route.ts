import { route, parse } from '@/lib/server/api';
import { dayParam, uuidParam } from '@/lib/validation';
import { setHabitDone } from '@/features/habits/queries';

type Params = { id: string; day: string };

/** PUT marca el hábito como cumplido ese día (idempotente); DELETE lo desmarca. */
export const PUT = route<Params>(async ({ db }, { id, day }) => {
  await setHabitDone(db, parse(uuidParam, id), parse(dayParam, day), true);
});

export const DELETE = route<Params>(async ({ db }, { id, day }) => {
  await setHabitDone(db, parse(uuidParam, id), parse(dayParam, day), false);
});
