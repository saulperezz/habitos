// Edge Function (Deno): aviso de prueba (spec 004, contracts/push-api.md §5).
// verify_jwt = true: solo con la sesión del usuario. Lee y borra su dispositivo por PostgREST con ese
// mismo token, así que RLS limita todo a sus propias filas. Sin service role.
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (JWK), VAPID_SUBJECT. SUPABASE_URL lo pone el entorno.
import { classifyPushStatus, isAllowedPushEndpoint } from '../_shared/reminders.ts';
import { sendWebPush, type VapidConfig } from '../_shared/web-push.ts';

const PAYLOAD = new TextEncoder().encode('{"t":"test"}');
const MAX_BODY = 2048;

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta la variable ${name}`);
  return value;
}

const json = (status: number, body: unknown) => Response.json(body, { status });

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authorization = request.headers.get('Authorization') ?? '';
  const apikey = request.headers.get('apikey') ?? '';
  if (!authorization.startsWith('Bearer ') || !apikey) return json(401, { error: 'unauthorized' });

  const text = await request.text();
  if (text.length > MAX_BODY) return json(400, { error: 'bad_request' });
  let endpoint: unknown;
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).join() !== 'endpoint') {
      return json(400, { error: 'bad_request' });
    }
    endpoint = body.endpoint;
  } catch {
    return json(400, { error: 'bad_request' });
  }
  if (typeof endpoint !== 'string' || !isAllowedPushEndpoint(endpoint)) return json(400, { error: 'bad_request' });

  const rest = `${env('SUPABASE_URL')}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`;
  const headers = { Authorization: authorization, apikey };
  const found = await fetch(`${rest}&select=endpoint,p256dh,auth`, { headers });
  if (!found.ok) return json(found.status === 401 ? 401 : 502, { error: 'lookup_failed' });
  const rows = (await found.json()) as { endpoint: string; p256dh: string; auth: string }[];
  const target = rows[0];
  if (!target) return json(404, { error: 'not_found' });

  const vapid: VapidConfig = {
    publicKey: env('VAPID_PUBLIC_KEY'),
    privateKeyJwk: env('VAPID_PRIVATE_KEY'),
    subject: env('VAPID_SUBJECT'),
  };
  let status: number | null = null;
  try {
    status = await sendWebPush(target, PAYLOAD, { ttl: 60, urgency: 'high', topic: 'prueba' }, vapid);
  } catch {
    status = null;
  }

  const outcome = classifyPushStatus(status);
  if (outcome === 'sent') return json(200, { result: 'sent' });
  if (outcome === 'gone') {
    await fetch(rest, { method: 'DELETE', headers }).catch(() => undefined);
    return json(200, { result: 'gone' });
  }
  return json(502, { error: 'push_failed' });
});
