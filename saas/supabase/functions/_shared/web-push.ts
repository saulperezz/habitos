/**
 * Web Push sin dependencias, solo con Web Crypto (funciona en Deno, Node ≥ 20 y navegadores).
 * - Cifrado de la carga: aes128gcm (RFC 8291 + RFC 8188), un solo registro.
 * - Autenticación VAPID (RFC 8292): JWT ES256, adaptado de `notificaciones/worker.js`.
 * La carga nunca lleva datos del usuario (constitución, principio II): solo `{"t":"review"|"test"}`.
 *
 * Sin imports a propósito: quien llama debe comprobar antes `isAllowedPushEndpoint` (reminders.ts).
 */

export type PushKeys = { p256dh: string; auth: string };
export type PushTarget = PushKeys & { endpoint: string };
export type VapidConfig = { publicKey: string; privateKeyJwk: string; subject: string };
export type PushOptions = { ttl: number; urgency: 'very-low' | 'low' | 'normal' | 'high'; topic?: string };
export type FetchLike = (url: string, init: RequestInit) => Promise<{ status: number }>;

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const RECORD_SIZE = 4096;

export function base64urlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlDecode(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number) {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/** Solo para pruebas (vector del apéndice A de RFC 8291): sal y clave efímera fijas. */
export type FixedEncryption = { salt: Uint8Array<ArrayBuffer>; localKeys: CryptoKeyPair };

/** Cifra `payload` para la suscripción (RFC 8291). Devuelve el cuerpo completo: cabecera + registro. */
export async function encryptPayload(
  payload: Uint8Array,
  keys: PushKeys,
  fixed?: FixedEncryption,
): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = base64urlDecode(keys.p256dh);
  const authSecret = base64urlDecode(keys.auth);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error('Claves de suscripción no válidas.');
  if (payload.length + 1 + 16 > RECORD_SIZE) throw new Error('La carga es demasiado grande.');

  const local = fixed?.localKeys ?? (await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']));
  const asPublic = new Uint8Array(await subtle.exportKey('raw', local.publicKey));
  const uaKey = await subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = fixed?.salt ?? globalThis.crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // Un único registro, que por tanto es el último: delimitador 0x02 y sin relleno.
  const record = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, concat(payload, new Uint8Array([0x02]))),
  );

  const header = new Uint8Array(16 + 4 + 1);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length; // 65
  return concat(header, asPublic, record);
}

const keyCache = new Map<string, Promise<CryptoKey>>();

function importVapidKey(privateKeyJwk: string): Promise<CryptoKey> {
  let key = keyCache.get(privateKeyJwk);
  if (!key) {
    const jwk = JSON.parse(privateKeyJwk) as JsonWebKey;
    key = subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', d: jwk.d, x: jwk.x, y: jwk.y, ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
    keyCache.set(privateKeyJwk, key);
  }
  return key;
}

/** Cabecera `Authorization: vapid t=<JWT>, k=<clave pública>` para el origen del endpoint. */
export async function vapidAuthorization(endpoint: string, vapid: VapidConfig, now: number = Date.now()): Promise<string> {
  const header = base64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = base64urlEncode(
    enc.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(now / 1000) + 12 * 60 * 60,
        sub: vapid.subject,
      }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  // Web Crypto devuelve la firma ECDSA en formato r||s, justo el que pide JWT ES256.
  const signature = await subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    await importVapidKey(vapid.privateKeyJwk),
    enc.encode(unsigned),
  );
  return `vapid t=${unsigned}.${base64urlEncode(signature)}, k=${vapid.publicKey}`;
}

/** Cifra, firma y envía un aviso. Devuelve el estado HTTP del servicio push. */
export async function sendWebPush(
  target: PushTarget,
  payload: Uint8Array,
  options: PushOptions,
  vapid: VapidConfig,
  fetchFn: FetchLike = (url, init) => fetch(url, init),
): Promise<number> {
  const body = await encryptPayload(payload, target);
  const headers: Record<string, string> = {
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(options.ttl),
    Urgency: options.urgency,
    Authorization: await vapidAuthorization(target.endpoint, vapid),
  };
  if (options.topic) headers.Topic = options.topic;
  const response = await fetchFn(target.endpoint, { method: 'POST', headers, body });
  return response.status;
}
