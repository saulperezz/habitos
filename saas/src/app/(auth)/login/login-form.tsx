'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Mode = 'signin' | 'signup' | 'magic';

export function LoginForm({ initialMode, next }: { initialMode: Mode; next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const supabase = createClient();
    const emailRedirectTo = `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
        return;
      }
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo, data: { timezone } },
        });
        if (error) throw error;
        if (data.session) {
          router.replace(next);
          router.refresh();
          return;
        }
        setSent(true);
        return;
      }
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo, data: { timezone } } });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(translate(err instanceof Error ? err.message : ''));
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="card space-y-2">
        <p className="font-semibold">Revisa tu correo ✉️</p>
        <p className="text-sm text-muted">
          Te hemos enviado un enlace a <strong>{email}</strong>. Ábrelo en este dispositivo para entrar.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">Correo</label>
        <input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {mode !== 'magic' && (
        <div>
          <label className="label" htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? 'Un momento…' : mode === 'signin' ? 'Entrar' : mode === 'signup' ? 'Crear cuenta' : 'Enviarme un enlace'}
      </button>
      <div className="flex flex-col items-center gap-2 text-sm">
        {mode !== 'magic' && (
          <button type="button" className="text-accent underline-offset-4 hover:underline" onClick={() => setMode('magic')}>
            Entrar sin contraseña (enlace por correo)
          </button>
        )}
        <button
          type="button"
          className="text-muted underline-offset-4 hover:underline"
          onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
        >
          {mode === 'signup' ? '¿Ya tienes cuenta? Entra' : '¿No tienes cuenta? Regístrate'}
        </button>
      </div>
    </form>
  );
}

function translate(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Correo o contraseña incorrectos.';
  if (/already registered/i.test(message)) return 'Ese correo ya tiene cuenta. Entra con tu contraseña.';
  if (/password/i.test(message)) return 'La contraseña debe tener al menos 8 caracteres.';
  if (/rate limit|too many/i.test(message)) return 'Demasiados intentos. Espera un minuto.';
  if (/email not confirmed/i.test(message)) return 'Confirma tu correo con el enlace que te enviamos.';
  return 'No se pudo completar. Inténtalo de nuevo.';
}
