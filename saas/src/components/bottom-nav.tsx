'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/today', label: 'Hoy', icon: 'M5 12l4 4L19 6' },
  { href: '/tasks', label: 'Tareas', icon: 'M4 6h16M4 12h16M4 18h10' },
  { href: '/calendar', label: 'Calendario', icon: 'M4 7h16v13H4zM4 11h16M9 3v4M15 3v4' },
  { href: '/notes', label: 'Diario', icon: 'M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4' },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur pb-safe">
      <ul className="mx-auto grid max-w-xl grid-cols-4">
        {TABS.map((t) => {
          const active = path === t.href || path.startsWith(`${t.href}/`);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[var(--barra-h)] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active ? 'text-accent' : 'text-muted'}`}
              >
                <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d={t.icon} />
                </svg>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
