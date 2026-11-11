import { route, readJson } from '@/lib/server/api';
import { BACKUP_MAX_BYTES, legacyBackup } from '@/lib/validation';
import { importLegacyBackup } from '@/features/profile/import';

/**
 * Importa una copia `mis-habitos-AAAA-MM-DD.json`, tanto de la app original como exportada desde
 * aquí (`GET /api/v1/export`). Reconoce lo que ya existe y solo añade lo que falta (hasta 4 MB).
 */
export const POST = route(
  async ({ db, request }) => importLegacyBackup(db, await readJson(request, legacyBackup, BACKUP_MAX_BYTES)),
  { limit: 5 },
);
