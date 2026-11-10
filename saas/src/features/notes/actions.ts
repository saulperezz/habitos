'use server';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/server/session';
import { safe } from '@/lib/server/action';
import { parse } from '@/lib/server/api';
import { dayParam, noteSave } from '@/lib/validation';
import { saveNoteSafe } from './queries';

export async function saveNoteAction(day: string, body: string, base: string | null, deviceId: string) {
  return safe(async () => {
    const { db } = await requireSession();
    const input = parse(noteSave, { body, baseUpdatedAt: base, deviceId });
    const result = await saveNoteSafe(db, parse(dayParam, day), input.body, input.baseUpdatedAt ?? null, input.deviceId ?? null);
    if (result.outcome !== 'too_long') {
      revalidatePath('/notes');
      revalidatePath('/calendar');
    }
    return result;
  });
}
