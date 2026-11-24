# Contrato: avisos push del repaso

## 1. Lógica compartida (`saas/src/features/push/queries.ts`)

Todas las funciones reciben el cliente de Supabase con la sesión del usuario (`DB`).

| Función | Qué hace |
|---|---|
| `listPushEndpoints(db): Promise<string[]>` | Lee los `endpoint` del usuario (RLS). |
| `registerPush(db, sub: PushSubscriptionInput): Promise<void>` | Llama a `rpc('register_push_subscription', …)`. |
| `unregisterPush(db, endpoint: string): Promise<void>` | Hace `delete … where endpoint = $1` (RLS; borrar uno que no existe no es error). |
| `sendTestPush(db, endpoint: string): Promise<'sent' \| 'gone'>` | Hace `POST` a la Edge Function `push-test` con el `access_token` de la sesión. |

`PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } }` tiene la forma
de `PushSubscription.toJSON()`. Se valida con `pushSubscription` (Zod) en `src/lib/validation.ts`.

No se añade ruta en `/api/v1`. Las suscripciones Web Push solo pueden crearse desde un navegador,
que ya usa Server Actions, y no hay terceros que las necesiten (principio V). Si algún día hace
falta, la ruta llamaría a estas mismas funciones.

## 2. Server Actions (`saas/src/features/push/actions.ts`)

Todas devuelven el `Result` habitual de `safe()`: `{ ok: true, data }` o `{ ok: false, error }`,
con el mensaje en español.

| Acción | Entrada | Errores |
|---|---|---|
| `registerPushAction(sub)` | `PushSubscriptionInput` | `bad_request`: «Este dispositivo no es compatible con los avisos.» · `limit_exceeded`: «Ya tienes avisos en 10 dispositivos. Desactívalos en alguno para añadir este.» |
| `unregisterPushAction(endpoint)` | `string` | — |
| `sendTestPushAction(endpoint)` | `string` | `rate_limited`: «Espera un momento antes de enviar otra prueba.» · `not_found` (el dispositivo ya no está registrado): «Este dispositivo ya no tiene los avisos activados.» · `internal`: «No se pudo enviar el aviso de prueba. Inténtalo de nuevo.» |

Hay dos mensajes de `limit_exceeded` según el contexto: el genérico de `errors.ts` («Has alcanzado
el máximo permitido.») y el específico de esta acción. La acción traduce el error a su mensaje
antes de devolverlo.

## 3. Funciones SQL

Ver `data-model.md`. Resumen de permisos:

| Función | `authenticated` | `reminder_sender` | `anon` |
|---|---|---|---|
| `register_push_subscription(text, text, text)` | ✅ | ❌ | ❌ |
| `claim_due_reminders(integer, timestamptz)` | ❌ | ✅ | ❌ |
| `report_reminder_results(jsonb)` | ❌ | ✅ | ❌ |

`reminder_sender` no puede hacer `select`, `insert`, `update` ni `delete` sobre ninguna tabla.

## 4. Edge Function `review-reminders` (cron)

- **Ruta**: `POST /functions/v1/review-reminders`.
- **`verify_jwt = false`** (en `supabase/config.toml`, `[functions.review-reminders]`).
- **Autenticación**: `Authorization: Bearer <REMINDERS_CRON_SECRET>`, comparada en tiempo
  constante. Si falta o no coincide → `401 {"error":"No autorizado."}`.
- **Respuesta**: `202 {"ok":true}` inmediata. El trabajo sigue en `EdgeRuntime.waitUntil`.
- **Trabajo**:
  1. Conectar con `REMINDER_SENDER_DB_URL` (Supavisor, transacciones, `prepare: false`, `max: 1`).
  2. Repetir mientras queden menos de 100 s:
     - `select * from public.claim_due_reminders(500)`;
     - si no vuelve nada, terminar;
     - enviar a cada dispositivo con concurrencia 50: `TTL: 3600`, `Urgency: high`,
       `Topic: repaso`, carga `{"t":"review"}` cifrada y VAPID;
     - clasificar la respuesta: `201`/`200`/`202` → `sent`; `404`/`410` → `gone`; resto o
       excepción → `retry`; endpoint fuera de la lista de hosts → `gone`, sin `fetch`;
     - `select public.report_reminder_results($1::jsonb)`.
  3. Registrar en el log solo contadores (`enviados`, `caducados`, `reintentos`), nunca endpoints
     ni identificadores.
- **Secrets**: `REMINDERS_CRON_SECRET`, `REMINDER_SENDER_DB_URL`, `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY` (JWK) y `VAPID_SUBJECT` (`mailto:` o `https:`).
- **Ejecuciones solapadas**: son seguras. `claim_due_reminders` usa `skip locked` y marca al
  reclamar.

## 5. Edge Function `push-test`

- **Ruta**: `POST /functions/v1/push-test`, con `verify_jwt = true` (por defecto).
- **Cabeceras**: `Authorization: Bearer <access_token del usuario>` y `apikey: <clave publicable>`.
- **Cuerpo**: `{ "endpoint": string }`, como mucho 2 KB. Si hay campos extra o falta `endpoint` → `400`.
- **Trabajo**:
  1. `GET {SUPABASE_URL}/rest/v1/push_subscriptions?select=endpoint,p256dh,auth&endpoint=eq.<endpoint>`
     con el token del usuario. RLS limita a sus filas.
  2. Si no hay fila → `404 {"error":"not_found"}`.
  3. Enviar `{"t":"test"}` con `TTL: 60`, `Urgency: high` y `Topic: prueba`.
  4. Según la respuesta:
     - `201`/`200`/`202` → `200 {"result":"sent"}`;
     - `404`/`410` → `DELETE` de la fila con el token del usuario y `200 {"result":"gone"}`;
     - otro → `502 {"error":"push_failed"}`.
- **Secrets**: `VAPID_*`, más `SUPABASE_URL` y `SUPABASE_ANON_KEY`, que el entorno inyecta.

## 6. Módulos compartidos (`saas/supabase/functions/_shared/`)

Sin imports y solo con Web Crypto. Se importan desde Deno y desde Vitest.

| Exportación | Contrato |
|---|---|
| `PUSH_HOSTS: RegExp[]` · `isAllowedPushEndpoint(url: string): boolean` | Lista de D7. |
| `vapidAuthorization(endpoint, { publicKey, privateKeyJwk, subject }, now?) => Promise<string>` | `vapid t=<JWT ES256>, k=<publicKey>`; `exp` = `now` + 12 h. |
| `encryptPayload(payload: Uint8Array, { p256dh, auth }) => Promise<Uint8Array>` | Cuerpo `aes128gcm` (RFC 8291): cabecera con `salt` (16 B), `rs` = 4096, `idlen` = 65, clave pública efímera y registro cifrado con el delimitador `0x02`. |
| `sendWebPush(sub, payload, { ttl, urgency, topic }, vapid, fetchFn = fetch) => Promise<number>` | Construye las cabeceras (`Content-Encoding: aes128gcm`, `Content-Type: application/octet-stream`, `TTL`, `Urgency`, `Topic` y `Authorization`) y devuelve el `status`. |
| `classifyPushStatus(status: number \| null): 'sent' \| 'gone' \| 'retry'` | `null` = excepción de red. |

## 7. Service worker (`saas/public/sw.js`)

| Evento | Comportamiento |
|---|---|
| `push` | `data = event.data?.json()` (con `try`). `t === 'test'` → `showNotification('Habitos', { body: 'Los avisos funcionan ✓', tag: 'prueba', … })`. En cualquier otro caso → `{ body: '¿Qué tal hoy? Haz el repaso de tus hábitos', tag: 'repaso-diario', renotify: false, … }`. Siempre con `icon` y `badge` en `/icons/icono-192.png` y `data: { url: '/review?desde=aviso' }`. Siempre llama a `showNotification` (requisito de `userVisibleOnly`). |
| `notificationclick` | `close()`. Busca una ventana del mismo origen (`clients.matchAll({ type: 'window', includeUncontrolled: true })`); si la hay, `focus()` + `navigate(url)`; si no, `clients.openWindow(url)`. |
| `install` / `activate` | `skipWaiting()` / `clients.claim()`. |

## 8. Interfaz (Ajustes › Repaso diario › Avisos)

Va en un bloque nuevo dentro de la tarjeta del repaso, debajo de la hora. Todos los botones miden
al menos 44 px y tienen texto visible.

| Estado | Texto | Acciones |
|---|---|---|
| comprobando | «Comprobando avisos…» | — |
| no-disponible (iPhone/iPad sin instalar) | «Para recibir avisos en iPhone, añade la app a la pantalla de inicio: Compartir › Añadir a pantalla de inicio.» | — |
| no-disponible (otro) | «Este navegador no permite avisos.» | — |
| sin-configurar (falta `NEXT_PUBLIC_VAPID_PUBLIC_KEY` en el despliegue) | «Los avisos todavía no están disponibles en esta versión de la app.» | — |
| no-activados | «Recibe un aviso a las HH:MM si aún no has hecho el repaso.» (si el repaso está desactivado: «Los avisos solo llegan con el repaso diario activado.») | «Activar avisos» |
| activados | «Avisos activados en este dispositivo ✓» | «Enviar aviso de prueba» · «Desactivar avisos» |
| bloqueados | «Has bloqueado los avisos. Actívalos en los ajustes del navegador o del móvil.» | — |

Mensajes de resultado, en `role="status"`, o en `role="alert"` si son errores:

- Al activar: «Avisos activados. El primero llegará a las HH:MM.» Si la hora de hoy ya pasó:
  «Avisos activados. El primero llegará mañana a las HH:MM.»
- Al enviar la prueba: «Aviso de prueba enviado.» Si el dispositivo ya no existía: «Este
  dispositivo ya no tiene los avisos activados.», y el estado pasa a no-activados.
- Al desactivar: «Avisos desactivados en este dispositivo.»
- Error al activar o desactivar: «No se pudieron cambiar los avisos. Inténtalo de nuevo.»
- Errores de las acciones: los de la sección 2.

### Repaso abierto desde el aviso

`/review?desde=aviso` con el repaso completado muestra el título «El repaso de hoy ya está hecho»,
el resumen «X de Y cumplidos» y los botones «Volver» (a `/today`) y «Repetir repaso». Sin
`desde=aviso`, el comportamiento actual no cambia.
