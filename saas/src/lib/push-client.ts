/**
 * Utilidades de avisos push en el navegador (spec 004), compartidas por Ajustes, PushSync y el
 * botón de cerrar sesión. Solo se usan desde componentes cliente.
 */

/** Marca local: el usuario activó los avisos en este dispositivo (research D8). */
export const PUSH_FLAG = 'habitos-avisos';
/** Ya se resincronizó en esta pestaña. */
export const PUSH_SYNC_FLAG = 'habitos-avisos-sync';

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** iPhone o iPad en Safari sin la app añadida a la pantalla de inicio. */
export function isIosNotInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

export async function getServiceWorker(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

/** Suscripción actual de este navegador, o null (sin crear ninguna ni pedir permiso). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

function base64urlToBytes(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Devuelve la suscripción existente o crea una nueva con la clave pública VAPID. */
export async function subscribe(vapidPublicKey: string): Promise<PushSubscription> {
  const reg = await getServiceWorker();
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64urlToBytes(vapidPublicKey) });
}

type StorageKind = 'localStorage' | 'sessionStorage';

/** Lecturas y escrituras que nunca fallan (navegación privada, almacenamiento bloqueado). */
export const safeStorage = {
  get(kind: StorageKind, key: string): string | null {
    try {
      return window[kind].getItem(key);
    } catch {
      return null;
    }
  },
  set(kind: StorageKind, key: string, value: string): void {
    try {
      window[kind].setItem(key, value);
    } catch {
      // sin almacenamiento solo se pierde la resincronización automática
    }
  },
  remove(kind: StorageKind, key: string): void {
    try {
      window[kind].removeItem(key);
    } catch {
      // ídem
    }
  },
};
