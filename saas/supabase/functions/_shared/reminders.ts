/**
 * Reglas compartidas de los avisos push (spec 004). Sin imports: lo usan las Edge Functions (Deno),
 * la validación de la app (Next) y las pruebas (Vitest).
 */

/** Servicios push a los que se permite enviar (Apple, Google, Microsoft y Mozilla). */
export const PUSH_HOSTS: readonly RegExp[] = [
  /(^|\.)push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /(^|\.)notify\.windows\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
];

/** Evita que el servidor haga peticiones a hosts arbitrarios (SSRF): solo https y servicios push conocidos. */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(url.hostname));
}

export type PushOutcome = 'sent' | 'gone' | 'retry';

/** `null` = error de red. 404/410: el dispositivo ya no existe y se borra; el resto se reintenta. */
export function classifyPushStatus(status: number | null): PushOutcome {
  if (status !== null && status >= 200 && status < 300) return 'sent';
  if (status === 404 || status === 410) return 'gone';
  return 'retry';
}
