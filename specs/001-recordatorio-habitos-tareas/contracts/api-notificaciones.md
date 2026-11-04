# Contrato: API del worker de notificaciones

Base: `https://habitos-avisos.<subdominio>.workers.dev` (se fija al desplegar; el cliente la guarda
en una constante de `index.html`).

## Reglas comunes

- Solo JSON (`Content-Type: application/json`), cuerpo ≤ 2 KB.
- CORS: `Access-Control-Allow-Origin: https://saulperezz.github.io`; responde a `OPTIONS`.
- Ningún campo distinto de los listados se acepta ni se guarda (FR-003b); los campos desconocidos se
  rechazan con `400`.
- `endpoint` DEBE ser `https://` y pertenecer a `*.push.apple.com`, `fcm.googleapis.com`,
  `*.notify.windows.com` o `updates.push.services.mozilla.com`.
- `hora` DEBE cumplir `^([01]\d|2[0-3]):[0-5]\d$`; `zonaHoraria` DEBE ser aceptada por
  `Intl.DateTimeFormat`.
- Errores: `{ "error": "<mensaje en español>" }`.

## `GET /clave-publica`

Devuelve la clave pública VAPID para `pushManager.subscribe`.

- `200` → `{ "clavePublica": "<base64url>" }`

## `PUT /suscripcion`

Crea o actualiza (por `endpoint`) la suscripción.

Petición:

```json
{ "endpoint": "https://web.push.apple.com/…", "hora": "22:00", "zonaHoraria": "Europe/Madrid" }
```

Respuestas:

- `200` → `{ "ok": true }` (creada o actualizada)
- `400` → datos no válidos
- `409` → se alcanzó el máximo de 10 suscripciones

## `POST /suscripcion/hecho`

Indica que el repaso de `fecha` ya está hecho para no enviar el aviso ese día (research D5).

```json
{ "endpoint": "https://web.push.apple.com/…", "fecha": "2026-11-04" }
```

- `200` → `{ "ok": true }` (fija `ultimoEnvio = fecha`)
- `404` → endpoint no registrado (el cliente vuelve a llamar a `PUT /suscripcion`)

## `DELETE /suscripcion`

```json
{ "endpoint": "https://web.push.apple.com/…" }
```

- `200` → `{ "ok": true }` (también si no existía)

## Cron `* * * * *` (interno)

Para cada suscripción: si la hora local en `zonaHoraria` ≥ `hora` y `ultimoEnvio` ≠ fecha local →
enviar *push* Web Push sin carga útil al `endpoint` con cabeceras `TTL: 3600`, `Urgency: high`,
`Authorization: vapid t=<JWT ES256>, k=<clave pública>`; si responde `201` → `ultimoEnvio = fecha
local`; si `404`/`410` → eliminar la suscripción; otros errores → reintentar en el minuto siguiente.

## Secretos y variables

| Nombre | Tipo | Uso |
|--------|------|-----|
| `VAPID_CLAVE_PRIVADA` | *secret* (JWK) | Firmar el JWT; nunca en el cliente |
| `VAPID_CLAVE_PUBLICA` | variable | Devuelta en `GET /clave-publica` |
| `VAPID_SUJETO` | variable | `mailto:` de contacto exigido por VAPID |
| `ORIGEN_PERMITIDO` | variable | `https://saulperezz.github.io` |
| `SUSCRIPCIONES` | KV | Clave única `suscripciones` |
