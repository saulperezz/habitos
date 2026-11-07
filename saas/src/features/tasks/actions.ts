'use server';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/server/session';
import { safe } from '@/lib/server/action';
import { parse } from '@/lib/server/api';
import { taskCreate, taskUpdate, uuidParam } from '@/lib/validation';
import { createTask, deleteTask, updateTask } from './queries';

export type TaskInput = { title: string; note?: string; dueDate?: string; dueTime?: string };

export async function createTaskAction(input: TaskInput) {
  return safe(async () => {
    const { db } = await requireSession();
    await createTask(db, parse(taskCreate, input));
    revalidatePath('/', 'layout');
  });
}

export async function updateTaskAction(id: string, input: Partial<TaskInput> & { done?: boolean }) {
  return safe(async () => {
    const { db } = await requireSession();
    await updateTask(db, parse(uuidParam, id), parse(taskUpdate, input));
    revalidatePath('/', 'layout');
  });
}

export async function deleteTaskAction(id: string) {
  return safe(async () => {
    const { db } = await requireSession();
    await deleteTask(db, parse(uuidParam, id));
    revalidatePath('/', 'layout');
  });
}
