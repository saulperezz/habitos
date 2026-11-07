import type { DB } from '@/lib/supabase/server';
import type { Json } from '@/lib/db/types';
import { check } from '@/lib/errors';

export type ImportResult = { habits: number; logs: number; tasks: number; notes: number };

export async function importLegacyBackup(db: DB, backup: Record<string, unknown>): Promise<ImportResult> {
  return check(await db.rpc('import_legacy_backup', { payload: backup as Json })) as ImportResult;
}
