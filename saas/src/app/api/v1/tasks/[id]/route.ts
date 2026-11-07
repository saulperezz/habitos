import { route, readJson, parse } from '@/lib/server/api';
import { taskUpdate, uuidParam } from '@/lib/validation';
import { deleteTask, updateTask } from '@/features/tasks/queries';

type Params = { id: string };

export const PATCH = route<Params>(async ({ db, request }, { id }) =>
  updateTask(db, parse(uuidParam, id), await readJson(request, taskUpdate)),
);

export const DELETE = route<Params>(async ({ db }, { id }) => {
  await deleteTask(db, parse(uuidParam, id));
});
