// Worker de avisos diarios de Mis Hábitos (Cloudflare Workers, sin dependencias).
// Contrato: specs/001-recordatorio-habitos-tareas/contracts/api-notificaciones.md
//
// Solo guarda por dispositivo: endpoint, hora, zonaHoraria, ultimoEnvio y creadaEn.
// El push se envía SIN contenido; el texto lo pone el service worker del móvil.

const CLAVE_KV = 'suscripciones';
const MAX_SUSCRIPCIONES = 10;
const MAX_CUERPO = 2048;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DOMINIOS_PUSH = [
  /(^|\.)push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /(^|\.)notify\.windows\.com$/,
  /^updates\.push\.services\.mozilla\.com$/
];

// ── Utilidades HTTP ──

function cabecerasCors(env) {
  return {
    'Access-Control-Allow-Origin': env.ORIGEN_PERMITIDO,
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(env, estado, datos) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cabecerasCors(env) }
  });
}

const error = (env, estado, mensaje) => json(env, estado, { error: mensaje });

class ErrorPeticion extends Error {
  constructor(estado, mensaje) { super(mensaje); this.estado = estado; }
}

async function leerCuerpo(request, camposPermitidos) {
  const texto = await request.text();
  if (texto.length > MAX_CUERPO) throw new ErrorPeticion(400, 'El cuerpo es demasiado grande.');
  let datos;
  try { datos = JSON.parse(texto); } catch { throw new ErrorPeticion(400, 'El cuerpo no es JSON válido.'); }
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    throw new ErrorPeticion(400, 'El cuerpo debe ser un objeto JSON.');
  }
  for (const campo of Object.keys(datos)) {
    if (!camposPermitidos.includes(campo)) throw new ErrorPeticion(400, `Campo no permitido: ${campo}.`);
  }
  for (const campo of camposPermitidos) {
    if (typeof datos[campo] !== 'string') throw new ErrorPeticion(400, `Falta el campo ${campo}.`);
  }
  return datos;
}

// ── Validación ──

function validarEndpoint(endpoint) {
  let url;
  try { url = new URL(endpoint); } catch { throw new ErrorPeticion(400, 'El endpoint no es una URL válida.'); }
  if (url.protocol !== 'https:' || !DOMINIOS_PUSH.some((re) => re.test(url.hostname))) {
    throw new ErrorPeticion(400, 'El endpoint no pertenece a un servicio de notificaciones conocido.');
  }
}

function validarHora(hora) {
  if (!RE_HORA.test(hora)) throw new ErrorPeticion(400, 'La hora debe tener el formato HH:MM.');
}

function validarZona(zonaHoraria) {
  try { new Intl.DateTimeFormat('es-ES', { timeZone: zonaHoraria }); }
  catch { throw new ErrorPeticion(400, 'La zona horaria no es válida.'); }
}

// ── Fecha y hora locales de una zona ──

function ahoraEn(zonaHoraria, fecha = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(fecha).map((p) => [p.type, p.value])
  );
  return { fecha: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}:${partes.minute}` };
}

// ── KV ──

async function leerSuscripciones(env) {
  return (await env.SUSCRIPCIONES.get(CLAVE_KV, 'json')) || [];
}

async function guardarSuscripciones(env, lista) {
  await env.SUSCRIPCIONES.put(CLAVE_KV, JSON.stringify(lista));
}

// ── VAPID (JWT ES256 con Web Crypto) ──

const base64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const textoBase64url = (texto) => base64url(new TextEncoder().encode(texto));

let clavePrivadaCache = null;

async function clavePrivada(env) {
  if (!clavePrivadaCache) {
    const jwk = JSON.parse(env.VAPID_CLAVE_PRIVADA);
    clavePrivadaCache = await crypto.subtle.importKey(
      'jwk', { kty: 'EC', crv: 'P-256', d: jwk.d, x: jwk.x, y: jwk.y, ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
    );
  }
  return clavePrivadaCache;
}

async function cabeceraVapid(env, endpoint) {
  const audiencia = new URL(endpoint).origin;
  const cabecera = textoBase64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const carga = textoBase64url(JSON.stringify({
    aud: audiencia,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: env.VAPID_SUJETO
  }));
  const sinFirmar = `${cabecera}.${carga}`;
  // Web Crypto devuelve la firma en formato r||s, que es justo el que pide JWT ES256.
  const firma = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, await clavePrivada(env), new TextEncoder().encode(sinFirmar)
  );
  return `vapid t=${sinFirmar}.${base64url(firma)}, k=${env.VAPID_CLAVE_PUBLICA}`;
}

async function enviarPush(env, endpoint) {
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'TTL': '3600',
      'Urgency': 'high',
      'Content-Length': '0',
      'Authorization': await cabeceraVapid(env, endpoint)
    }
  });
}

// ── Rutas ──

async function putSuscripcion(request, env) {
  const { endpoint, hora, zonaHoraria } = await leerCuerpo(request, ['endpoint', 'hora', 'zonaHoraria']);
  validarEndpoint(endpoint);
  validarHora(hora);
  validarZona(zonaHoraria);

  const lista = await leerSuscripciones(env);
  const ahora = ahoraEn(zonaHoraria);
  const existente = lista.find((s) => s.endpoint === endpoint);

  if (existente) {
    existente.hora = hora;
    existente.zonaHoraria = zonaHoraria;
    // Si la nueva hora aún no ha llegado hoy, permite el aviso de hoy.
    // (Si el repaso ya está hecho, el cliente vuelve a llamar a /suscripcion/hecho.)
    if (ahora.hora < hora && existente.ultimoEnvio === ahora.fecha) existente.ultimoEnvio = null;
  } else {
    if (lista.length >= MAX_SUSCRIPCIONES) throw new ErrorPeticion(409, 'Se ha alcanzado el máximo de dispositivos.');
    lista.push({
      endpoint, hora, zonaHoraria,
      // Si ya pasó la hora de hoy al registrarse, el primer aviso será mañana.
      ultimoEnvio: ahora.hora >= hora ? ahora.fecha : null,
      creadaEn: Date.now()
    });
  }
  await guardarSuscripciones(env, lista);
  return json(env, 200, { ok: true });
}

async function postHecho(request, env) {
  const { endpoint, fecha } = await leerCuerpo(request, ['endpoint', 'fecha']);
  validarEndpoint(endpoint);
  if (!RE_FECHA.test(fecha)) throw new ErrorPeticion(400, 'La fecha debe tener el formato AAAA-MM-DD.');
  const lista = await leerSuscripciones(env);
  const s = lista.find((x) => x.endpoint === endpoint);
  if (!s) throw new ErrorPeticion(404, 'Este dispositivo no está registrado.');
  if (!s.ultimoEnvio || s.ultimoEnvio < fecha) {
    s.ultimoEnvio = fecha;
    await guardarSuscripciones(env, lista);
  }
  return json(env, 200, { ok: true });
}

async function deleteSuscripcion(request, env) {
  const { endpoint } = await leerCuerpo(request, ['endpoint']);
  const lista = await leerSuscripciones(env);
  const filtrada = lista.filter((s) => s.endpoint !== endpoint);
  if (filtrada.length !== lista.length) await guardarSuscripciones(env, filtrada);
  return json(env, 200, { ok: true });
}

// ── Cron: cada minuto ──

async function enviarAvisosPendientes(env) {
  const lista = await leerSuscripciones(env);
  if (!lista.length) return;
  let cambios = false;
  const conservar = [];

  for (const s of lista) {
    const ahora = ahoraEn(s.zonaHoraria);
    if (ahora.hora >= s.hora && s.ultimoEnvio !== ahora.fecha) {
      try {
        const respuesta = await enviarPush(env, s.endpoint);
        if (respuesta.status === 404 || respuesta.status === 410) {
          cambios = true; // suscripción caducada: se elimina
          continue;
        }
        if (respuesta.ok) {
          s.ultimoEnvio = ahora.fecha;
          cambios = true;
        } else {
          console.log(`Aviso no aceptado (${respuesta.status}); se reintentará.`);
        }
      } catch (e) {
        console.log('Error al enviar el aviso; se reintentará:', e.message);
      }
    }
    conservar.push(s);
  }
  if (cambios) await guardarSuscripciones(env, conservar);
}

// ── Punto de entrada ──

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cabecerasCors(env) });

    try {
      if (request.method === 'GET' && pathname === '/clave-publica') {
        return json(env, 200, { clavePublica: env.VAPID_CLAVE_PUBLICA });
      }
      if (request.method === 'PUT' && pathname === '/suscripcion') return await putSuscripcion(request, env);
      if (request.method === 'POST' && pathname === '/suscripcion/hecho') return await postHecho(request, env);
      if (request.method === 'DELETE' && pathname === '/suscripcion') return await deleteSuscripcion(request, env);
      return error(env, 404, 'Ruta no encontrada.');
    } catch (e) {
      if (e instanceof ErrorPeticion) return error(env, e.estado, e.message);
      console.log('Error interno:', e.message);
      return error(env, 500, 'Error interno del servicio de avisos.');
    }
  },

  async scheduled(evento, env, ctx) {
    ctx.waitUntil(enviarAvisosPendientes(env));
  }
};
