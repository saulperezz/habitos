/**
 * Texto del diario aún no confirmado por el servidor, guardado de forma síncrona en el
 * dispositivo para que sobreviva a cierres bruscos y a la falta de conexión.
 *
 * - Cada cuenta tiene su propia clave (`habitos:notas-pendientes:<userId>`): los pendientes de una
 *   cuenta solo los lee y envía esa misma cuenta, y no se borran al cerrar sesión.
 * - Nada aquí lanza excepciones: si `localStorage` no está disponible, el diario sigue funcionando
 *   solo con el servidor.
 */
import type { Day } from '@/lib/dates';

export type PendingNote = {
  body: string;
  /** `updated_at` de la nota del servidor cuando se empezó a editar (null si no existía). */
  base: string | null;
  /** Momento de la última pulsación (ms). */
  at: number;
};

type PendingMap = Record<Day, PendingNote>;

const PENDING_PREFIX = 'habitos:notas-pendientes:';
const DEVICE_KEY = 'habitos:dispositivo';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isPendingNote(v: unknown): v is PendingNote {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return typeof p.body === 'string' && (p.base === null || typeof p.base === 'string') && typeof p.at === 'number';
}

function read(userId: string): PendingMap {
  try {
    const raw = storage()?.getItem(PENDING_PREFIX + userId);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: PendingMap = {};
    for (const [day, value] of Object.entries(parsed)) if (isPendingNote(value)) out[day] = value;
    return out;
  } catch {
    return {};
  }
}

function write(userId: string, map: PendingMap): void {
  try {
    const s = storage();
    if (!s) return;
    if (Object.keys(map).length === 0) s.removeItem(PENDING_PREFIX + userId);
    else s.setItem(PENDING_PREFIX + userId, JSON.stringify(map));
  } catch {
    // Almacenamiento lleno o bloqueado: el texto sigue en memoria y se envía al servidor.
  }
}

export function listPending(userId: string): PendingMap {
  return read(userId);
}

export function getPending(userId: string, day: Day): PendingNote | null {
  return read(userId)[day] ?? null;
}

export function setPending(userId: string, day: Day, note: PendingNote): void {
  const map = read(userId);
  map[day] = note;
  write(userId, map);
}

/** Quita el pendiente solo si sigue siendo el texto que se acaba de confirmar. */
export function clearPendingIfUnchanged(userId: string, day: Day, body: string): void {
  const map = read(userId);
  if (map[day] && map[day].body === body) {
    delete map[day];
    write(userId, map);
  }
}

/** Actualiza la versión base de un pendiente que sigue sin confirmar (tras un guardado de un texto anterior). */
export function rebasePending(userId: string, day: Day, base: string | null): void {
  const map = read(userId);
  if (map[day]) {
    map[day] = { ...map[day], base };
    write(userId, map);
  }
}

let deviceId: string | null = null;

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Respaldo para navegadores sin randomUUID (contexto no seguro).
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (Number(c) ^ (Math.floor(Math.random() * 256) & (15 >> (Number(c) / 4)))).toString(16),
  );
}

/** Id aleatorio de este dispositivo; estable durante la sesión aunque `localStorage` falle. */
export function getDeviceId(): string {
  if (deviceId) return deviceId;
  let id: string | null = null;
  try {
    id = storage()?.getItem(DEVICE_KEY) ?? null;
  } catch {
    id = null;
  }
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    id = randomId();
    try {
      storage()?.setItem(DEVICE_KEY, id);
    } catch {
      // Se conserva en memoria.
    }
  }
  deviceId = id;
  return id;
}
