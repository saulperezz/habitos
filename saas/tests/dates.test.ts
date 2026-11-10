import { describe, expect, it } from 'vitest';
import { addDays, currentStreak, formatDayShort, isValidDay, monthGrid, reviewDayIn, startOfWeek, todayIn } from '@/lib/dates';
import { isOverdue } from '@/features/tasks/queries';

describe('fechas del usuario', () => {
  const instant = new Date('2026-11-07T23:30:00Z'); // 00:30 del día 8 en Madrid, 17:30 del 7 en México

  it('calcula el día en la zona del usuario, no en la del servidor', () => {
    expect(todayIn('Europe/Madrid', instant)).toBe('2026-11-08');
    expect(todayIn('America/Mexico_City', instant)).toBe('2026-11-07');
  });

  it('antes de las 04:00 el repaso pertenece al día anterior', () => {
    expect(reviewDayIn('Europe/Madrid', instant)).toBe('2026-11-07');
    expect(reviewDayIn('Europe/Madrid', new Date('2026-11-08T03:30:00Z'))).toBe('2026-11-08');
  });

  it('valida claves de día reales', () => {
    expect(isValidDay('2026-02-28')).toBe(true);
    expect(isValidDay('2026-02-31')).toBe(false);
    expect(isValidDay('26-1-1')).toBe(false);
  });

  it('suma días cruzando meses y cambios de hora', () => {
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('semanas y meses empiezan en lunes', () => {
    expect(startOfWeek('2026-11-08')).toBe('2026-11-02'); // domingo → lunes anterior
    const grid = monthGrid('2026-11'); // 1 nov 2026 es domingo
    expect(grid.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(grid.filter(Boolean)).toHaveLength(30);
  });

  it('racha: cuenta hasta hoy o, si hoy falta, hasta ayer', () => {
    const done = new Set(['2026-11-04', '2026-11-05', '2026-11-06']);
    expect(currentStreak(done, '2026-11-07')).toBe(3);
    expect(currentStreak(new Set([...done, '2026-11-07']), '2026-11-07')).toBe(4);
    expect(currentStreak(done, '2026-11-08')).toBe(0);
  });
});

describe('tareas vencidas', () => {
  const t = (due_date: string | null, due_time: string | null = null, done_at: string | null = null) => ({ due_date, due_time, done_at });
  it('aplica las reglas de la app original', () => {
    expect(isOverdue(t('2026-11-06'), '2026-11-07', '10:00')).toBe(true);
    expect(isOverdue(t('2026-11-07'), '2026-11-07', '10:00')).toBe(false);
    expect(isOverdue(t('2026-11-07', '09:00:00'), '2026-11-07', '10:00')).toBe(true);
    expect(isOverdue(t('2026-11-07', '11:00:00'), '2026-11-07', '10:00')).toBe(false);
    expect(isOverdue(t('2026-11-01', null, '2026-11-02T00:00:00Z'), '2026-11-07', '10:00')).toBe(false);
    expect(isOverdue(t(null), '2026-11-07', '10:00')).toBe(false);
  });
});

describe('formato corto y semanas del diario', () => {
  it('formatea dd/mm/aaaa', () => {
    expect(formatDayShort('2026-11-09')).toBe('09/11/2026');
    expect(formatDayShort('2026-01-01')).toBe('01/01/2026');
  });

  it('la semana de fin de año empieza en el lunes del año anterior', () => {
    expect(startOfWeek('2026-01-01')).toBe('2025-12-29');
    expect(startOfWeek('2026-01-04')).toBe('2025-12-29');
    expect(startOfWeek('2026-01-05')).toBe('2026-01-05');
  });
});
