import { route, readJson } from '@/lib/server/api';
import { profileUpdate } from '@/lib/validation';
import { deleteAccount, getProfile, updateProfile } from '@/features/profile/queries';

export const GET = route(async ({ db }) => getProfile(db));

export const PATCH = route(async ({ db, userId, request }) => updateProfile(db, userId, await readJson(request, profileUpdate)));

/** Borra la cuenta y todos sus datos. */
export const DELETE = route(async ({ db }) => {
  await deleteAccount(db);
}, { limit: 5 });
