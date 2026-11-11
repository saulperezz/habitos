import type { DB } from '@/lib/supabase/server';
import type { Profile } from '@/lib/db/types';
import { check, AppError } from '@/lib/errors';
import type { z } from 'zod';
import type { profileUpdate } from '@/lib/validation';
import type { Day } from '@/lib/dates';

export async function getProfile(db: DB): Promise<Profile> {
  const profile = check(await db.from('profiles').select('*').maybeSingle());
  if (!profile) throw new AppError('not_found', 'Perfil no encontrado.');
  return profile;
}

export async function updateProfile(db: DB, userId: string, input: z.infer<typeof profileUpdate>): Promise<Profile> {
  return check(
    await db
      .from('profiles')
      .update({
        display_name: input.displayName,
        timezone: input.timezone,
        review_time: input.reviewTime,
        review_enabled: input.reviewEnabled,
      })
      .eq('id', userId)
      .select('*')
      .single(),
  );
}

export async function deleteAccount(db: DB): Promise<void> {
  check(await db.rpc('delete_account'));
}

// --- Copia de seguridad ---------------------------------------------------------------------

/** Copia completa del usuario (formato de la app original + extras de saas/), generada en SQL. */
export async function exportBackup(db: DB): Promise<Record<string, unknown>> {
  return check(await db.rpc('export_backup')) as Record<string, unknown>;
}

export function backupFileName(day: Day): string {
  return `mis-habitos-${day}.json`;
}

/** Registra la última copia exportada; la fecha la pone `now()` de Postgres, no el reloj de Node. */
export async function markBackupExported(db: DB): Promise<void> {
  check(await db.rpc('mark_backup_exported'));
}

const BACKUP_REMINDER_MS = 30 * 24 * 3600 * 1000;

/** Aviso suave: más de 30 días desde la última copia, o nunca exportada y con datos. */
export function needsBackupReminder(lastExportedAt: string | null, hasData: boolean, now: Date): boolean {
  if (lastExportedAt === null) return hasData;
  const last = Date.parse(lastExportedAt);
  if (Number.isNaN(last)) return hasData;
  return now.getTime() - last > BACKUP_REMINDER_MS;
}

/** ¿Tiene el usuario al menos un hábito, una tarea o una nota? (RLS limita al propio usuario). */
export async function hasAnyData(db: DB): Promise<boolean> {
  const counts = await Promise.all(
    (['habits', 'tasks', 'notes'] as const).map(async (table) => {
      const result = await db.from(table).select('*', { count: 'exact', head: true }).limit(1);
      check(result);
      return result.count ?? 0;
    }),
  );
  return counts.some((c) => c > 0);
}
