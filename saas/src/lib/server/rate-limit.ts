import 'server-only';

/**
 * Ventana fija por clave. Con UPSTASH_REDIS_REST_URL/TOKEN usa Redis (compartido entre instancias);
 * sin ellas, un mapa en memoria por instancia (suficiente para desarrollo y tráfico bajo).
 */
const memory = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(key: string, limit: number, windowSec: number): Promise<{ ok: boolean; retryAfter: number }> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const retryAfter = windowSec - (Math.floor(Date.now() / 1000) % windowSec);

  if (url && token) {
    try {
      const redisKey = `rl:${key}:${bucket}`;
      const res = await fetch(`${url}/multi-exec`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([
          ['INCR', redisKey],
          ['EXPIRE', redisKey, String(windowSec)],
        ]),
        cache: 'no-store',
      });
      const data = (await res.json()) as [{ result: number }, unknown];
      return { ok: data[0].result <= limit, retryAfter };
    } catch {
      return { ok: true, retryAfter: 0 }; // si Redis falla, no se bloquea a los usuarios
    }
  }

  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    if (memory.size > 10_000) memory.clear();
    memory.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { ok: true, retryAfter };
  }
  entry.count++;
  return { ok: entry.count <= limit, retryAfter };
}
