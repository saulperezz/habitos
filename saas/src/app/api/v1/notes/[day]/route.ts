import { route, readJson, parse } from '@/lib/server/api';
import { dayParam, noteUpsert } from '@/lib/validation';
import { getNote, saveNote } from '@/features/notes/queries';

type Params = { day: string };

export const GET = route<Params>(async ({ db }, { day }) => (await getNote(db, parse(dayParam, day))) ?? null);

/** PUT con body vacío borra la nota del día. */
export const PUT = route<Params>(async ({ db, request }, { day }) =>
  (await saveNote(db, parse(dayParam, day), (await readJson(request, noteUpsert)).body)) ?? null,
);
