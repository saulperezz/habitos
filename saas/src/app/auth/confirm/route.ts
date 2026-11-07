import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Destino de los enlaces de correo (confirmación de alta, enlace mágico, OAuth con PKCE). */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = url.searchParams.get('next');
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/today';
  const supabase = await createClient();

  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      : { error: new Error('missing_params') };

  return NextResponse.redirect(new URL(error ? '/login?error=link' : target, url.origin));
}
