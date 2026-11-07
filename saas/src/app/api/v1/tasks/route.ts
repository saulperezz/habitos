import { route, readJson, parse, searchParams } from '@/lib/server/api';
import { taskCreate, taskListQuery } from '@/lib/validation';
import { createTask, listDoneTasks, listPendingTasks } from '@/features/tasks/queries';

/** GET /api/v1/tasks?status=pending|done&limit=50&cursor=… */
export const GET = route(async ({ db, request }) => {
  const q = parse(taskListQuery, searchParams(request));
  if (q.status === 'done') return listDoneTasks(db, q.limit, q.cursor);
  return { items: await listPendingTasks(db, 500), nextCursor: null };
});

export const POST = route(async ({ db, request }) => createTask(db, await readJson(request, taskCreate)));
