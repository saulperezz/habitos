import Link from 'next/link';
import { addDays, formatDayShort, type Day } from '@/lib/dates';

const ARROW = 'grid size-11 shrink-0 place-items-center rounded-full text-2xl leading-none';

/** «‹ SEMANA dd/mm/aaaa ›». La flecha › está desactivada en la semana actual (FR-023, FR-024). */
export function WeekHeader({ monday, currentMonday }: { monday: Day; currentMonday: Day }) {
  const prev = addDays(monday, -7);
  const next = addDays(monday, 7);
  const isCurrent = monday >= currentMonday;

  return (
    <div className="flex items-center justify-between gap-2">
      <Link href={`/notes?w=${prev}`} aria-label="Semana anterior" className={`${ARROW} text-muted hover:bg-surface-2`}>
        ‹
      </Link>
      <h1 className="text-center text-lg font-bold tracking-wider">SEMANA {formatDayShort(monday)}</h1>
      {isCurrent ? (
        <span role="link" aria-label="Semana siguiente" aria-disabled="true" className={`${ARROW} text-muted opacity-30`}>
          ›
        </span>
      ) : (
        <Link
          href={next >= currentMonday ? '/notes' : `/notes?w=${next}`}
          aria-label="Semana siguiente"
          className={`${ARROW} text-muted hover:bg-surface-2`}
        >
          ›
        </Link>
      )}
    </div>
  );
}
