import type { DB } from '@/lib/supabase/server';
import type { Note } from '@/lib/db/types';
import type { Day } from '@/lib/dates';
import { check } from '@/lib/errors';

export async function listNotes(db: DB, from: Day, to: Day): Promise<Note[]> {
  return check(await db.from('notes').select('*').gte('day', from).lte('day', to).order('day'));
}

export async function getNote(db: DB, day: Day): Promise<Note | null> {
  return check(await db.from('notes').select('*').eq('day', day).maybeSingle());
}

/** Guardar texto vacío borra la nota (un día sin texto no se guarda). */
export async function saveNote(db: DB, day: Day, body: string): Promise<Note | null> {
  if (body.trim() === '') {
    check(await db.from('notes').delete().eq('day', day));
    return null;
  }
  return check(await db.from('notes').upsert({ day, body }, { onConflict: 'user_id,day' }).select('*').single());
}
