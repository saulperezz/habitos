'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { saveNoteAction } from '@/features/notes/actions';
import {
  clearPendingIfUnchanged,
  getDeviceId,
  listPending,
  rebasePending,
  setPending,
} from '@/features/notes/pending-store';
import type { Note, SaveOutcome } from '@/lib/db/types';
import type { Day } from '@/lib/dates';

/**
 * Guardado del diario sin pérdidas (FR-009 a FR-013, FR-030, FR-033):
 * - cada pulsación se copia de forma síncrona en el dispositivo (pending-store);
 * - se envía al servidor 400 ms después de dejar de escribir (Server Action);
 * - al ocultar o cerrar la app se envía con `fetch keepalive` (salvo los días con una petición
 *   en curso, para que nunca llegue después un texto anterior);
 * - lo no confirmado se reintenta al recuperar la conexión, al volver a la app y cada 15 s.
 */

const DEBOUNCE_MS = 400;
const RETRY_MS = 15_000;
const SEPARATOR = '\n\n— — —\n\n';

export type SaveState = 'idle' | 'saving' | 'saved' | 'unsaved';
export type ConflictNotice = 'merged' | 'kept' | 'too_long';

type ServerNote = Pick<Note, 'day' | 'body' | 'updated_at'>;
type Outcome = { outcome: SaveOutcome; note: Pick<Note, 'body' | 'updated_at'> | null };

/**
 * Texto local tras un conflicto: el del servidor (que ya incluye lo enviado) más lo que se haya
 * escrito mientras se guardaba. Nunca descarta nada de lo escrito.
 */
function rebaseLocal(serverBody: string, sent: string, current: string): string {
  if (current === sent) return serverBody;
  if (sent !== '' && current.startsWith(sent)) return serverBody + current.slice(sent.length);
  return serverBody + SEPARATOR + current;
}

export function useNoteSaver(userId: string, serverNotes: readonly ServerNote[]) {
  const server = new Map(serverNotes.map((n) => [n.day, n]));
  const serverRef = useRef(server);
  useLayoutEffect(() => {
    serverRef.current = server;
  });

  /** Textos editados en este dispositivo (los demás se muestran tal como vienen del servidor). */
  const [local, setLocal] = useState<Record<Day, string>>({});
  const localRef = useRef(local);
  const [notices, setNotices] = useState<Record<Day, ConflictNotice>>({});
  const [state, setState] = useState<SaveState>('idle');

  const bases = useRef(new Map<Day, string | null>());
  const timers = useRef(new Map<Day, ReturnType<typeof setTimeout>>());
  const inflight = useRef(new Set<Day>());
  const failed = useRef(new Set<Day>());
  /** Días cuyo guardado dio `too_long`, con el texto rechazado (no se reintenta sin cambios). */
  const blocked = useRef(new Map<Day, string>());
  const savedOnce = useRef(false);

  const refreshState = useCallback(() => {
    if (timers.current.size > 0 || inflight.current.size > 0) setState('saving');
    else if (failed.current.size > 0 || blocked.current.size > 0) setState('unsaved');
    else setState(savedOnce.current ? 'saved' : 'idle');
  }, []);

  const writeLocal = useCallback((day: Day, body: string) => {
    localRef.current = { ...localRef.current, [day]: body };
    setLocal(localRef.current);
  }, []);

  const baseOf = useCallback((day: Day): string | null => {
    if (bases.current.has(day)) return bases.current.get(day) ?? null;
    return serverRef.current.get(day)?.updated_at ?? null;
  }, []);

  const textOf = useCallback(
    (day: Day): string => localRef.current[day] ?? serverRef.current.get(day)?.body ?? '',
    [],
  );

  const setNotice = useCallback((day: Day, notice: ConflictNotice | null) => {
    setNotices((prev) => {
      if (notice === null) {
        if (!(day in prev)) return prev;
        const next = { ...prev };
        delete next[day];
        return next;
      }
      return { ...prev, [day]: notice };
    });
  }, []);

  // `send` y `handleResult` se llaman entre sí; se guardan en refs para evitar dependencias circulares.
  const sendRef = useRef<(day: Day) => void>(() => {});

  const handleResult = useCallback(
    (day: Day, sent: string, result: Outcome) => {
      inflight.current.delete(day);
      failed.current.delete(day);
      const current = localRef.current[day] ?? sent;

      if (result.outcome === 'too_long') {
        blocked.current.set(day, sent);
        setNotice(day, 'too_long');
        if (current !== sent) sendRef.current(day);
        refreshState();
        return;
      }

      blocked.current.delete(day);
      savedOnce.current = true;
      const base = result.outcome === 'deleted' ? null : (result.note?.updated_at ?? null);
      bases.current.set(day, base);

      if ((result.outcome === 'merged' || result.outcome === 'kept') && result.note) {
        setNotice(day, result.outcome);
        const next = rebaseLocal(result.note.body, sent, current);
        writeLocal(day, next);
        if (next === result.note.body) {
          clearPendingIfUnchanged(userId, day, current);
        } else {
          setPending(userId, day, { body: next, base, at: Date.now() });
          sendRef.current(day);
        }
      } else if (current === sent) {
        clearPendingIfUnchanged(userId, day, sent);
      } else {
        // Se siguió escribiendo durante la petición: se envía el texto más reciente.
        rebasePending(userId, day, base);
        sendRef.current(day);
      }
      refreshState();
    },
    [refreshState, setNotice, userId, writeLocal],
  );

  const send = useCallback(
    (day: Day) => {
      const timer = timers.current.get(day);
      if (timer) {
        clearTimeout(timer);
        timers.current.delete(day);
      }
      if (inflight.current.has(day)) {
        refreshState();
        return; // Al terminar la petición en curso se reenvía el texto más reciente.
      }
      const body = textOf(day);
      if (blocked.current.get(day) === body) {
        refreshState();
        return;
      }
      inflight.current.add(day);
      refreshState();
      saveNoteAction(day, body, baseOf(day), getDeviceId())
        .then((r) => {
          if (r.ok) handleResult(day, body, r.data);
          else throw new Error(r.error);
        })
        .catch(() => {
          inflight.current.delete(day);
          failed.current.add(day);
          refreshState();
        });
    },
    [baseOf, handleResult, refreshState, textOf],
  );
  useLayoutEffect(() => {
    sendRef.current = send;
  }, [send]);

  /** Cada pulsación: copia síncrona en el dispositivo y guardado a los 400 ms. */
  const setText = useCallback(
    (day: Day, body: string) => {
      if (!bases.current.has(day)) bases.current.set(day, baseOf(day));
      writeLocal(day, body);
      setPending(userId, day, { body, base: bases.current.get(day) ?? null, at: Date.now() });
      setNotice(day, null);
      const timer = timers.current.get(day);
      if (timer) clearTimeout(timer);
      timers.current.set(
        day,
        setTimeout(() => sendRef.current(day), DEBOUNCE_MS),
      );
      refreshState();
    },
    [baseOf, refreshState, setNotice, userId, writeLocal],
  );

  /** Guarda ya todo lo pendiente (al cambiar de vista, al pulsar «Hecho», al desmontar). */
  const flush = useCallback(() => {
    const days = new Set<Day>([...timers.current.keys(), ...failed.current, ...Object.keys(listPending(userId))]);
    for (const day of days) send(day);
  }, [send, userId]);

  // Al montar: recuperar lo que quedó sin guardar en este dispositivo (solo de esta cuenta) y reenviarlo.
  useEffect(() => {
    const pending = listPending(userId);
    for (const [day, p] of Object.entries(pending)) {
      bases.current.set(day, p.base);
      writeLocal(day, p.body);
    }
    for (const day of Object.keys(pending)) send(day);
  }, [send, userId, writeLocal]);

  // Al ocultar o cerrar la app: envío que el navegador completa aunque se descargue la página.
  useEffect(() => {
    const sendWithKeepalive = () => {
      const pending = listPending(userId);
      for (const [day, p] of Object.entries(pending)) {
        const timer = timers.current.get(day);
        if (timer) {
          clearTimeout(timer);
          timers.current.delete(day);
        }
        if (inflight.current.has(day) || blocked.current.get(day) === p.body) continue;
        inflight.current.add(day);
        const base = bases.current.has(day) ? (bases.current.get(day) ?? null) : p.base;
        fetch(`/api/v1/notes/${day}`, {
          method: 'PUT',
          keepalive: true,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ body: p.body, baseUpdatedAt: base, deviceId: getDeviceId() }),
        })
          .then(async (res) => {
            if (!res.ok) throw new Error(String(res.status));
            const { data } = (await res.json()) as { data: Outcome };
            handleResult(day, p.body, data);
          })
          .catch(() => {
            inflight.current.delete(day);
            failed.current.add(day);
            refreshState();
          });
      }
      refreshState();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') sendWithKeepalive();
      else flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', sendWithKeepalive);
    window.addEventListener('online', flush);
    const interval = setInterval(() => {
      if (failed.current.size > 0 || Object.keys(listPending(userId)).length > 0) flush();
    }, RETRY_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', sendWithKeepalive);
      window.removeEventListener('online', flush);
      clearInterval(interval);
    };
  }, [flush, handleResult, refreshState, userId]);

  // Al salir de la vista (cambio de pestaña o de semana): guardar lo pendiente.
  const flushRef = useRef(flush);
  useLayoutEffect(() => {
    flushRef.current = flush;
  }, [flush]);
  useEffect(() => () => flushRef.current(), []);

  /** Texto que se muestra: lo editado en este dispositivo o, si no, lo del servidor. */
  const valueOf = (day: Day): string => local[day] ?? server.get(day)?.body ?? '';

  return { local, valueOf, setText, flush, notices, state };
}
