'use server';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/server/session';
import { safe } from '@/lib/server/action';
import { parse } from '@/lib/server/api';
import { dayParam, habitCreate, habitUpdate, uuidParam } from '@/lib/validation';
import { createHabit, deleteHabit, reorderHabits, setHabitDone, updateHabit } from './queries';

export async function createHabitAction(input: { name: string; description?: string }) {
  return safe(async () => {
    const { db } = await requireSession();
    await createHabit(db, parse(habitCreate, input));
    revalidatePath('/', 'layout');
  });
}

export async function updateHabitAction(id: string, input: { name?: string; description?: string }) {
  return safe(async () => {
    const { db } = await requireSession();
    await updateHabit(db, parse(uuidParam, id), parse(habitUpdate, input));
    revalidatePath('/', 'layout');
  });
}

export async function deleteHabitAction(id: string) {
  return safe(async () => {
    const { db } = await requireSession();
    await deleteHabit(db, parse(uuidParam, id));
    revalidatePath('/', 'layout');
  });
}

export async function moveHabitAction(ids: string[]) {
  return safe(async () => {
    const { db } = await requireSession();
    await reorderHabits(db, ids.map((id) => parse(uuidParam, id)));
    revalidatePath('/', 'layout');
  });
}

export async function toggleHabitAction(habitId: string, day: string, done: boolean) {
  return safe(async () => {
    const { db } = await requireSession();
    await setHabitDone(db, parse(uuidParam, habitId), parse(dayParam, day), done);
    revalidatePath('/', 'layout');
  });
}
