'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { visibleDaysCurrentWeek } from '@/features/notes/weeks';
import type { Note } from '@/lib/db/types';
import { formatDay, formatDayShort, todayIn, type Day } from '@/lib/dates';
import { NoteField } from './note-field';
import { ConflictMessage, SaveStatus } from './save-status';
import { useNoteSaver } from './use-note-saver';
import { WeekHeader } from './week-header';

const CHECK_DAY_MS = 60_000;

function isWriting(): boolean {
  return document.activeElement instanceof HTMLElement && document.activeElement.hasAttribute('data-diario-campo');
}

/** Semana actual del diario: de lunes a hoy, con hoy arriba del todo (FR-001 a FR-008). */
export function CurrentWeek({
  userId,
  timezone,
  today,
  monday,
  notes,
  focusDay,
}: {
  userId: string;
  timezone: string;
  today: Day;
  monday: Day;
  notes: Note[];
  focusDay?: Day;
}) {
  const router = useRouter();
  const saver = useNoteSaver(userId, notes);
  const { flush } = saver;

  // Días con texto (del servidor o escritos aquí). Un día que se edita sigue visible hasta salir
  // de la vista aunque se vacíe (FR-003).
  const [touched, setTouched] = useState<ReadonlySet<Day>>(() => new Set());
  const withText = new Set<Day>(touched);
  for (const n of notes) withText.add(n.day);
  for (const [day, body] of Object.entries(saver.local)) if (body.trim() !== '') withText.add(day);
  const days = visibleDaysCurrentWeek(monday, today, withText);

  const write = (day: Day, value: string) => {
    if (!touched.has(day)) setTouched(new Set(touched).add(day));
    saver.setText(day, value);
  };

  // Al abrir: hoy (o el día pedido desde el calendario, si se muestra) queda arriba del todo.
  const target = focusDay && days.includes(focusDay) ? focusDay : today;
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      document.getElementById(`dia-${target}`)?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
    // Solo al montar o si cambia el día objetivo (p. ej. tras medianoche).
  }, [target]);

  // Cambio de día con la app abierta: se actualiza sola si no se está escribiendo (FR-008).
  useEffect(() => {
    let waitingForBlur = false;
    const check = () => {
      if (todayIn(timezone) === today) return;
      if (isWriting()) {
        waitingForBlur = true;
        return;
      }
      waitingForBlur = false;
      flush();
      router.refresh();
    };
    const onFocusOut = () => {
      if (waitingForBlur) setTimeout(check, 0);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    const interval = setInterval(check, CHECK_DAY_MS);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, [flush, router, timezone, today]);

  return (
    <div className="space-y-4">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <Link href="/notes?vista=anteriores" className="btn-ghost">
          Ver notas anteriores
        </Link>
        <SaveStatus state={saver.state} />
      </div>
      <WeekHeader monday={monday} currentMonday={monday} />
      <div className="space-y-5">
        {days.map((day) => (
          <section key={day} id={`dia-${day}`} className="scroll-mt-[calc(env(safe-area-inset-top)+0.75rem)]">
            {day !== monday && <h2 className="mb-1 text-sm font-semibold tracking-wide text-muted">{formatDayShort(day)}</h2>}
            {saver.notices[day] && <ConflictMessage notice={saver.notices[day]} />}
            <NoteField
              value={saver.valueOf(day)}
              onChange={(v) => write(day, v)}
              label={`Diario del ${formatDay(day)}`}
              fill={day === today}
              placeholder={day === today ? 'Escribe aquí…' : undefined}
            />
          </section>
        ))}
      </div>
    </div>
  );
}
