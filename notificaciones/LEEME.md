# Servicio de avisos diarios (Cloudflare Worker)

Este worker envía cada día, a la hora que elijas, una notificación al móvil para hacer el repaso de
hábitos, aunque la app esté cerrada. Es el único componente externo de la app (constitución,
principio I) y solo guarda por dispositivo la dirección de entrega (`endpoint`), la hora, la zona
horaria y la fecha del último aviso. Nunca recibe hábitos, historial ni tareas.

Coste: 0 € con el plan gratuito de Cloudflare.

## 1. Crear la cuenta

1. Regístrate gratis en <https://dash.cloudflare.com/sign-up>.
2. En el panel, entra en **Workers y Pages** y elige un subdominio `*.workers.dev`.

## 2. Generar las claves VAPID

Abre cualquier pestaña del navegador, abre la consola de desarrollador (F12 › Consola), pega esto y
pulsa Intro:

```js
(async () => {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const jwk = await crypto.subtle.exportKey('jwk', par.privateKey);
  const crudo = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const publica = btoa(String.fromCharCode(...crudo)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  console.log('VAPID_CLAVE_PUBLICA =', publica);
  console.log('VAPID_CLAVE_PRIVADA =', JSON.stringify({ kty: jwk.kty, crv: jwk.crv, d: jwk.d, x: jwk.x, y: jwk.y }));
})();
```

Guarda las dos líneas que aparecen. **La clave privada es secreta**: no la subas al repositorio ni
la pegues en `index.html`.

## 3. Crear el almacenamiento KV

Panel › **Almacenamiento y bases de datos › KV** › *Crear espacio de nombres* › nombre
`habitos-suscripciones`. Copia su **ID** en `wrangler.toml` (`id = "..."`).

## 4. Configurar `wrangler.toml`

- `VAPID_CLAVE_PUBLICA`: la clave pública del paso 2.
- `VAPID_SUJETO`: `mailto:` con un correo de contacto tuyo (lo exige el estándar VAPID; solo lo ven
  los servicios de notificaciones de Apple/Google).
- `ORIGEN_PERMITIDO`: `https://saulperezz.github.io` (no cambiar salvo que publiques la app en otro
  sitio).

## 5. Desplegar

**Opción A — sin instalar nada (panel web):**

1. **Workers y Pages › Crear › Worker** › nombre `habitos-avisos` › *Desplegar*.
2. *Editar código*: sustituye el contenido por el de `worker.js` y despliega.
3. **Configuración › Variables y secretos**: añade `VAPID_CLAVE_PUBLICA`, `VAPID_SUJETO` y
   `ORIGEN_PERMITIDO` como texto, y `VAPID_CLAVE_PRIVADA` como **secreto** (pega el JSON del paso 2).
4. **Configuración › Enlaces**: añade un enlace KV con nombre de variable `SUSCRIPCIONES` al espacio
   `habitos-suscripciones`.
5. **Configuración › Activadores › Eventos cron**: añade `* * * * *` (cada minuto).

**Opción B — con la línea de comandos** (requiere Node.js; no forma parte de la app):

```bash
cd notificaciones
npx wrangler login
npx wrangler secret put VAPID_CLAVE_PRIVADA   # pega el JSON del paso 2
npx wrangler deploy
```

## 6. Conectar la app

Copia la URL del worker (p. ej. `https://habitos-avisos.<subdominio>.workers.dev`) en la constante
`URL_AVISOS` al principio del `<script>` de `index.html` y publica la app en GitHub Pages.

## 7. Comprobar

```bash
BASE=https://habitos-avisos.<subdominio>.workers.dev
curl -s $BASE/clave-publica
# Debe devolver 400 (dominio no permitido):
curl -s -X PUT $BASE/suscripcion -H 'Content-Type: application/json' \
  -d '{"endpoint":"https://ejemplo.com/x","hora":"22:00","zonaHoraria":"Europe/Madrid"}'
# Debe devolver 400 (campo no permitido):
curl -s -X PUT $BASE/suscripcion -H 'Content-Type: application/json' \
  -d '{"endpoint":"https://web.push.apple.com/x","hora":"22:00","zonaHoraria":"Europe/Madrid","habitos":[]}'
```

Después sigue los pasos 6 y 7 de `specs/001-recordatorio-habitos-tareas/quickstart.md` en tu iPhone.
En **Workers › habitos-avisos › Registros** puedes ver si los avisos se envían.

## Si el aviso no llega en iPhone

La app envía el aviso sin contenido (máxima privacidad). Si iOS no lo mostrara, la alternativa
prevista (research D3, plan B) es enviar un texto fijo cifrado; requiere guardar además las claves
`p256dh`/`auth` del dispositivo, que tampoco contienen datos tuyos.
