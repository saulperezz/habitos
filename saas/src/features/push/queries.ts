import type { DB } from '@/lib/supabase/server';
import { AppError, check } from '@/lib/errors';
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

/** Envía el aviso de prueba a este dispositivo mediante la Edge Function `push-test`, con la sesión del usuario. */
export async function sendTestPush(db: DB, endpoint: string): Promise<'sent' | 'gone'> {
  const { data } = await db.auth.getSession();
  const token = data.session?.access_token;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const failed = new AppError('internal', 'No se pudo enviar el aviso de prueba. Inténtalo de nuevo.');
  if (!token || !url || !key) throw failed;

  let res: Response;
  try {
    res = await fetch(`${url}/functions/v1/push-test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
      cache: 'no-store',
    });
  } catch {
    throw failed;
  }
  if (res.status === 404) throw new AppError('not_found', 'Este dispositivo ya no tiene los avisos activados.');
  if (!res.ok) throw failed;
  const body = (await res.json().catch(() => null)) as { result?: string } | null;
  return body?.result === 'gone' ? 'gone' : 'sent';
}
