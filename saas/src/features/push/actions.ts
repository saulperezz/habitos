'use server';
import { requireSession } from '@/lib/server/session';
import { safe } from '@/lib/server/action';
import { parse } from '@/lib/server/api';
import { AppError } from '@/lib/errors';
import { pushEndpoint, pushSubscription } from '@/lib/validation';
import { rateLimit } from '@/lib/server/rate-limit';
import { registerPush, sendTestPush, unregisterPush } from './queries';

const DEVICE_LIMIT = 'Ya tienes avisos en 10 dispositivos. Desactívalos en alguno para añadir este.';
const NOT_SUPPORTED = 'Este dispositivo no es compatible con los avisos.';

/** Activa los avisos en este dispositivo. Recibe `PushSubscription.toJSON()`. */
export async function registerPushAction(input: unknown) {
  return safe(async () => {
    const { db } = await requireSession();
    let sub;
    try {
      sub = parse(pushSubscription, input);
    } catch {
      throw new AppError('bad_request', NOT_SUPPORTED);
    }
    try {
      await registerPush(db, sub);
    } catch (err) {
      if (err instanceof AppError && err.code === 'limit_exceeded') throw new AppError('limit_exceeded', DEVICE_LIMIT);
      throw err;
    }
  });
}

/** Desactiva los avisos en este dispositivo (también al cerrar sesión, FR-005). */
export async function unregisterPushAction(endpoint: string) {
  return safe(async () => {
    const { db } = await requireSession();
    await unregisterPush(db, parse(pushEndpoint, endpoint));
  });
}

/** Aviso de prueba solo a este dispositivo; como mucho 5 por minuto (FR-019). */
export async function sendTestPushAction(endpoint: string) {
  return safe(async () => {
    const { db, user } = await requireSession();
    const limit = await rateLimit(`push-test:${user.id}`, 5, 60);
    if (!limit.ok) throw new AppError('rate_limited', 'Espera un momento antes de enviar otra prueba.');
    const result = await sendTestPush(db, parse(pushEndpoint, endpoint));
    if (result === 'gone') throw new AppError('not_found', 'Este dispositivo ya no tiene los avisos activados.');
  });
}
