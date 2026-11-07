import type { DB } from '@/lib/supabase/server';
import type { Habit } from '@/lib/db/types';
import type { Day } from '@/lib/dates';
import { check } from '@/lib/errors';
import type { z } from 'zod';
import type { habitCreate, habitUpdate } from '@/lib/validation';

export type HabitWithLogs = Habit & { days: Day[] };

export async function listHabits(db: DB, range?: { from: Day; to: Day }): Promise<HabitWithLogs[]> {
  const habits = check(
    await db.from('habits').select('*').is('archived_at', null).order('position').order('created_at'),
  );
  if (!range || habits.length === 0) return habits.map((h) => ({ ...h, days: [] }));

  const logs = check(
    await db
      .from('habit_logs')
      .select('habit_id, day')
      .gte('day', range.from)
      .lte('day', range.to)
      .in('habit_id', habits.map((h) => h.id))
      .limit(100 * 400),
  );
  const byHabit = new Map<string, Day[]>();
  for (const l of logs) byHabit.set(l.habit_id, [...(byHabit.get(l.habit_id) ?? []), l.day]);
  return habits.map((h) => ({ ...h, days: (byHabit.get(h.id) ?? []).sort() }));
}

export async function createHabit(db: DB, input: z.infer<typeof habitCreate>): Promise<Habit> {
  const last = check(
    await db.from('habits').select('position').is('archived_at', null).order('position', { ascending: false }).limit(1),
  );
  return check(
    await db
      .from('habits')
      .insert({ name: input.name, description: input.description ?? null, position: (last[0]?.position ?? -1) + 1 })
      .select('*')
      .single(),
  );
}

export async function updateHabit(db: DB, id: string, input: z.infer<typeof habitUpdate>): Promise<Habit> {
  return check(
    await db
      .from('habits')
      .update({
        name: input.name,
        description: input.description,
        position: input.position,
        archived_at: input.archived === undefined ? undefined : input.archived ? new Date().toISOString() : null,
      })
      .eq('id', id)
      .select('*')
      .single(),
  );
}

export async function deleteHabit(db: DB, id: string): Promise<void> {
  check(await db.from('habits').delete().eq('id', id).select('id').single());
}

export async function reorderHabits(db: DB, ids: string[]): Promise<void> {
  // ≤100 hábitos por usuario: actualizaciones en paralelo, cada una protegida por RLS.
  const results = await Promise.all(ids.map((id, position) => db.from('habits').update({ position }).eq('id', id)));
  results.forEach((r) => check(r));
}

export async function setHabitDone(db: DB, habitId: string, day: Day, done: boolean): Promise<void> {
  if (done) {
    check(await db.from('habit_logs').upsert({ habit_id: habitId, day }, { onConflict: 'habit_id,day', ignoreDuplicates: true }));
  } else {
    check(await db.from('habit_logs').delete().eq('habit_id', habitId).eq('day', day));
  }
}
