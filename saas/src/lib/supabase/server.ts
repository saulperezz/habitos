import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient as createPlainClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { cache } from 'react';
import type { Database } from '@/lib/db/types';
import { supabaseEnv } from '@/lib/env';

export type DB = SupabaseClient<Database>;

/** Cliente con la sesión del usuario (cookies). RLS se aplica con su JWT. */
export async function createClient(): Promise<DB> {
  const cookieStore = await cookies(); // primero: marca la ruta como dinámica (nunca se prerenderiza)
  const { url, key } = supabaseEnv();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Llamado desde un Server Component: el proxy ya refresca la sesión.
        }
      },
    },
  });
}

/** Cliente para la API con `Authorization: Bearer <jwt>` (apps móviles, integraciones). */
export function createBearerClient(token: string): DB {
  const { url, key } = supabaseEnv();
  return createPlainClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Usuario verificado (valida el JWT contra Supabase Auth), memorizado por petición. */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
});
