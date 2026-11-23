# Tareas: Avisos push del repaso diario

**Entrada**: documentos de diseño de `specs/004-avisos-push/`

**Requisitos previos**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/push-api.md`, `quickstart.md`

**Pruebas**: se incluyen porque la constitución exige pruebas en `saas/tests/db.test.ts` para todo
cambio de migraciones o funciones, y porque `quickstart.md §1` las enumera. Se escriben antes de la
implementación de su bloque y deben fallar primero.

**Organización**: por historia de usuario de `spec.md`. Todas las rutas son relativas a la raíz del
repositorio. La migración nueva es **un único archivo**,
`saas/supabase/migrations/20261123000000_push_reminders.sql`; varias tareas lo amplían porque aún
no se ha aplicado en ningún entorno.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Historia]**: historia de usuario a la que pertenece (US1, US2, US3, US4)

---

## Fase 1: Preparación

- [X] T001 Comprobar que la rama actual es `claude/mvp-architecture-build-hbua5y`, al día con
  `origin/master`, y que en `saas/` pasa `npm run lint && npm run typecheck && npm test && npm run
  build` antes de tocar nada
- [X] T002 [P] Excluir el código Deno de la compilación de Next:
  - en `saas/tsconfig.json`, añadir `"supabase/functions/*/index.ts"` a `exclude`;
  - en `saas/eslint.config.mjs`, añadir `'supabase/functions/*/index.ts'` a `ignores`.

  Los módulos de `supabase/functions/_shared/` **no** se excluyen.
- [X] T003 [P] Configuración:
  - en `saas/.env.example`, añadir `NEXT_PUBLIC_VAPID_PUBLIC_KEY=` con el comentario «Clave
    pública VAPID (base64url). La privada solo va en los secrets de Supabase.»;
  - en `saas/supabase/config.toml`, añadir `[functions.review-reminders]` con
    `verify_jwt = false` y `[functions.push-test]` con `verify_jwt = true`.

---

## Fase 2: Base (bloquea todas las historias)

**Propósito**: envío Web Push, validación, alta de dispositivos y service worker, compartidos por
todas las historias.

- [X] T004 [P] Escribir `saas/tests/web-push.test.ts`, que debe fallar porque aún no existen los
  módulos. Casos:
  - `isAllowedPushEndpoint` acepta `https://web.push.apple.com/x`,
    `https://fcm.googleapis.com/fcm/send/x`, `https://wns2-db5p.notify.windows.com/x` y
    `https://updates.push.services.mozilla.com/x`, y rechaza `http://fcm.googleapis.com/x`,
    `https://evil.com/x` y `https://fcm.googleapis.com.evil.com/x`.
  - `classifyPushStatus`: `200`/`201`/`202` → `sent`; `404`/`410` → `gone`; `400`/`429`/`500`/`null`
    → `retry`.
  - `vapidAuthorization`: tiene la forma `vapid t=<a>.<b>.<c>, k=<pública>`; el JWT se verifica con
    `crypto.subtle.verify` (ECDSA P-256/SHA-256) contra la clave pública; la carga tiene
    `aud` = origen del endpoint, `exp` = `now` + 43 200 s y `sub`.
  - `encryptPayload`:
    - generar en la prueba un par ECDH P-256 (la suscripción) y 16 bytes `auth`;
    - cifrar `{"t":"review"}`;
    - descifrar en la prueba siguiendo RFC 8291 (ECDH con la clave efímera de la cabecera, HKDF
      con `"WebPush: info\0" || ua_public || as_public`, CEK y nonce con `"Content-Encoding:
      aes128gcm\0"` y `"Content-Encoding: nonce\0"`);
    - comprobar que se recupera el texto y que la cabecera tiene `rs` = 4096 e `idlen` = 65.
  - `sendWebPush` con un `fetchFn` falso: método `POST` y cabeceras `Content-Encoding: aes128gcm`,
    `Content-Type: application/octet-stream`, `TTL`, `Urgency`, `Topic` y `Authorization`
    `vapid …`; devuelve el `status`.
- [X] T005 [P] Crear `saas/supabase/functions/_shared/reminders.ts`, sin imports, con:
  - `PUSH_HOSTS`: `/(^|\.)push\.apple\.com$/`, `/^fcm\.googleapis\.com$/`,
    `/(^|\.)notify\.windows\.com$/`, `/^updates\.push\.services\.mozilla\.com$/`;
  - `isAllowedPushEndpoint(url)`: protocolo `https:` y `hostname` que encaje con `PUSH_HOSTS`;
    `false` si la URL no es válida;
  - `classifyPushStatus(status: number | null): 'sent' | 'gone' | 'retry'`.
- [X] T006 [P] Crear `saas/supabase/functions/_shared/web-push.ts`, sin imports y solo con
  `crypto.subtle`, según `contracts/push-api.md §6`:
  - `base64urlEncode` y `base64urlDecode`;
  - `vapidAuthorization(endpoint, { publicKey, privateKeyJwk, subject }, now = Date.now())`:
    adapta `cabeceraVapid` de `notificaciones/worker.js` (JWT ES256, `aud` = `new
    URL(endpoint).origin`, `exp` = 12 h y firma `r||s`). Guarda en caché la `CryptoKey` importada
    por JWK.
  - `encryptPayload(payload, { p256dh, auth })`, RFC 8291/8188:
    - clave efímera ECDH P-256 y `salt` aleatorio de 16 bytes;
    - IKM = HKDF(auth, ecdh, `"WebPush: info\0"||ua_pub||as_pub`, 32);
    - CEK = HKDF(salt, IKM, `"Content-Encoding: aes128gcm\0"`, 16);
    - nonce = HKDF(salt, IKM, `"Content-Encoding: nonce\0"`, 12);
    - texto + `0x02` cifrado con AES-GCM;
    - cuerpo = `salt||rs(4096, uint32 BE)||idlen(65)||as_pub||cifrado`.
  - `sendWebPush(sub, payload, { ttl, urgency, topic }, vapid, fetchFn = fetch)`: cifra, firma,
    hace el `POST` y devuelve `response.status`. **No** comprueba el host: para que los dos
    módulos sigan sin imports, quien llama (`review-reminders` y `push-test`) comprueba
    `isAllowedPushEndpoint` de `reminders.ts` antes de llamar (contrato §4 y §5).

  Las pruebas de T004 deben pasar.
- [X] T007 Escribir en `saas/tests/db.test.ts` un `describe('avisos push: registro')`, que debe
  fallar. Casos:
  - Alice registra un dispositivo válido con
    `select public.register_push_subscription($1,$2,$3)` y lo ve en `push_subscriptions`.
  - Registrar otra vez el mismo endpoint actualiza las claves y `updated_at`, sin duplicar.
  - Bob registra el **mismo** endpoint → desaparece de Alice y pasa a Bob (FR-006).
  - Endpoint `https://evil.com/x`, claves con caracteres fuera de base64url o longitudes fuera de
    rango → error (`invalid_push_subscription` o `check constraint`).
  - Con 10 dispositivos, el undécimo → `limit_exceeded`.
  - `anon` no puede ejecutarla (`permission denied`).
  - Borrar la cuenta (`delete_account`) borra sus dispositivos (FR-021).
  - Registrar con `review_time` ya pasada hoy en la zona del perfil fija `last_reminder_day` = hoy
    local; con la hora aún por llegar, lo deja como estaba.

  Para que sea determinista, actualizar `review_time` del perfil a `00:00` o `23:59` antes de
  registrar.
- [X] T008 Crear `saas/supabase/migrations/20261123000000_push_reminders.sql`, primera parte
  (`data-model.md`):
  1. `alter table public.profiles add column last_reminder_day date`.
  2. En `push_subscriptions`:
     - añadir `updated_at timestamptz not null default now()`;
     - borrar las filas que no cumplan las restricciones nuevas;
     - añadir, `not valid` y después `validate constraint`:
       - `push_subscriptions_endpoint_host check (substring(endpoint from '^https://([^/:]+)') ~
         '(^|\.)push\.apple\.com$|^fcm\.googleapis\.com$|(^|\.)notify\.windows\.com$|^updates\.push\.services\.mozilla\.com$')`;
       - `push_subscriptions_keys_format check (p256dh ~ '^[A-Za-z0-9_-]{86,88}$' and auth ~
         '^[A-Za-z0-9_-]{21,24}$')`.
  3. Función `public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
     returns void`, `language plpgsql security definer set search_path = ''`:
     - `uid := auth.uid()`; si es nulo, `raise exception 'not_authenticated'`;
     - comprobar los formatos y lanzar `invalid_push_subscription` (errcode `P0001`) si fallan;
     - `delete from public.push_subscriptions where endpoint = p_endpoint and user_id <> uid`;
     - `insert (user_id, endpoint, p256dh, auth) values (uid, …) on conflict (endpoint) do update
       set p256dh = excluded.p256dh, auth = excluded.auth, updated_at = now()`;
     - leer `timezone` y `review_time` del perfil; si `(now() at time zone tz)::time >=
       review_time` y `last_reminder_day is distinct from (now() at time zone tz)::date`, fijar
       `last_reminder_day` a ese día.
  4. `revoke execute … from anon, public` y `grant execute … to authenticated`.

  Las pruebas de T007 deben pasar.
- [X] T009 [P] En `saas/src/lib/validation.ts`, añadir:
  - `pushEndpoint`: `z.string().max(1024).refine(isAllowedPushEndpoint)`, importando
    `isAllowedPushEndpoint` desde `../../supabase/functions/_shared/reminders`;
  - `pushSubscription`: `z.object({ endpoint: pushEndpoint, keys: z.object({ p256dh:
    z.string().regex(/^[A-Za-z0-9_-]{86,88}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{21,24}$/) })
    })` con `.strip()` en el objeto exterior, para aceptar `expirationTime` y descartarlo.

  En `saas/tests/validation.test.ts`, probar:
  - que acepta un `toJSON()` realista (con `expirationTime: null`);
  - que rechaza un host no permitido, `http:` y claves mal formadas.
- [X] T010 [P] En `saas/src/lib/db/types.ts`, añadir:
  - `last_reminder_day: string | null` a `profiles` (Row, Insert y Update opcional);
  - `updated_at: string` a `push_subscriptions` (Row; opcional en Insert y Update);
  - `register_push_subscription: { Args: { p_endpoint: string; p_p256dh: string; p_auth: string };
    Returns: undefined }` en `Functions`.

  No añadir `claim_due_reminders` ni `report_reminder_results`.
- [X] T011 Crear `saas/src/features/push/queries.ts` (`import 'server-only'`) con:
  - `listPushEndpoints(db)`: `select('endpoint')`, devuelve `string[]`;
  - `registerPush(db, sub)`: `check(await db.rpc('register_push_subscription', { p_endpoint,
    p_p256dh, p_auth }))`;
  - `unregisterPush(db, endpoint)`: `delete().eq('endpoint', endpoint)`.

  Crear `saas/src/features/push/actions.ts` (`'use server'`) con `registerPushAction(input)` y
  `unregisterPushAction(endpoint)`. Las dos usan `safe()`, `requireSession()` y `parse()`:
  - `registerPushAction` valida con `pushSubscription`; si el error es `limit_exceeded`, devuelve
    «Ya tienes avisos en 10 dispositivos. Desactívalos en alguno para añadir este.»; si es
    `invalid_push_subscription` o de validación, «Este dispositivo no es compatible con los
    avisos.»;
  - `unregisterPushAction` valida con `pushEndpoint`.

  Ninguna hace `revalidatePath`: el componente actualiza su estado.
- [X] T012 [P] Crear `saas/public/sw.js` según `contracts/push-api.md §7`, en JavaScript plano sin
  caché ni `fetch`:
  - `install` → `self.skipWaiting()` y `activate` → `event.waitUntil(self.clients.claim())`;
  - `push` → leer `event.data?.json()` en `try`; si `t === 'test'`: cuerpo «Los avisos funcionan
    ✓» y `tag: 'prueba'`; en otro caso: cuerpo «¿Qué tal hoy? Haz el repaso de tus hábitos» y
    `tag: 'repaso-diario'`; título «Habitos», `icon` y `badge` en `/icons/icono-192.png`, `data: {
    url: '/review?desde=aviso' }`, todo dentro de `event.waitUntil(…showNotification…)`;
  - `notificationclick` → `close()`; buscar ventana con `clients.matchAll({ type: 'window',
    includeUncontrolled: true })`; si la hay, `focus()` y `navigate(url)`; si no, `openWindow(url)`.

  Además:
  - en `saas/next.config.ts`, añadir para `source: '/sw.js'` las cabeceras `Cache-Control:
    no-cache, no-store, must-revalidate` y `Content-Type: application/javascript; charset=utf-8`;
  - en `saas/src/proxy.ts`, añadir `sw\\.js` a la exclusión del `matcher`.

**Punto de control**: cifrado, firma, validación y alta de dispositivos probados; el service worker
ya se sirve.

---

## Fase 3: Historia 1 - Recibir un aviso a la hora del repaso (P1) 🎯 MVP

**Objetivo**: activar los avisos en Ajustes y recibir uno al día a la hora del repaso, salvo que
esté hecho.

**Prueba independiente**: `quickstart.md §3`, pasos 1, 4, 6, 8, 12 y 13.

### Pruebas de la historia 1

- [X] T013 [US1] Escribir en `saas/tests/db.test.ts` un `describe('avisos push: envío')`, que debe
  fallar. Preparación:
  - el usuario tiene un hábito activo, `timezone = 'Europe/Madrid'`, `review_time = '22:00'` y un
    dispositivo registrado;
  - llamar como `reminder_sender` (`set role reminder_sender`) a
    `public.claim_due_reminders(500, $now)` con instantes fijos.

  Casos:
  - A las 21:59 locales no devuelve nada; a las 22:00 devuelve una fila por dispositivo con
    `day` = fecha local, y `last_reminder_day` queda fijado.
  - Una segunda llamada el mismo día no devuelve nada (FR-012).
  - Con el repaso del día completado (`review_sessions.completed_at`), con `review_enabled =
    false`, sin hábitos activos (todos con `archived_at`) o sin dispositivos → no devuelve nada.
  - Regla de las 04:00: con `review_time = '02:00'`, a las 02:30 del martes local devuelve el
    aviso si el repaso **del lunes** no está completado, y no lo devuelve si lo está.
  - Horario de verano: con `review_time = '02:30'` en `Europe/Madrid`, el último domingo de marzo
    a las 03:00 locales lo devuelve.
  - `report_reminder_results`:
    - `[{outcome:'gone'}]` borra ese dispositivo;
    - todo `retry` → la siguiente llamada lo vuelve a devolver;
    - un `sent` y un `retry` en dos dispositivos → no lo devuelve;
    - los elementos mal formados se ignoran sin error.
  - Permisos:
    - `reminder_sender` recibe `permission denied` en `select` sobre `public.habits`,
      `public.profiles` y `public.push_subscriptions`;
    - `authenticated` y `anon` reciben `permission denied` al ejecutar `claim_due_reminders` y
      `report_reminder_results`.

### Implementación de la historia 1

- [X] T014 [US1] Ampliar `saas/supabase/migrations/20261123000000_push_reminders.sql`:
  - `do $$ … if not exists (select from pg_roles where rolname = 'reminder_sender') then create
    role reminder_sender nologin noinherit; end if; … $$`;
  - `grant usage on schema public to reminder_sender`;
  - `public.claim_due_reminders(p_limit integer default 500, p_now timestamptz default now())
    returns table (user_id uuid, day date, subscription_id uuid, endpoint text, p256dh text, auth
    text)`, `security definer set search_path = ''`:
    1. CTE con los perfiles que tienen algún dispositivo y cumplen research D3:
       - `review_enabled`;
       - existe un hábito con `archived_at is null`;
       - `(p_now at time zone timezone)::time >= review_time`;
       - `last_reminder_day is distinct from (p_now at time zone timezone)::date`;
       - no existe `review_sessions` con `completed_at is not null` y `day` = día del repaso (la
         fecha local, o la anterior si la hora local es `< 04:00`).

       Con `limit p_limit` y `for update of p skip locked`.
    2. `update` de esos perfiles con `last_reminder_day` = día local.
    3. Devolver sus dispositivos.
  - `public.report_reminder_results(p_results jsonb) returns void`, `security definer set
    search_path = ''`:
    1. Ignorar si no es un array o tiene más de 5 000 elementos.
    2. Borrar `push_subscriptions` con `outcome = 'gone'` (`id` y `user_id` coinciden).
    3. Para cada `(user_id, day)` sin ningún `sent` → `update profiles set last_reminder_day =
       null where id = user_id and last_reminder_day = day`.
    4. Usar `jsonb_to_recordset` y descartar filas con uuid o fecha no válidos.
  - `revoke execute` de ambas `from public, anon, authenticated` y `grant execute … to
    reminder_sender`.

  Las pruebas de T013 deben pasar.
- [X] T015 [US1] Ampliar la misma migración con el bloque de programación condicionado (research
  D11, `data-model.md › Programación`):
  - si `pg_available_extensions` tiene `pg_cron` y `pg_net` → `create extension if not exists` de
    ambas;
  - `cron.schedule('review-reminders', '* * * * *', $job$ … $job$)`. El trabajo:
    - lee `decrypted_secret` de `vault.decrypted_secrets`, con `name` =
      `'reminders_function_url'` y `'reminders_cron_secret'`;
    - si falta alguno, no hace nada;
    - si están los dos, `perform net.http_post(url := …, headers := jsonb_build_object(
      'Authorization', 'Bearer ' || secreto, 'Content-Type', 'application/json'), body :=
      '{}'::jsonb, timeout_milliseconds := 5000)`.
  - Antes de programar, `cron.unschedule('review-reminders')` si ya existe, para que sea
    idempotente.

  Comprobar que `tests/db.test.ts` sigue pasando (PGlite salta el bloque).
- [X] T016 [US1] Crear `saas/supabase/functions/review-reminders/index.ts` (Deno) según
  `contracts/push-api.md §4`:
  - `import postgres from 'npm:postgres@3.4.7'` y los módulos de `../_shared/*.ts`;
  - `Deno.serve`: solo `POST`; comparar `Authorization` con `Bearer ${REMINDERS_CRON_SECRET}` en
    tiempo constante (comparar los resúmenes SHA-256 byte a byte) → `401 {"error":"No
    autorizado."}`;
  - responder `202 {"ok":true}` y ejecutar el trabajo en `EdgeRuntime.waitUntil(run())`;
  - `run()`:
    - `sql = postgres(REMINDER_SENDER_DB_URL, { prepare: false, max: 1 })`;
    - mientras queden menos de 100 s: `claim_due_reminders(500)`; si no hay filas, terminar;
    - enviar con concurrencia 50: `TTL: 3600`, `Urgency: 'high'`, `Topic: 'repaso'`, carga
      `{"t":"review"}`; un endpoint no permitido → `gone`, sin `fetch`;
    - clasificar con `classifyPushStatus` (`null` si hay excepción);
    - `report_reminder_results(${JSON.stringify(results)}::jsonb)`;
    - `sql.end()` en `finally`;
  - `console.log` solo con contadores: `{ enviados, caducados, reintentos }`.
- [X] T017 [US1] Crear `saas/src/app/(app)/settings/push-settings.tsx` (`'use client'`). Props:
  `{ endpoints: string[]; reviewTime: string; reviewEnabled: boolean; vapidPublicKey: string |
  null }`.
  - **Estado** (`contracts/push-api.md §8`), calculado en `useEffect`:
    - sin `serviceWorker`, `PushManager`, `Notification` o `vapidPublicKey` → `no-disponible`, con
      el texto de iPhone si `/iPhone|iPad/.test(navigator.userAgent)` y no se cumple
      `matchMedia('(display-mode: standalone)').matches`, ni `navigator.standalone`; si no, «Este
      navegador no permite avisos.»;
    - `Notification.permission === 'denied'` → `bloqueados`;
    - registrar `/sw.js` y obtener `pushManager.getSubscription()`; si su `endpoint` está en
      `endpoints` → `activados`; si no → `no-activados`.
  - **«Activar avisos»**:
    1. `Notification.requestPermission()` (solo dentro del clic, FR-002); si es `denied` →
       `bloqueados`;
    2. `navigator.serviceWorker.ready`;
    3. `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey:
       base64url→Uint8Array(vapidPublicKey) })`;
    4. `registerPushAction(sub.toJSON())`;
    5. si va bien: guardar `localStorage['habitos-avisos'] = '1'` (en `try`), estado `activados` y
       el mensaje «Avisos activados. El primero llegará a las HH:MM.» o «…mañana a las HH:MM.»
       según la hora local actual frente a `reviewTime`;
    6. si falla: `sub.unsubscribe()` y mostrar el error de la acción, o «No se pudieron cambiar
       los avisos. Inténtalo de nuevo.» si es de red.
  - Mostrar «Activando…» mientras tanto.
  - Textos de `no-activados`, incluido el de repaso desactivado.
  - Botones `btn-primary`/`btn-ghost` de al menos 44 px; mensajes con `role="status"`, o
    `role="alert"` si son errores.
- [X] T018 [US1] En `saas/src/app/(app)/settings/page.tsx`:
  - obtener `listPushEndpoints(db)` (en `Promise.all` con lo que ya se consulta);
  - renderizar `<PushSettings endpoints reviewTime={profile.review_time.slice(0, 5)}
    reviewEnabled={profile.review_enabled} vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    ?? null} />` justo después de `<ProfileForm>`, dentro de una tarjeta con `label` «Avisos».
- [X] T019 [US1] Crear `saas/src/components/push-sync.tsx` (`'use client'`, devuelve `null`) y
  montarlo en `saas/src/app/(app)/layout.tsx`. En `useEffect`, todo en `try/catch` y sin mostrar
  errores, actúa solo si:
  - `localStorage['habitos-avisos'] === '1'`;
  - `sessionStorage['habitos-avisos-sync']` no está;
  - `Notification.permission === 'granted'`;
  - hay soporte.

  Entonces:
  1. registra `/sw.js`;
  2. obtiene `getSubscription()`, o se suscribe de nuevo si falta (con
     `NEXT_PUBLIC_VAPID_PUBLIC_KEY`);
  3. llama a `registerPushAction(sub.toJSON())`;
  4. marca `sessionStorage['habitos-avisos-sync'] = '1'`.

  Si el permiso pasó a `denied`, borra la marca local (FR-008).
- [X] T020 [P] [US1] En `saas/README.md`:
  - añadir la sección «Avisos push» con:
    - el esquema de funcionamiento (cron → `review-reminders` → servicios push);
    - un fragmento de Web Crypto para generar las claves VAPID (JWK privada + pública base64url),
      adaptado de `notificaciones/LEEME.md`;
    - los pasos 2–7 de `quickstart.md §2`;
  - añadir `last_reminder_day` y las tres funciones nuevas a la tabla de esquema y a la lista de
    RPC;
  - en «Fase 2», marcar los avisos push como hechos.

**Punto de control**: la historia 1 funciona sola. Con la hora a 2 minutos vista llega un único
aviso, y no llega si el repaso está hecho.

---

## Fase 4: Historia 2 - Abrir el repaso desde el aviso (P1)

**Objetivo**: un toque en el aviso lleva al repaso del día o a «ya está hecho».

**Prueba independiente**: `quickstart.md §3`, pasos 5 y 7.

- [ ] T021 [US2] En `saas/src/app/(app)/review/page.tsx`:
  - aceptar `searchParams: Promise<{ desde?: string }>`;
  - pasar `fromReminder={(await searchParams).desde === 'aviso'}` a `<ReviewFlow>`.
- [ ] T022 [US2] En `saas/src/app/(app)/review/review-flow.tsx`, añadir la prop `fromReminder:
  boolean`. Si `fromReminder && completed`:
  - mostrar el título «El repaso de hoy ya está hecho», el resumen «X de Y cumplidos» (contando
    `answered[h.id] === 'yes'`) y los botones «Volver» (`Link` a `/today`) y «Repetir repaso»;
  - «Repetir repaso» pasa al flujo actual de repetir todos los hábitos.

  Sin `fromReminder`, el comportamiento actual no cambia.

**Punto de control**: tocar un aviso abre el repaso, o «ya está hecho»; sin sesión, pasa por
`/login?next=/review`.

---

## Fase 5: Historia 3 - Gestionar los avisos en varios dispositivos (P2)

**Objetivo**: desactivar por dispositivo y dejar de avisar al cerrar sesión.

**Prueba independiente**: `quickstart.md §3`, pasos 10 y 11.

- [ ] T023 [US3] En `saas/src/app/(app)/settings/push-settings.tsx`, añadir «Desactivar avisos»
  en el estado `activados`:
  1. `unregisterPushAction(sub.endpoint)`;
  2. `sub.unsubscribe()`;
  3. borrar `localStorage['habitos-avisos']`;
  4. estado `no-activados`.

  Si falla el paso 1: «No se pudieron cambiar los avisos. Inténtalo de nuevo.», sin tocar la
  suscripción local.
- [ ] T024 [US3] Crear `saas/src/components/sign-out-button.tsx` (`'use client'`). Al pulsar:
  1. intentar, con un límite de 3 s y sin bloquear si falla, `getSubscription()` →
     `unregisterPushAction(endpoint)` → `unsubscribe()`;
  2. borrar las marcas `habitos-avisos` y `habitos-avisos-sync`;
  3. llamar a `signOutAction()`.

  En `saas/src/app/(app)/settings/page.tsx`, sustituir el `<form action={signOutAction}>` por
  `<SignOutButton />`, con el mismo estilo `btn-ghost mt-2` y el texto «Cerrar sesión» (FR-005).

**Punto de control**: con dos dispositivos, desactivar en uno no afecta al otro; cerrar sesión
deja de avisar a ese dispositivo.

---

## Fase 6: Historia 4 - Comprobar que los avisos funcionan (P3)

**Objetivo**: botón de prueba que avisa en menos de 30 s solo a este dispositivo.

**Prueba independiente**: `quickstart.md §3`, pasos 2 y 3.

- [ ] T025 [P] [US4] Crear `saas/supabase/functions/push-test/index.ts` (Deno) según
  `contracts/push-api.md §5`:
  - solo `POST`; cuerpo de como mucho 2 048 bytes, que sea exactamente `{ endpoint: string }`
    (si no → `400`);
  - con `Authorization` y `apikey` de la petición: `GET
    ${SUPABASE_URL}/rest/v1/push_subscriptions?select=endpoint,p256dh,auth&endpoint=eq.${encodeURIComponent(endpoint)}`;
  - sin fila → `404 {"error":"not_found"}`;
  - `sendWebPush` con `{"t":"test"}`, `TTL: 60`, `Urgency: 'high'` y `Topic: 'prueba'`;
  - `sent` → `200 {"result":"sent"}`; `gone` → `DELETE` de esa fila con el mismo token y `200
    {"result":"gone"}`; otro → `502 {"error":"push_failed"}`.
- [ ] T026 [US4] En `saas/src/features/push/queries.ts`, añadir `sendTestPush(db, endpoint):
  Promise<'sent' | 'gone'>`:
  - `access_token` de `(await db.auth.getSession()).data.session`;
  - `fetch(`${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/push-test`, { method: 'POST', headers: {
    Authorization: `Bearer ${token}`, apikey: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint }), cache: 'no-store' })`;
  - `404` → `AppError('not_found', 'Este dispositivo ya no tiene los avisos activados.')`;
  - otro error → `AppError('internal', 'No se pudo enviar el aviso de prueba. Inténtalo de
    nuevo.')`.

  En `saas/src/features/push/actions.ts`, añadir `sendTestPushAction(endpoint)`:
  - `rateLimit(`push-test:${user.id}`, 5, 60)`; si no pasa → `AppError('rate_limited', 'Espera un
    momento antes de enviar otra prueba.')`;
  - validar con `pushEndpoint` y llamar a `sendTestPush`.
- [ ] T027 [US4] En `saas/src/app/(app)/settings/push-settings.tsx`, añadir «Enviar aviso de
  prueba» en el estado `activados`:
  - «Enviando…» mientras tanto;
  - `sent` → «Aviso de prueba enviado.»;
  - `gone` o `not_found` → «Este dispositivo ya no tiene los avisos activados.», estado
    `no-activados` y borrar la marca local;
  - otros errores → el mensaje de la acción.

**Punto de control**: las cuatro historias funcionan por separado.

---

## Fase 7: Pulido y comprobaciones transversales

- [ ] T028 Revisar que todos los textos nuevos están en español con tildes (Ajustes, `sw.js`,
  acciones y repaso), y que `contracts/push-api.md §8` coincide con lo implementado. Revisar
  también que en todos los componentes nuevos los botones miden al menos 44 px y tienen etiqueta,
  el modo oscuro funciona y no hay desplazamiento horizontal a 360 y 430 px
- [ ] T029 Pasar en `saas/` `npm run lint && npm run typecheck && npm test && npm run build`, y
  corregir lo que falle
- [ ] T030 Revisar de nuevo la «Comprobación de Constitución» de `plan.md` con el código final.
  Confirmar en concreto:
  - no se usa `SUPABASE_SERVICE_ROLE_KEY` ni `SUPABASE_DB_URL` en ningún archivo;
  - la carga solo es `{"t":…}`;
  - los logs de las funciones no incluyen endpoints ni identificadores.
- [ ] T031 Puesta en marcha (`quickstart.md §2`, pasos 1–7) en el proyecto de Supabase y en
  Vercel. **Manual**: requiere las credenciales del propietario
- [ ] T032 Pruebas a mano de `quickstart.md §3` (pasos 1–14) en la vista previa de Vercel, en
  Android o escritorio y en un iPhone con la app instalada. **Manual**
- [ ] T033 Abrir un PR de `claude/mvp-architecture-build-hbua5y` a `master` con el resumen de la
  funcionalidad, los pasos manuales de despliegue y las excepciones de «Seguimiento de complejidad»

---

## Dependencias y orden de ejecución

### Entre fases

- **Preparación (T001–T003)**: sin dependencias.
- **Base (T004–T012)**: depende de la preparación y bloquea todas las historias.
  - T004 (pruebas) va antes que T005 y T006.
  - T007 (pruebas) va antes que T008.
  - T009 depende de T005, porque importa `isAllowedPushEndpoint`.
  - T011 depende de T008, T009 y T010.
- **Historia 1 (T013–T020)**: depende de la base.
  - T013 va antes que T014; T015 va después de T014.
  - T016 depende de T005, T006 y T014.
  - T017 depende de T011 y T012; T018 depende de T017; T019 depende de T011 y T012.
- **Historia 2 (T021–T022)**: solo necesita T012 (`notificationclick`). Se puede hacer en
  paralelo con la historia 1, pero para probarla de punta a punta hace falta recibir un aviso
  (historia 1 o 4).
- **Historia 3 (T023–T024)**: depende de T017.
- **Historia 4 (T025–T027)**: T025 depende de T006; T026 depende de T011; T027 depende de T017 y
  T026.
- **Pulido (T028–T033)**: depende de todas las historias que se quieran entregar.

### Dentro de cada historia

Primero las pruebas (que fallan), después la migración o las funciones, después la lógica
compartida y las acciones, y al final la interfaz.

---

## Ejemplo de paralelismo: base

```text
En paralelo: T004 (tests/web-push.test.ts), T005 (_shared/reminders.ts), T010 (db/types.ts), T012 (public/sw.js + next.config + proxy)
Después:     T006 (_shared/web-push.ts) y T007 → T008 (migración)
Después:     T009 (validation.ts) → T011 (features/push)
```

## Ejemplo de paralelismo: historias

```text
Tras la base:  T013 → T014 → T015 → T016   (BD y Edge Function de la historia 1)
En paralelo:   T017 → T018 y T019          (interfaz de la historia 1)
En paralelo:   T021 → T022                 (historia 2: repaso)
En paralelo:   T025                         (historia 4: Edge Function de prueba)
```

---

## Estrategia de implementación

### Primero el MVP (historias 1 y 2)

1. Fases 1 y 2.
2. Fase 3 (historia 1): ya llegan los avisos diarios.
3. Fase 4 (historia 2): el toque lleva al repaso. Es pequeña y completa el ciclo.
4. **Parar y validar**: `quickstart.md §3`, pasos 1, 4–9, 12 y 13.

### Entrega incremental

- Historia 3: desactivar por dispositivo y cerrar sesión.
- Historia 4: aviso de prueba (muy útil para depurar iPhone antes de esperar un día).
- Pulido, puesta en marcha y PR.

## Notas

- La migración `20261123000000_push_reminders.sql` es un solo archivo, que crece en T008, T014 y
  T015. Una vez aplicada en cualquier entorno, no se edita (principio IV).
- Las Edge Functions no se ejecutan en la CI. Su lógica sensible (`_shared/`) sí se prueba con
  Vitest; `index.ts` se prueba en la puesta en marcha (T031) y a mano (T032).
- T031 y T032 los tiene que hacer el propietario del proyecto (credenciales de Supabase y Vercel,
  y dispositivos reales).
