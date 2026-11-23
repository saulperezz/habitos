// Edge Function (Deno): aviso diario del repaso (spec 004, contracts/push-api.md §4).
// La invoca pg_cron cada minuto vía pg_net con `Authorization: Bearer <REMINDERS_CRON_SECRET>`.
// Se conecta como `reminder_sender`, un rol que solo puede ejecutar claim_due_reminders y
// report_reminder_results: nunca usa la clave service role ni lee tablas directamente.
//
// Secrets: REMINDERS_CRON_SECRET, REMINDER_SENDER_DB_URL (pooler de transacciones, puerto 6543),
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (JWK) y VAPID_SUBJECT (mailto: o https:).
import postgres from 'npm:postgres@3.4.7';
import { classifyPushStatus, isAllowedPushEndpoint, type PushOutcome } from '../_shared/reminders.ts';
import { sendWebPush, type VapidConfig } from '../_shared/web-push.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const BATCH_USERS = 500;
const CONCURRENCY = 50;
const TIME_BUDGET_MS = 100_000;
const PAYLOAD = new TextEncoder().encode('{"t":"review"}');

type Claimed = { user_id: string; day: string; subscription_id: string; endpoint: string; p256dh: string; auth: string };
type Result = { subscription_id: string; user_id: string; day: string; outcome: PushOutcome };

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta la variable ${name}`);
  return value;
}

/** Compara en tiempo constante (sobre los resúmenes SHA-256, que tienen siempre la misma longitud). */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const ux = new Uint8Array(x);
  const uy = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < ux.length; i++) diff |= ux[i]! ^ uy[i]!;
  return diff === 0;
}

/** Ejecuta `fn` sobre `items` con como mucho `limit` promesas a la vez, conservando el orden. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Divide en trozos de ≤ max elementos sin separar los resultados de un mismo usuario. */
function chunkByUser(results: Result[], max: number): Result[][] {
  const byUser = new Map<string, Result[]>();
  for (const r of results) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
  const chunks: Result[][] = [];
  let current: Result[] = [];
  for (const group of byUser.values()) {
    if (current.length + group.length > max && current.length > 0) {
      chunks.push(current);
      current = [];
    }
    current.push(...group);
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function run(): Promise<void> {
  const vapid: VapidConfig = {
    publicKey: env('VAPID_PUBLIC_KEY'),
    privateKeyJwk: env('VAPID_PRIVATE_KEY'),
    subject: env('VAPID_SUBJECT'),
  };
  const sql = postgres(env('REMINDER_SENDER_DB_URL'), { prepare: false, max: 1 });
  const started = Date.now();
  const counts = { enviados: 0, caducados: 0, reintentos: 0 };
  // Los usuarios con algún fallo temporal se informan al final: si se liberasen ya, esta misma
  // ejecución los volvería a reclamar en bucle en lugar de reintentar el minuto siguiente.
  const deferred: Result[] = [];

  const report = async (results: Result[]) => {
    for (const chunk of chunkByUser(results, 5000)) {
      await sql`select public.report_reminder_results(${sql.json(chunk)})`;
    }
  };

  try {
    while (Date.now() - started < TIME_BUDGET_MS) {
      const rows = await sql<Claimed[]>`
        select user_id, to_char(day, 'YYYY-MM-DD') as day, subscription_id, endpoint, p256dh, auth
        from public.claim_due_reminders(${BATCH_USERS})`;
      if (rows.length === 0) break;

      const results = await mapLimit(rows, CONCURRENCY, async (row): Promise<Result> => {
        let outcome: PushOutcome;
        if (!isAllowedPushEndpoint(row.endpoint)) {
          outcome = 'gone'; // nunca se hace fetch a un host fuera de la lista (SSRF)
        } else {
          let status: number | null = null;
          try {
            status = await sendWebPush(row, PAYLOAD, { ttl: 3600, urgency: 'high', topic: 'repaso' }, vapid);
          } catch {
            status = null;
          }
          outcome = classifyPushStatus(status);
        }
        counts[outcome === 'sent' ? 'enviados' : outcome === 'gone' ? 'caducados' : 'reintentos']++;
        return { subscription_id: row.subscription_id, user_id: row.user_id, day: row.day, outcome };
      });

      const retryUsers = new Set(results.filter((r) => r.outcome === 'retry').map((r) => r.user_id));
      await report(results.filter((r) => !retryUsers.has(r.user_id)));
      deferred.push(...results.filter((r) => retryUsers.has(r.user_id)));
    }
    await report(deferred);
  } finally {
    await sql.end({ timeout: 5 });
    // Solo contadores: nunca endpoints ni identificadores (constitución, principio II).
    console.log(JSON.stringify({ msg: 'review-reminders', ...counts, ms: Date.now() - started }));
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return Response.json({ error: 'Método no permitido.' }, { status: 405 });
  const secret = Deno.env.get('REMINDERS_CRON_SECRET');
  const given = request.headers.get('Authorization') ?? '';
  if (!secret || !(await sameSecret(given, `Bearer ${secret}`))) {
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  }
  const job = run().catch((err) => {
    console.error(JSON.stringify({ msg: 'review-reminders_error', error: err instanceof Error ? err.message : String(err) }));
  });
  // Responde al momento: el tiempo de espera de pg_net no corta el envío.
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(job);
  else await job;
  return Response.json({ ok: true }, { status: 202 });
});
