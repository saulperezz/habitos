import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createBearerClient, createClient, type DB } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { firstError } from '@/lib/validation';
import { rateLimit } from './rate-limit';

export type ApiContext = { db: DB; userId: string; request: NextRequest };

type Handler<P> = (ctx: ApiContext, params: P) => Promise<unknown>;

const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * Envoltorio común de /api/v1: autenticación (cookie o Bearer), rate limit por usuario,
 * errores JSON con forma única `{ error: { code, message } }` y log estructurado.
 */
export function route<P = Record<string, never>>(handler: Handler<P>, opts: { limit?: number } = {}) {
  return async (request: NextRequest, ctx: { params: Promise<P> }) => {
    const started = Date.now();
    let status = 200;
    try {
      const auth = request.headers.get('authorization');
      const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
      const db = token ? createBearerClient(token) : await createClient();
      const { data, error } = token ? await db.auth.getUser(token) : await db.auth.getUser();
      if (error || !data.user) throw new AppError('unauthorized', 'Inicia sesión para continuar.');

      const rl = await rateLimit(`api:${data.user.id}`, opts.limit ?? 120, 60);
      if (!rl.ok) {
        status = 429;
        return NextResponse.json(
          { error: { code: 'rate_limited', message: 'Demasiadas peticiones. Inténtalo en un momento.' } },
          { status, headers: { 'Retry-After': String(rl.retryAfter) } },
        );
      }

      const result = await handler({ db, userId: data.user.id, request }, await ctx.params);
      if (result === undefined) {
        status = 204;
        return new NextResponse(null, { status });
      }
      status = request.method === 'POST' ? 201 : 200;
      return NextResponse.json({ data: result }, { status });
    } catch (err) {
      const e = err instanceof AppError ? err : new AppError('internal', 'Error interno.');
      if (!(err instanceof AppError)) console.error(JSON.stringify({ level: 'error', msg: 'api_unhandled', error: String(err) }));
      status = e.status;
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status });
    } finally {
      console.log(
        JSON.stringify({ level: 'info', msg: 'api', method: request.method, path: request.nextUrl.pathname, status, ms: Date.now() - started }),
      );
    }
  };
}

export async function readJson<T extends z.ZodType>(request: NextRequest, schema: T): Promise<z.infer<T>> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) throw new AppError('payload_too_large', 'El cuerpo es demasiado grande.');
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) throw new AppError('payload_too_large', 'El cuerpo es demasiado grande.');
    body = JSON.parse(text);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('bad_request', 'JSON inválido.');
  }
  return parse(schema, body);
}

export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw new AppError('bad_request', firstError(r.error));
  return r.data;
}

export function searchParams(request: NextRequest): Record<string, string> {
  return Object.fromEntries(request.nextUrl.searchParams.entries());
}
