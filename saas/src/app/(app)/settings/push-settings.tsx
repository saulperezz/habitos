'use client';
import { useEffect, useState, useTransition } from 'react';
import { registerPushAction, sendTestPushAction, unregisterPushAction } from '@/features/push/actions';
import { nowTimeIn } from '@/lib/dates';
import {
  PUSH_FLAG,
  PUSH_SYNC_FLAG,
  currentSubscription,
  getServiceWorker,
  isIosNotInstalled,
  isPushSupported,
  safeStorage,
  subscribe,
} from '@/lib/push-client';

type State = 'checking' | 'unsupported-ios' | 'unsupported' | 'off' | 'on' | 'blocked';
type Msg = { ok: boolean; text: string } | null;

const NETWORK_ERROR = 'No se pudieron cambiar los avisos. Inténtalo de nuevo.';
const GONE = 'Este dispositivo ya no tiene los avisos activados.';

/** Ajustes › Avisos: estado de los avisos en ESTE dispositivo (contracts/push-api.md §8). */
export function PushSettings(props: {
  endpoints: string[];
  reviewTime: string;
  reviewEnabled: boolean;
  timezone: string;
  vapidPublicKey: string | null;
}) {
  const [state, setState] = useState<State>('checking');
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const { endpoints, vapidPublicKey } = props;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let next: State;
      if (!isPushSupported() || !vapidPublicKey) {
        next = isIosNotInstalled() ? 'unsupported-ios' : 'unsupported';
      } else if (Notification.permission === 'denied') {
        next = 'blocked';
      } else {
        try {
          const reg = await getServiceWorker();
          const sub = await reg.pushManager.getSubscription();
          next = sub && endpoints.includes(sub.endpoint) ? 'on' : 'off';
        } catch {
          next = 'off';
        }
      }
      if (!cancelled) setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoints, vapidPublicKey]);

  function activate() {
    if (!vapidPublicKey) return;
    setMsg(null);
    start(async () => {
      // El permiso se pide solo aquí, dentro del clic (FR-002).
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off');
        return;
      }
      let sub: PushSubscription;
      try {
        sub = await subscribe(vapidPublicKey);
      } catch {
        setMsg({ ok: false, text: NETWORK_ERROR });
        return;
      }
      const r = await registerPushAction(sub.toJSON()).catch(() => null);
      if (!r || !r.ok) {
        await sub.unsubscribe().catch(() => undefined);
        setMsg({ ok: false, text: r ? r.error : NETWORK_ERROR });
        return;
      }
      safeStorage.set('localStorage', PUSH_FLAG, '1');
      setState('on');
      const passed = nowTimeIn(props.timezone) >= props.reviewTime;
      setMsg({
        ok: true,
        text: passed
          ? `Avisos activados. El primero llegará mañana a las ${props.reviewTime}.`
          : `Avisos activados. El primero llegará a las ${props.reviewTime}.`,
      });
    });
  }

  /** Solo este dispositivo deja de recibir avisos; los demás siguen igual (historia 3). */
  function deactivate() {
    setMsg(null);
    start(async () => {
      const sub = await currentSubscription().catch(() => null);
      if (sub) {
        const r = await unregisterPushAction(sub.endpoint).catch(() => null);
        if (!r || !r.ok) {
          setMsg({ ok: false, text: NETWORK_ERROR });
          return;
        }
        await sub.unsubscribe().catch(() => undefined);
      }
      safeStorage.remove('localStorage', PUSH_FLAG);
      safeStorage.remove('sessionStorage', PUSH_SYNC_FLAG);
      setState('off');
      setMsg({ ok: true, text: 'Avisos desactivados en este dispositivo.' });
    });
  }

  function sendTest() {
    setMsg(null);
    start(async () => {
      const sub = await currentSubscription().catch(() => null);
      if (!sub) {
        setState('off');
        return;
      }
      const r = await sendTestPushAction(sub.endpoint).catch(() => null);
      if (r?.ok) {
        setMsg({ ok: true, text: 'Aviso de prueba enviado.' });
        return;
      }
      const text = r ? r.error : 'No se pudo enviar el aviso de prueba. Inténtalo de nuevo.';
      if (text === GONE) {
        await sub.unsubscribe().catch(() => undefined);
        safeStorage.remove('localStorage', PUSH_FLAG);
        setState('off');
      }
      setMsg({ ok: false, text });
    });
  }

  return (
    <section className="card space-y-3" aria-labelledby="avisos-titulo">
      <p id="avisos-titulo" className="label">Avisos</p>

      {state === 'checking' && <p className="text-sm text-muted">Comprobando avisos…</p>}

      {state === 'unsupported-ios' && (
        <p className="text-sm">
          Para recibir avisos en iPhone, añade la app a la pantalla de inicio: Compartir › Añadir a pantalla de inicio.
        </p>
      )}

      {state === 'unsupported' && <p className="text-sm">Este navegador no permite avisos.</p>}

      {state === 'blocked' && (
        <p className="text-sm">Has bloqueado los avisos. Actívalos en los ajustes del navegador o del móvil.</p>
      )}

      {state === 'off' && (
        <>
          <p className="text-sm">
            {props.reviewEnabled
              ? `Recibe un aviso a las ${props.reviewTime} si aún no has hecho el repaso.`
              : 'Los avisos solo llegan con el repaso diario activado.'}
          </p>
          <button type="button" className="btn-primary" disabled={pending} onClick={activate}>
            {pending ? 'Activando…' : 'Activar avisos'}
          </button>
        </>
      )}

      {state === 'on' && (
        <>
          <p className="text-sm font-semibold">Avisos activados en este dispositivo ✓</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn-primary" disabled={pending} onClick={sendTest}>
              {pending ? 'Enviando…' : 'Enviar aviso de prueba'}
            </button>
            <button type="button" className="btn-ghost" disabled={pending} onClick={deactivate}>
              Desactivar avisos
            </button>
          </div>
        </>
      )}

      {msg && (
        <p className={`text-sm ${msg.ok ? 'text-accent' : 'text-danger'}`} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
