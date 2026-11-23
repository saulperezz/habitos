import type { DB } from '@/lib/supabase/server';
import { check } from '@/lib/errors';
import type { PushSubscriptionInput } from '@/lib/validation';

/** Endpoints de los dispositivos del usuario con los avisos activados (RLS: solo los suyos). */
export async function listPushEndpoints(db: DB): Promise<string[]> {
  const rows = check(await db.from('push_subscriptions').select('endpoint'));
  return (rows ?? []).map((r) => r.endpoint);
}

/** Registra o renueva este dispositivo; si era de otra cuenta, pasa a esta (FR-006). */
export async function registerPush(db: DB, sub: PushSubscriptionInput): Promise<void> {
  check(
    await db.rpc('register_push_subscription', {
      p_endpoint: sub.endpoint,
      p_p256dh: sub.keys.p256dh,
      p_auth: sub.keys.auth,
    }),
  );
}

/** Deja de enviar avisos a este dispositivo (y solo a este). Borrar uno inexistente no es error. */
export async function unregisterPush(db: DB, endpoint: string): Promise<void> {
  check(await db.from('push_subscriptions').delete().eq('endpoint', endpoint));
}
