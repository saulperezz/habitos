import Link from 'next/link';
import type { WeekSummary } from '@/features/notes/weeks';
import { formatDayShort } from '@/lib/dates';

/** Lista de semanas anteriores con notas, de la más reciente a la más antigua (FR-016 a FR-019). */
export function PastWeeksList({ weeks }: { weeks: WeekSummary[] }) {
  return (
    <div className="space-y-4">
      <div className="flex min-h-11 items-center">
        <Link href="/notes" className="btn-ghost">
          ← Esta semana
        </Link>
      </div>
      {weeks.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Aún no hay semanas anteriores con notas.</p>
      ) : (
        <ul className="space-y-2.5">
          {weeks.map((w) => (
            <li key={w.monday}>
              <Link href={`/notes?w=${w.monday}`} className="card block min-h-11 active:bg-surface-2">
                <strong className="block text-[15px] tracking-wide">SEMANA {formatDayShort(w.monday)}</strong>
                <span className="mt-1 block truncate text-[13px] text-muted">
                  {w.daysWithText} {w.daysWithText === 1 ? 'día con notas' : 'días con notas'} · {w.excerpt}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
