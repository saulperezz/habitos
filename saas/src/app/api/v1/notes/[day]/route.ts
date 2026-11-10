import { route, readJson, parse } from '@/lib/server/api';
import { dayParam, noteSave } from '@/lib/validation';
import { getNote, saveNote, saveNoteSafe } from '@/features/notes/queries';

type Params = { day: string };

export const GET = route<Params>(async ({ db }, { day }) => (await getNote(db, parse(dayParam, day))) ?? null);

/**
 * PUT con body vacío borra la nota del día.
 * Sin `baseUpdatedAt`: el último guardado gana y responde `{ data: Note | null }` (comportamiento original).
 * Con `baseUpdatedAt` (y opcionalmente `deviceId`): detección de conflictos; nunca sobrescribe una
 * nota que cambió en otro dispositivo y responde `{ data: { outcome, note } }` con
 * `outcome` = saved | merged | kept | deleted | too_long (too_long = no se ha guardado nada).
 */
export const PUT = route<Params>(async ({ db, request }, { day }) => {
  const d = parse(dayParam, day);
  const input = await readJson(request, noteSave);
  if (input.baseUpdatedAt === undefined) return (await saveNote(db, d, input.body)) ?? null;
  return saveNoteSafe(db, d, input.body, input.baseUpdatedAt, input.deviceId ?? null);
});
