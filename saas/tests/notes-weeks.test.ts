import { describe, expect, it } from 'vitest';
import { excerpt, groupWeeks, visibleDaysCurrentWeek, visibleDaysPastWeek } from '@/features/notes/weeks';

describe('días visibles de la semana actual', () => {
  const monday = '2026-11-09';

  it('muestra de lunes a hoy solo los días con texto, y hoy siempre', () => {
    // hoy jueves 12; notas el lunes y el miércoles (y una futura que nunca se muestra)
    const withText = new Set(['2026-11-09', '2026-11-11', '2026-11-14']);
    expect(visibleDaysCurrentWeek(monday, '2026-11-12', withText)).toEqual(['2026-11-09', '2026-11-11', '2026-11-12']);
  });

  it('si hoy es lunes, solo aparece el lunes', () => {
    expect(visibleDaysCurrentWeek(monday, monday, new Set())).toEqual([monday]);
  });

  it('hoy aparece aunque tenga texto (sin duplicarse)', () => {
    expect(visibleDaysCurrentWeek(monday, '2026-11-10', new Set(['2026-11-10']))).toEqual(['2026-11-10']);
  });
});

describe('días visibles de una semana pasada', () => {
  it('solo los días con texto de lunes a domingo', () => {
    const withText = new Set(['2026-11-02', '2026-11-08', '2026-11-09', '2026-11-01']);
    expect(visibleDaysPastWeek('2026-11-02', withText)).toEqual(['2026-11-02', '2026-11-08']);
  });
});

describe('semanas anteriores', () => {
  it('agrupa por lunes, de la más reciente a la más antigua, con extracto del primer día', () => {
    const notes = [
      { day: '2026-11-04', body: 'miércoles' },
      { day: '2026-11-03', body: 'martes' },
      { day: '2026-10-20', body: 'antes' },
    ];
    expect(groupWeeks(notes)).toEqual([
      { monday: '2026-11-02', daysWithText: 2, excerpt: 'martes' },
      { monday: '2026-10-19', daysWithText: 1, excerpt: 'antes' },
    ]);
  });

  it('sin notas no hay semanas', () => {
    expect(groupWeeks([])).toEqual([]);
  });
});

describe('extracto', () => {
  it('colapsa espacios y saltos y no recorta si cabe', () => {
    expect(excerpt('  Hola\n\n  mundo  ')).toBe('Hola mundo');
    expect(excerpt('a'.repeat(80))).toBe('a'.repeat(80));
  });

  it('recorta a 80 caracteres con puntos suspensivos', () => {
    const r = excerpt('b'.repeat(100));
    expect(r).toBe(`${'b'.repeat(80)}…`);
  });
});
