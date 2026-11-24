/**
 * Envío Web Push sin dependencias (spec 004, research D5/D6): cifrado aes128gcm (RFC 8291),
 * firma VAPID (RFC 8292), lista de servicios push y clasificación de respuestas.
 * El descifrado de esta prueba reimplementa el lado del navegador para comprobar la ida y vuelta.
 */
import { describe, expect, it } from 'vitest';
import { classifyPushStatus, isAllowedPushEndpoint } from '../supabase/functions/_shared/reminders';
import {
  base64urlDecode,
  base64urlEncode,
  encryptPayload,
  sendWebPush,
  vapidAuthorization,
} from '../supabase/functions/_shared/web-push';

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, len: number) {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}

/** Suscripción como la que crea el navegador: par ECDH P-256 + 16 bytes de `auth`. */
async function fakeSubscription() {
  const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publicRaw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    privateKey: pair.privateKey,
    publicRaw,
    auth,
    keys: { p256dh: base64urlEncode(publicRaw), auth: base64urlEncode(auth) },
  };
}

/** Descifra como haría el navegador (RFC 8291 §3.4 y RFC 8188 §2). */
async function decrypt(body: Uint8Array, sub: Awaited<ReturnType<typeof fakeSubscription>>) {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16);
  const idlen = body[20]!;
  const asPublic = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);
  const asKey = await subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asKey }, sub.privateKey, 256));
  const ikm = await hkdf(sub.auth, ecdh, concat(enc.encode('WebPush: info\0'), sub.publicRaw, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext));
  return { rs, idlen, plain };
}

async function vapidKeys() {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await subtle.exportKey('jwk', pair.privateKey);
  const publicRaw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  return { publicKey: base64urlEncode(publicRaw), privateKeyJwk: JSON.stringify(jwk), subject: 'mailto:avisos@example.com' };
}

describe('isAllowedPushEndpoint', () => {
  it('acepta solo https en los servicios push conocidos', () => {
    for (const ok of [
      'https://web.push.apple.com/x',
      'https://fcm.googleapis.com/fcm/send/x',
      'https://wns2-db5p.notify.windows.com/x',
      'https://updates.push.services.mozilla.com/x',
    ]) {
      expect(isAllowedPushEndpoint(ok), ok).toBe(true);
    }
    for (const bad of [
      'http://fcm.googleapis.com/x',
      'https://evil.com/x',
      'https://fcm.googleapis.com.evil.com/x',
      'https://evilpush.apple.com/x',
      'no es una url',
    ]) {
      expect(isAllowedPushEndpoint(bad), bad).toBe(false);
    }
  });
});

describe('classifyPushStatus', () => {
  it('distingue enviado, caducado y reintentar', () => {
    expect([200, 201, 202].map(classifyPushStatus)).toEqual(['sent', 'sent', 'sent']);
    expect([404, 410].map(classifyPushStatus)).toEqual(['gone', 'gone']);
    expect([400, 413, 429, 500, null].map(classifyPushStatus)).toEqual(['retry', 'retry', 'retry', 'retry', 'retry']);
  });
});

describe('base64url', () => {
  it('ida y vuelta sin relleno', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(65));
    const text = base64urlEncode(bytes);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(base64urlDecode(text)).toEqual(bytes);
  });
});

describe('encryptPayload (RFC 8291)', () => {
  it('el navegador puede descifrarlo', async () => {
    const sub = await fakeSubscription();
    const body = await encryptPayload(enc.encode('{"t":"review"}'), sub.keys);
    const { rs, idlen, plain } = await decrypt(body, sub);
    expect(rs).toBe(4096);
    expect(idlen).toBe(65);
    expect(plain.at(-1)).toBe(0x02); // delimitador del último registro
    expect(new TextDecoder().decode(plain.slice(0, -1))).toBe('{"t":"review"}');
  });

  it('coincide con el vector de prueba del apéndice A de RFC 8291', async () => {
    const asPublic = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
    const raw = base64urlDecode(asPublic);
    const jwk = {
      kty: 'EC',
      crv: 'P-256',
      d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
      x: base64urlEncode(raw.slice(1, 33)),
      y: base64urlEncode(raw.slice(33, 65)),
    };
    const localKeys = {
      privateKey: await subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
      publicKey: await subtle.importKey('raw', raw, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
    };
    const body = await encryptPayload(
      enc.encode('When I grow up, I want to be a watermelon'),
      {
        p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
        auth: 'BTBZMqHH6r4Tts7J_aSIgg',
      },
      { salt: base64urlDecode('DGv6ra1nlYgDCS1FRnbzlw'), localKeys },
    );
    expect(base64urlEncode(body)).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    );
  });

  it('cada envío usa una sal y una clave efímera distintas', async () => {
    const sub = await fakeSubscription();
    const a = await encryptPayload(enc.encode('x'), sub.keys);
    const b = await encryptPayload(enc.encode('x'), sub.keys);
    expect(base64urlEncode(a.slice(0, 86))).not.toBe(base64urlEncode(b.slice(0, 86)));
  });
});

describe('vapidAuthorization (RFC 8292)', () => {
  it('firma un JWT ES256 verificable con aud, exp y sub', async () => {
    const vapid = await vapidKeys();
    const now = Date.UTC(2026, 10, 23, 12, 0, 0);
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', vapid, now);
    const match = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, h, p, s, k] = match!;
    expect(k).toBe(vapid.publicKey);
    expect(JSON.parse(new TextDecoder().decode(base64urlDecode(h!)))).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(JSON.parse(new TextDecoder().decode(base64urlDecode(p!)))).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: now / 1000 + 12 * 60 * 60,
      sub: 'mailto:avisos@example.com',
    });
    const key = await subtle.importKey('raw', base64urlDecode(vapid.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, base64urlDecode(s!), enc.encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });
});

describe('sendWebPush', () => {
  it('envía el cuerpo cifrado con las cabeceras de Web Push y devuelve el estado', async () => {
    const sub = await fakeSubscription();
    const vapid = await vapidKeys();
    const calls: { url: string; init: RequestInit }[] = [];
    const status = await sendWebPush(
      { endpoint: 'https://web.push.apple.com/abc', ...sub.keys },
      enc.encode('{"t":"test"}'),
      { ttl: 60, urgency: 'high', topic: 'prueba' },
      vapid,
      async (url, init) => {
        calls.push({ url, init });
        return { status: 201 };
      },
    );
    expect(status).toBe(201);
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe('https://web.push.apple.com/abc');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Encoding']).toBe('aes128gcm');
    expect(headers['Content-Type']).toBe('application/octet-stream');
    expect(headers.TTL).toBe('60');
    expect(headers.Urgency).toBe('high');
    expect(headers.Topic).toBe('prueba');
    expect(headers.Authorization).toMatch(/^vapid t=.+, k=/);
    const { plain } = await decrypt(init.body as Uint8Array, sub);
    expect(new TextDecoder().decode(plain.slice(0, -1))).toBe('{"t":"test"}');
  });
});
