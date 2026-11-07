import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/features/profile/queries';
import { nowTimeIn, reviewDayIn, todayIn } from '@/lib/dates';

/** Contexto de la petición para páginas y Server Actions. Redirige a /login sin sesión. */
export const requireSession = cache(async () => {
  const db = await createClient();
  const { data } = await db.auth.getUser();
  if (!data.user) redirect('/login');
  const profile = await getProfile(db);
  const now = new Date();
  return {
    db,
    user: data.user,
    profile,
    today: todayIn(profile.timezone, now),
    nowTime: nowTimeIn(profile.timezone, now),
    reviewDay: reviewDayIn(profile.timezone, now),
  };
});
