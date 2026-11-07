import type { Metadata } from 'next';
import { LoginForm } from './login-form';
import { isSupabaseConfigured } from '@/lib/env';

export const metadata: Metadata = { title: 'Entrar' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; next?: string; error?: string }>;
}) {
  const { mode, next, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-12 pt-safe">
      <div>
        <p className="text-sm font-semibold tracking-widest text-accent uppercase">Habitos</p>
        <h1 className="mt-2 text-2xl font-bold">{mode === 'signup' ? 'Crea tu cuenta' : 'Bienvenido de nuevo'}</h1>
      </div>
      {!isSupabaseConfigured() && (
        <p className="error">Falta configurar Supabase: copia .env.example a .env.local y rellena las claves.</p>
      )}
      {error && <p className="error">El enlace no es válido o ha caducado. Pide uno nuevo.</p>}
      <LoginForm initialMode={mode === 'signup' ? 'signup' : 'signin'} next={safeNext(next)} />
    </main>
  );
}

/** Evita redirecciones abiertas: solo rutas internas. */
function safeNext(next?: string) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/today';
}
