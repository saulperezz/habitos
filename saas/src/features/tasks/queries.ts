import type { DB } from '@/lib/supabase/server';
import type { Task } from '@/lib/db/types';
import type { Day } from '@/lib/dates';
import { AppError, check } from '@/lib/errors';
import type { z } from 'zod';
import type { taskCreate, taskUpdate } from '@/lib/validation';

/** Tarea vencida: pendiente con fecha pasada, u hoy con hora ya pasada. */
export function isOverdue(t: Pick<Task, 'done_at' | 'due_date' | 'due_time'>, today: Day, nowTime: string): boolean {
  if (t.done_at || !t.due_date) return false;
  return t.due_date < today || (t.due_date === today && !!t.due_time && t.due_time.slice(0, 5) < nowTime);
}

/** Cursor opaco para paginar completadas por done_at desc (keyset, sin OFFSET). */
function encodeCursor(t: Task) {
  return Buffer.from(JSON.stringify([t.done_at, t.id])).toString('base64url');
}
function decodeCursor(cursor: string): [string, string] {
  try {
    const v = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (Array.isArray(v) && typeof v[0] === 'string' && typeof v[1] === 'string') return [v[0], v[1]];
  } catch {}
  throw new AppError('bad_request', 'Cursor inválido.');
}

export async function listPendingTasks(db: DB, limit = 500): Promise<Task[]> {
  // Orden: por fecha (sin fecha al final), sin hora antes que con hora, luego por creación.
  return check(
    await db
      .from('tasks')
      .select('*')
      .is('done_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('due_time', { ascending: true, nullsFirst: true })
      .order('created_at')
      .limit(limit),
  );
}

export async function listDoneTasks(db: DB, limit = 50, cursor?: string): Promise<{ items: Task[]; nextCursor: string | null }> {
  let q = db.from('tasks').select('*').not('done_at', 'is', null);
  if (cursor) {
    const [doneAt, id] = decodeCursor(cursor);
    q = q.or(`done_at.lt.${doneAt},and(done_at.eq.${doneAt},id.lt.${id})`);
  }
  const items = check(await q.order('done_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1));
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  return { items: page, nextCursor: hasMore ? encodeCursor(page[page.length - 1]!) : null };
}

export async function listTasksInRange(db: DB, from: Day, to: Day): Promise<Task[]> {
  return check(
    await db.from('tasks').select('*').gte('due_date', from).lte('due_date', to).order('due_time', { nullsFirst: true }).limit(2000),
  );
}

export async function createTask(db: DB, input: z.infer<typeof taskCreate>): Promise<Task> {
  return check(
    await db
      .from('tasks')
      .insert({ title: input.title, note: input.note ?? null, due_date: input.dueDate ?? null, due_time: input.dueTime ?? null })
      .select('*')
      .single(),
  );
}

export async function updateTask(db: DB, id: string, input: z.infer<typeof taskUpdate>): Promise<Task> {
  const clearsDate = input.dueDate === null;
  return check(
    await db
      .from('tasks')
      .update({
        title: input.title,
        note: input.note,
        due_date: input.dueDate,
        due_time: clearsDate ? null : input.dueTime,
        done_at: input.done === undefined ? undefined : input.done ? new Date().toISOString() : null,
      })
      .eq('id', id)
      .select('*')
      .single(),
  );
}

export async function deleteTask(db: DB, id: string): Promise<void> {
  check(await db.from('tasks').delete().eq('id', id).select('id').single());
}
