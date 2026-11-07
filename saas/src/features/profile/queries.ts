import type { DB } from '@/lib/supabase/server';
import type { Profile } from '@/lib/db/types';
import { check, AppError } from '@/lib/errors';
import type { z } from 'zod';
import type { profileUpdate } from '@/lib/validation';

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
