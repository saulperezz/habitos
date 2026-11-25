'use client';
import { useTransition } from 'react';
import { signOutAction } from '@/features/profile/actions';
import { unregisterPushAction } from '@/features/push/actions';
import { PUSH_FLAG, PUSH_SYNC_FLAG, currentSubscription, safeStorage } from '@/lib/push-client';

/** Da de baja los avisos de ESTE dispositivo (FR-005) y cierra sesión. Lo primero nunca bloquea lo segundo. */
async function forgetThisDevice(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await unregisterPushAction(sub.endpoint);
  await sub.unsubscribe();
}

export function SignOutButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn-ghost mt-2"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await Promise.race([forgetThisDevice().catch(() => undefined), new Promise((r) => setTimeout(r, 3000))]);
          safeStorage.remove('localStorage', PUSH_FLAG);
          safeStorage.remove('sessionStorage', PUSH_SYNC_FLAG);
          await signOutAction();
        })
      }
    >
      {pending ? 'Cerrando sesión…' : 'Cerrar sesión'}
    </button>
  );
}
