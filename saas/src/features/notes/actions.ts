'use server';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/server/session';
import { safe } from '@/lib/server/action';
import { parse } from '@/lib/server/api';
import { dayParam, noteUpsert } from '@/lib/validation';
import { saveNote } from './queries';

export async function saveNoteAction(day: string, body: string) {
  return safe(async () => {
    const { db } = await requireSession();
    await saveNote(db, parse(dayParam, day), parse(noteUpsert, { body }).body);
    revalidatePath('/notes');
    revalidatePath('/calendar');
  });
}
