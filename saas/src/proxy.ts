import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/db/types';

const APP_PREFIXES = ['/today', '/tasks', '/calendar', '/notes', '/settings', '/review'];

/** Refresca la sesión de Supabase en cada petición y protege las rutas de la app. */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims valida la firma del JWT (local con claves asimétricas) y refresca si ha caducado.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const path = request.nextUrl.pathname;

  if (!signedIn && APP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(login);
  }
  if (signedIn && (path === '/login' || path === '/')) {
    const app = request.nextUrl.clone();
    app.pathname = '/today';
    app.search = '';
    return NextResponse.redirect(app);
  }
  return response;
}

export const config = {
  // Las rutas /api gestionan su propia autenticación (cookie o Bearer).
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|.*\\.(?:png|svg|ico|webp)$).*)'],
};
