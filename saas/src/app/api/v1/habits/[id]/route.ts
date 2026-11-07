import { route, readJson, parse } from '@/lib/server/api';
import { habitUpdate, uuidParam } from '@/lib/validation';
import { deleteHabit, updateHabit } from '@/features/habits/queries';

type Params = { id: string };

export const PATCH = route<Params>(async ({ db, request }, { id }) =>
  updateHabit(db, parse(uuidParam, id), await readJson(request, habitUpdate)),
);

export const DELETE = route<Params>(async ({ db }, { id }) => {
  await deleteHabit(db, parse(uuidParam, id));
});
