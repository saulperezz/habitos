import { describe, expect, it } from 'vitest';
import { habitCreate, legacyBackup, profileUpdate, rangeQuery, taskCreate } from '@/lib/validation';
import { backupFileName, needsBackupReminder } from '@/features/profile/queries';

describe('validación', () => {
  it('recorta y limita nombres de hábito', () => {
    expect(habitCreate.parse({ name: '  Leer  ' })).toEqual({ name: 'Leer' });
    expect(habitCreate.safeParse({ name: '   ' }).success).toBe(false);
    expect(habitCreate.safeParse({ name: 'x'.repeat(41) }).success).toBe(false);
  });

  it('tareas: cadenas vacías son null y la hora exige fecha', () => {
    expect(taskCreate.parse({ title: 'Pan', note: '', dueDate: '', dueTime: '' })).toEqual({ title: 'Pan', note: null, dueDate: null, dueTime: null });
    expect(taskCreate.safeParse({ title: 'Pan', dueTime: '10:00' }).success).toBe(false);
    expect(taskCreate.safeParse({ title: 'Pan', dueDate: '2026-02-30' }).success).toBe(false);
  });

  it('perfil: zona horaria y hora válidas', () => {
    expect(profileUpdate.safeParse({ timezone: 'America/Bogota' }).success).toBe(true);
    expect(profileUpdate.safeParse({ timezone: 'Nada/Nada' }).success).toBe(false);
    expect(profileUpdate.safeParse({ reviewTime: '24:00' }).success).toBe(false);
    expect(profileUpdate.safeParse({}).success).toBe(false);
  });

  it('rangos acotados para proteger la BD', () => {
    expect(rangeQuery.safeParse({ from: '2026-01-01', to: '2026-12-31' }).success).toBe(true);
    expect(rangeQuery.safeParse({ from: '2020-01-01', to: '2026-12-31' }).success).toBe(false);
    expect(rangeQuery.safeParse({ from: '2026-02-01', to: '2026-01-01' }).success).toBe(false);
  });

  it('reconoce la copia de la app original', () => {
    expect(legacyBackup.safeParse({ app: 'mis-habitos', version: 2, datos: { habits: [], habitos_tareas: [] } }).success).toBe(true);
    expect(legacyBackup.safeParse({ app: 'otra', version: 2, datos: { habits: [] } }).success).toBe(false);
    expect(legacyBackup.safeParse({ app: 'mis-habitos', version: 9, datos: { habits: [] } }).success).toBe(false);
  });

  it('copia de saas/: nombre del archivo y campos extra acotados', () => {
    expect(backupFileName('2026-11-03')).toBe('mis-habitos-2026-11-03.json');
    const base = { app: 'mis-habitos', version: 2, datos: { habits: [], habitos_tareas: [] } };
    expect(legacyBackup.safeParse({ ...base, datos: { ...base.datos, habitos_archivados: [{ id: 1 }], repasos: [{ fecha: '2026-11-01' }] } }).success).toBe(true);
    expect(legacyBackup.safeParse({ ...base, version: 3 }).success).toBe(false);
    expect(legacyBackup.safeParse({ ...base, datos: { ...base.datos, habitos_archivados: Array.from({ length: 501 }, () => ({})) } }).success).toBe(false);
  });
});

describe('aviso de copia de seguridad', () => {
  const now = new Date('2026-11-11T12:00:00.000Z');
  const DAY = 24 * 3600 * 1000;
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it('nunca exportado: avisa solo si hay datos', () => {
    expect(needsBackupReminder(null, true, now)).toBe(true);
    expect(needsBackupReminder(null, false, now)).toBe(false);
  });

  it('avisa a partir de 30 días y 1 ms', () => {
    expect(needsBackupReminder(ago(30 * DAY), true, now)).toBe(false);
    expect(needsBackupReminder(ago(30 * DAY + 1), true, now)).toBe(true);
    expect(needsBackupReminder(now.toISOString(), true, now)).toBe(false);
  });
});
