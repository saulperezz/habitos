'use client';
import { useEffect } from 'react';
import { registerPushAction } from '@/features/push/actions';
import { PUSH_FLAG, PUSH_SYNC_FLAG, isPushSupported, safeStorage, subscribe } from '@/lib/push-client';

/**
 * Al abrir la app, vuelve a registrar este dispositivo si el usuario activó aquí los avisos
 * (FR-008): algunos navegadores cambian la suscripción sin avisar. Una vez por pestaña, sin interfaz
 * y sin mostrar errores.
 */
export function PushSync({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  useEffect(() => {
    if (!vapidPublicKey || !isPushSupported()) return;
    if (safeStorage.get('localStorage', PUSH_FLAG) !== '1') return;
    if (safeStorage.get('sessionStorage', PUSH_SYNC_FLAG) === '1') return;
    if (Notification.permission === 'denied') {
      safeStorage.remove('localStorage', PUSH_FLAG);
      return;
    }
    if (Notification.permission !== 'granted') return;

    (async () => {
      try {
        const sub = await subscribe(vapidPublicKey);
        const r = await registerPushAction(sub.toJSON());
        if (r.ok) safeStorage.set('sessionStorage', PUSH_SYNC_FLAG, '1');
      } catch {
        // Se reintentará la próxima vez que se abra la app.
      }
    })();
  }, [vapidPublicKey]);

  return null;
}
