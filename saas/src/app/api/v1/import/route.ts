import { route, readJson } from '@/lib/server/api';
import { legacyBackup } from '@/lib/validation';
import { importLegacyBackup } from '@/features/profile/import';

/** Importa la copia `mis-habitos-AAAA-MM-DD.json` exportada desde la app original. */
export const POST = route(async ({ db, request }) => importLegacyBackup(db, await readJson(request, legacyBackup)), { limit: 5 });
