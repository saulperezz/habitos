import Link from 'next/link';
import { BottomNav } from '@/components/bottom-nav';
import { requireSession } from '@/lib/server/session';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return (
    <div className="pt-safe">
      <header className="mx-auto flex h-[var(--cabecera-h)] max-w-xl items-center justify-between px-4 pt-4">
        <Link href="/today" className="text-sm font-bold tracking-widest text-accent uppercase">
          Habitos
        </Link>
        <Link href="/settings" aria-label="Ajustes" className="grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2">
          <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </Link>
      </header>
      <main className="mx-auto max-w-xl px-4 pt-2 pb-28">{children}</main>
      <BottomNav />
    </div>
  );
}
