import { beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.has(k) ? this.data.get(k)! : null; }
  setItem(k: string, v: string) { this.data.set(k, String(v)); }
  removeItem(k: string) { this.data.delete(k); }
}

class BrokenStorage {
  getItem(): string | null { throw new Error('bloqueado'); }
  setItem(): void { throw new Error('bloqueado'); }
  removeItem(): void { throw new Error('bloqueado'); }
}

async function load(storage: unknown) {
  vi.resetModules();
  vi.stubGlobal('localStorage', storage);
  return import('@/features/notes/pending-store');
}

describe('pending-store', () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('guarda, lee y limpia pendientes por usuario', async () => {
    const s = await load(storage);
    s.setPending('u1', '2026-11-10', { body: 'hola', base: null, at: 1 });
    expect(s.getPending('u1', '2026-11-10')).toEqual({ body: 'hola', base: null, at: 1 });
    expect(storage.getItem('habitos:notas-pendientes:u1')).toContain('hola');

    s.clearPendingIfUnchanged('u1', '2026-11-10', 'otro texto');
    expect(s.getPending('u1', '2026-11-10')).not.toBeNull();
    s.clearPendingIfUnchanged('u1', '2026-11-10', 'hola');
    expect(s.getPending('u1', '2026-11-10')).toBeNull();
  });

  it('aísla los pendientes de cada usuario y no los borra al usar otra cuenta', async () => {
    const s = await load(storage);
    s.setPending('u1', '2026-11-10', { body: 'de u1', base: null, at: 1 });
    expect(s.getPending('u2', '2026-11-10')).toBeNull();
    expect(s.listPending('u2')).toEqual({});
    s.setPending('u2', '2026-11-10', { body: 'de u2', base: null, at: 2 });
    s.clearPendingIfUnchanged('u2', '2026-11-10', 'de u2');
    expect(s.listPending('u1')).toEqual({ '2026-11-10': { body: 'de u1', base: null, at: 1 } });
  });

  it('el id de dispositivo es estable y se guarda', async () => {
    const s = await load(storage);
    const id = s.getDeviceId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(s.getDeviceId()).toBe(id);
    expect(storage.getItem('habitos:dispositivo')).toBe(id);
    const again = await load(storage);
    expect(again.getDeviceId()).toBe(id);
  });

  it('funciona sin excepciones y con id estable si localStorage falla', async () => {
    const s = await load(new BrokenStorage());
    expect(() => s.setPending('u1', '2026-11-10', { body: 'x', base: null, at: 1 })).not.toThrow();
    expect(s.getPending('u1', '2026-11-10')).toBeNull();
    expect(s.listPending('u1')).toEqual({});
    expect(() => s.clearPendingIfUnchanged('u1', '2026-11-10', 'x')).not.toThrow();
    const id = s.getDeviceId();
    expect(s.getDeviceId()).toBe(id);
  });

  it('ignora datos dañados', async () => {
    storage.setItem('habitos:notas-pendientes:u1', '{no es json');
    const s = await load(storage);
    expect(s.listPending('u1')).toEqual({});
  });
});
