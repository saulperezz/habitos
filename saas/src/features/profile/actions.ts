'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/server/session';
import { safe } from '@/lib/server/action';
import { parse } from '@/lib/server/api';
import { legacyBackup, profileUpdate } from '@/lib/validation';
import { AppError } from '@/lib/errors';
import { deleteAccount, updateProfile } from './queries';
import { importLegacyBackup } from './import';

export async function updateProfileAction(input: { timezone?: string; reviewTime?: string; reviewEnabled?: boolean; displayName?: string }) {
  return safe(async () => {
    const { db, user } = await requireSession();
    await updateProfile(db, user.id, parse(profileUpdate, input));
    revalidatePath('/', 'layout');
  });
}

export async function importBackupAction(json: string) {
  return safe(async () => {
    if (json.length > 2 * 1024 * 1024) throw new AppError('payload_too_large', 'El archivo es demasiado grande (máx. 2 MB).');
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      throw new AppError('bad_request', 'El archivo no es JSON válido.');
    }
    const { db } = await requireSession();
    const result = await importLegacyBackup(db, parse(legacyBackup, raw));
    revalidatePath('/', 'layout');
    return result;
  });
}

export async function signOutAction() {
  const { db } = await requireSession();
  await db.auth.signOut();
  redirect('/login');
}

export async function deleteAccountAction(confirmation: string) {
  const result = await safe(async () => {
    if (confirmation !== 'BORRAR') throw new AppError('bad_request', 'Escribe BORRAR para confirmar.');
    const { db } = await requireSession();
    await deleteAccount(db);
    await db.auth.signOut();
  });
  if (result.ok) redirect('/?cuenta=borrada');
  return result;
}
