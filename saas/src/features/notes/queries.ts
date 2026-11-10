import type { DB } from '@/lib/supabase/server';
import type { Note, SaveResult } from '@/lib/db/types';
import type { Day } from '@/lib/dates';
import { check } from '@/lib/errors';

export async function listNotes(db: DB, from: Day, to: Day): Promise<Note[]> {
  return check(await db.from('notes').select('*').gte('day', from).lte('day', to).order('day'));
}

/** Notas anteriores a `before` (día y texto), de la más reciente a la más antigua. */
export async function listNotesBefore(db: DB, before: Day): Promise<Pick<Note, 'day' | 'body'>[]> {
  return check(await db.from('notes').select('day, body').lt('day', before).order('day', { ascending: false }));
}

export async function getNote(db: DB, day: Day): Promise<Note | null> {
  return check(await db.from('notes').select('*').eq('day', day).maybeSingle());
}

/**
 * Guardado sin detección de conflictos (el último gana), para clientes de la API que no envían
 * versión. Guardar texto vacío borra la nota. Deja `last_device` nulo: así un reintento de un
 * dispositivo con una versión anterior se detecta como conflicto y no sobrescribe este texto.
 */
export async function saveNote(db: DB, day: Day, body: string): Promise<Note | null> {
  if (body.trim() === '') {
    check(await db.from('notes').delete().eq('day', day));
    return null;
  }
  return check(
    await db.from('notes').upsert({ day, body, last_device: null }, { onConflict: 'user_id,day' }).select('*').single(),
  );
}

/**
 * Guardado del diario: si la nota cambió desde `base` en otro dispositivo, nunca se sobrescribe
 * (se unen los textos, se conserva la del servidor o, si la unión es demasiado larga, no se guarda).
 */
export async function saveNoteSafe(
  db: DB,
  day: Day,
  body: string,
  base: string | null,
  deviceId: string | null,
): Promise<SaveResult> {
  const data = check(await db.rpc('save_note', { p_day: day, p_body: body, p_base: base, p_device: deviceId }));
  return data as unknown as SaveResult;
}
