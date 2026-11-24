# Investigación (fase 0): Avisos push del repaso diario

Cada decisión sigue el formato **Decisión / Motivo / Alternativas descartadas**.

## D1. Quién envía los avisos y cómo lee los datos de todos los usuarios

**Decisión**: una Supabase Edge Function, `review-reminders`, que `pg_cron` invoca cada minuto
mediante `pg_net`. La función se conecta a Postgres con un **rol propio y mínimo**,
`reminder_sender`. Ese rol no tiene permisos sobre ninguna tabla: solo puede ejecutar dos funciones
`security definer`:

- `claim_due_reminders(p_limit)`: elige y marca los avisos que tocan;
- `report_reminder_results(p_results)`: borra los dispositivos caducados y libera los envíos que
  fallaron.

La conexión usa el *pooler* de transacciones de Supabase (Supavisor, puerto 6543) con `npm:postgres`.

**Motivo**:

- El envío programado tiene que leer los dispositivos de **todos** los usuarios. Con la sesión de
  un usuario o la clave pública es imposible, y la constitución prohíbe la clave *service role*.
- Un rol que solo ejecuta dos funciones acotadas da el mínimo privilegio posible. Si se filtra su
  contraseña, solo permite lanzar avisos genéricos y borrar dispositivos que ya no existen. No
  permite leer hábitos, notas ni tareas.
- Toda la lógica de «a quién le toca» queda en SQL, que se prueba con PGlite como el resto de la BD.
- Es lo que pidió el usuario («pg_cron cada minuto + Edge Function»).

**Alternativas descartadas**:

- *Edge Function con `SUPABASE_SERVICE_ROLE_KEY` o `SUPABASE_DB_URL`*: es acceso total a la BD, y la
  constitución lo prohíbe.
- *Vercel Cron + Route Handler en Next*: el plan gratuito de Vercel solo ejecuta crons una vez al
  día. Además seguiría haciendo falta un acceso entre usuarios.
- *RPC expuestas a `anon` y protegidas con un secreto en el argumento*: expone funciones a
  visitantes anónimos y deja la seguridad en comparar un texto dentro de SQL. Es peor que un rol
  sin acceso por la API.
- *Que `pg_cron` calcule los destinatarios y se los mande a la función con `pg_net`, procesando
  después las respuestas desde `net._http_response`*: evita la contraseña del rol, pero es
  asíncrono. Además `pg_net` tiene tiempos de espera cortos, y el tratamiento de errores se reparte
  entre dos ejecuciones del cron. Es más complejo y más frágil.
- *Firmar y enviar desde Postgres*: `pgcrypto` no tiene ECDSA P-256, así que no puede firmar VAPID.

## D2. Cómo se garantiza «un aviso al día» con reintentos

**Decisión**: se usa una columna nueva, `profiles.last_reminder_day date` (último día natural en
que se envió el aviso).

1. `claim_due_reminders` bloquea las filas con `for update skip locked`, **fija
   `last_reminder_day` = hoy en el mismo paso** y devuelve los dispositivos. Así, dos ejecuciones
   que se solapen nunca eligen al mismo usuario.
2. Después de enviar, `report_reminder_results` recibe el resultado de cada dispositivo:
   - `404`/`410` → borra el dispositivo;
   - si **ningún** dispositivo del usuario aceptó el aviso (todos fallaron de forma temporal o
     caducaron) → devuelve `last_reminder_day` a su valor anterior para reintentar el minuto
     siguiente, siempre que siga siendo el mismo día.
   - Si al menos uno lo aceptó, no se reintenta, para no duplicar el aviso en ese dispositivo.
3. Si la función se cae entre la marca y el informe, ese aviso del día se pierde: es como mucho
   un aviso, nunca dos. Se prefiere esto a un posible duplicado (SC-002).

**Motivo**: cumple FR-012 (como máximo uno al día, cambie lo que cambie después) y FR-013
(reintento dentro del día) con una sola columna y sin tablas de cola.

**Alternativas descartadas**:

- *Marca por dispositivo*, como `ultimoEnvio` en `notificaciones/worker.js`: la spec cuenta un
  aviso por usuario y día. Además, cambiar la hora con varios dispositivos podría reabrir el envío
  en unos sí y en otros no.
- *Marcar solo tras enviar*: dos ejecuciones solapadas enviarían dos veces.
- *Una cola (`pgmq`)*: la hoja de ruta de `saas/README.md` la reserva para más de un millón de
  usuarios (principio V).

## D3. Cuándo «toca» el aviso (SQL)

**Decisión**: un usuario recibe el aviso en el instante `p_now` si se cumplen todas estas
condiciones:

- `review_enabled` está activo;
- tiene al menos un dispositivo;
- tiene al menos un hábito con `archived_at is null`;
- `(p_now at time zone timezone)::time >= review_time`;
- `last_reminder_day is distinct from (p_now at time zone timezone)::date`;
- no hay `review_sessions` con `completed_at` no nulo para el **día del repaso**.

El día del repaso es la fecha local, o la anterior si la hora local es menor que 04:00 (la misma
regla que `reviewDayIn` de `src/lib/dates.ts`).

La consulta parte de `push_subscriptions` (solo usuarios con dispositivos) y une `profiles`. Se
procesan lotes de 500 usuarios, repitiendo hasta que no quede ninguno o se acabe el tiempo de la
función.

**Motivo**:

- `at time zone` resuelve el horario de verano: el día que no existe 02:30, a las 03:00 ya se
  cumple `>= 02:30`.
- Comparar con `>=` en lugar de con la hora exacta cubre minutos perdidos (cron retrasado,
  reintentos) sin ventanas mágicas.
- El límite «mismo día» lo pone `last_reminder_day`.

**Alternativas descartadas**: calcular en TypeScript con `Intl` como el worker antiguo. Obligaría
a leer todos los perfiles y repasos desde la función, que es lo que el rol mínimo de D1 evita.

## D4. Activar los avisos después de la hora de hoy

**Decisión**: si al registrar un dispositivo la hora local ya superó la del repaso y aún no se ha
enviado el aviso de hoy, `register_push_subscription` fija `last_reminder_day` = hoy. El primer
aviso llega mañana. Se añade como caso límite en la spec.

**Motivo**: es lo que hacía `notificaciones/worker.js` (`ultimoEnvio: ahora.hora >= hora ?
ahora.fecha : null`). Evita que, al activar a las 22:30, llegue un aviso al instante que parece un
error. Para comprobar en el momento está «Enviar aviso de prueba».

**Alternativas descartadas**: enviar el aviso de hoy en el siguiente minuto. Confunde y hace
redundante la prueba.

## D5. Contenido del aviso: carga cifrada en lugar de push vacío

**Decisión**: se envía una carga mínima cifrada con `aes128gcm` (RFC 8291 + RFC 8188) usando solo
Web Crypto (ECDH P-256, HKDF y AES-GCM). La carga es `{"t":"review"}` o `{"t":"test"}`. El
service worker elige el texto según `t`; si la carga falta o no se puede leer, muestra el texto del
repaso.

**Motivo**:

- Hace falta distinguir el aviso de prueba («Los avisos funcionan ✓») del diario.
- La tarea T042 de la spec 001 dejó sin comprobar en iPhone el push sin contenido (research D3,
  «plan B»). El push cifrado es el camino estándar que documentan Apple, Google y Mozilla.
- La carga no lleva ningún dato del usuario (principio II, FR-016).
- El módulo (`supabase/functions/_shared/web-push.ts`) no importa nada. Se prueba en Vitest con
  `globalThis.crypto` de Node: se cifra para una suscripción generada en la prueba y se descifra.

**Alternativas descartadas**:

- *Push vacío* como el worker antiguo: no distingue la prueba y tiene el riesgo de iOS.
- *Paquete `web-push` de npm*: depende de `crypto` de Node. En Deno funciona con la capa de
  compatibilidad, pero añade una dependencia grande para unas 120 líneas de Web Crypto.

## D6. Firma VAPID

**Decisión**: se reutiliza la lógica de `notificaciones/worker.js`:

- JWT ES256 con `aud` = origen del endpoint, `exp` = 12 h y `sub` = `VAPID_SUBJECT`;
- firma `r||s` de Web Crypto;
- cabecera `Authorization: vapid t=…, k=…`.

Va en `_shared/web-push.ts`. El par de claves es nuevo y exclusivo de `saas/`:

- la clave privada va en JWK, como *secret* de las Edge Functions (`VAPID_PRIVATE_KEY`);
- la pública va en base64url, en `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (Vercel) y en `VAPID_PUBLIC_KEY`
  (Edge Functions).

Las peticiones llevan `TTL: 3600` (FR-014), `Urgency: high` y `Topic: repaso`. Con `Topic`, el
servicio sustituye un aviso pendiente por el siguiente.

**Motivo**: código ya probado en producción en la app antigua. Las claves aparte evitan acoplar
la app congelada.

**Alternativas descartadas**: compartir las claves del worker antiguo. Ataría el despliegue de
`saas/` al de Cloudflare.

## D7. Alta, baja y «un dispositivo = una cuenta»

**Decisión**:

- **Alta**: RPC `register_push_subscription(p_endpoint, p_p256dh, p_auth)`, `security definer`,
  solo para `authenticated`, que usa `auth.uid()`:
  1. borra cualquier fila con ese `endpoint` (de cualquier cuenta, FR-006);
  2. inserta o actualiza la del usuario (el disparador existente sigue limitando a 10);
  3. aplica D4.
- **Baja**: `delete` normal con RLS (`push_subscriptions_owner`), desde `features/push/queries.ts`.
- **Validación**:
  - El `endpoint` debe ser `https://` y su host debe estar en una lista de servicios push
    conocidos, la misma de `notificaciones/worker.js`. Se comprueba en Zod, en la RPC y otra vez en
    la Edge Function antes de cada `fetch`, para que el servidor nunca haga peticiones a hosts
    arbitrarios (SSRF).
  - `p256dh` y `auth` deben ser base64url con la longitud esperada (65 y 16 bytes).

**Motivo**:

- `endpoint` es `unique` en toda la tabla. Con RLS, un `insert` normal de la cuenta B falla si la
  fila es de la cuenta A, y B no puede verla para borrarla. Hace falta una función que actúe
  sobre todas las filas, pero solo con ese `endpoint`.
- Para «robar» un endpoint hay que conocerlo, y es una URL secreta que solo tiene el dispositivo.
  Lo peor que podría pasar es que la víctima dejara de recibir el aviso: se acepta y se documenta.

**Alternativas descartadas**: quitar el `unique` y permitir el mismo endpoint en varias cuentas. El
dispositivo recibiría avisos de cuentas de las que ya se ha cerrado sesión, en contra de FR-005 y
FR-006.

## D8. Saber si «este dispositivo» tiene los avisos activados y resincronizar

**Decisión**:

- **Ajustes**: el Server Component pasa al cliente la lista de `endpoint` del usuario, que son
  datos propios. El componente `push-settings.tsx` calcula el estado:
  - sin API (`serviceWorker`, `PushManager`, `Notification`) → «no disponible»; en iPhone o iPad
    sin modo `standalone`, con el texto de instalar;
  - `Notification.permission === 'denied'` → «bloqueados»;
  - `pushManager.getSubscription()` cuyo `endpoint` está en la lista → «activados»;
  - en otro caso → «no activados».
- **Al abrir la app** (FR-008): `PushSync`, componente cliente sin interfaz en
  `(app)/layout.tsx`, actúa una vez por sesión de pestaña si se cumplen las dos condiciones:
  - `localStorage['habitos-avisos'] === '1'`, que se guarda al activar y se borra al desactivar
    o cerrar sesión;
  - el permiso está concedido.

  Entonces obtiene o recrea la suscripción y llama a `registerPushAction`, que es idempotente.

**Motivo**: es el mismo patrón que la spec 001 (`endpointRegistrado`, research R2), adaptado a
varios dispositivos. La marca local evita volver a suscribir un dispositivo en el que el usuario
desactivó los avisos.

**Alternativas descartadas**: el evento `pushsubscriptionchange` en el service worker. No se
dispara en Safari y necesitaría otra ruta autenticada desde el service worker. La
resincronización al abrir basta (principio V).

## D9. Cerrar sesión

**Decisión**: el botón «Cerrar sesión» pasa a ser un componente cliente pequeño que:

1. si hay suscripción local, llama a `unregisterPushAction(endpoint)`;
2. llama a `subscription.unsubscribe()`;
3. borra la marca local;
4. ejecuta el `signOutAction` actual.

Los errores de los pasos 1 a 3 no impiden cerrar sesión.

**Motivo**: el servidor no conoce el `endpoint` del dispositivo que cierra sesión. Solo el cliente
lo sabe.

**Alternativas descartadas**: borrar todos los dispositivos al cerrar sesión. Afectaría a los
demás dispositivos, en contra de la historia 3.

## D10. Aviso de prueba

**Decisión**: hay una segunda Edge Function, `push-test`, con `verify_jwt = true`, y una Server
Action `sendTestPushAction(endpoint)`:

1. La acción aplica `rateLimit('push-test:<uid>', 5, 60)`.
2. Llama a la función con el `access_token` del usuario.
3. La función lee el dispositivo por PostgREST con ese token (RLS: solo el propio).
4. Envía `{"t":"test"}` con `TTL: 60`.
5. Si responde `404`/`410`, borra la fila con el mismo token.

**Motivo**:

- La clave privada VAPID vive en un único sitio (los *secrets* de las Edge Functions).
- La prueba usa la sesión del usuario, no el rol de D1.
- Sin dependencias: PostgREST se llama con `fetch`.

**Alternativas descartadas**:

- *Duplicar la clave VAPID en Vercel y enviar desde Next*: la clave estaría en dos sitios.
- *Marcar la prueba y que la envíe el cron*: hasta 60 s de espera, y SC/escenario 4.1 pide menos
  de 30 s.

## D11. Programación con `pg_cron` y entornos sin extensiones

**Decisión**:

- La migración activa `pg_cron` y `pg_net` y programa el trabajo `review-reminders` (`* * * * *`)
  **solo si las extensiones están disponibles**: un bloque `do` comprueba `pg_available_extensions`,
  así que PGlite y la CI la saltan.
- El trabajo lee de Supabase Vault la URL de la función y el secreto del cron en cada ejecución
  (`reminders_function_url` y `reminders_cron_secret`). Si no existen, no hace nada.
- La función responde `202` al momento y sigue trabajando con `EdgeRuntime.waitUntil`, así que el
  tiempo de espera de `pg_net` no corta el envío.

**Motivo**:

- `supabase db push` deja todo programado.
- Los valores que dependen del entorno o son secretos no van en el repositorio.
- Las pruebas no necesitan extensiones.

**Alternativas descartadas**: un script SQL manual fuera de las migraciones. Es fácil olvidarlo y
no queda versionado.

## D12. Abrir el repaso desde el aviso

**Decisión**:

- **`notificationclick` del service worker**:
  - si hay una ventana de la app, la enfoca y le hace `navigate('/review?desde=aviso')`;
  - si no, `clients.openWindow('/review?desde=aviso')`.
- **Sin sesión**: `proxy.ts` ya redirige a `/login?next=/review` (el parámetro `desde` se pierde,
  y no importa: tras entrar se abre el repaso).
- **`/review`**: lee `searchParams.desde`. Si vale `aviso` y el repaso está completado,
  `ReviewFlow` muestra «El repaso de hoy ya está hecho» con el resumen, en vez de repetir todos los
  hábitos.

**Motivo**: es el cambio mínimo sobre el flujo actual. Hoy, abrir el repaso completado lo repite
entero, y eso se mantiene al entrar desde la cabecera.

## D13. Service worker

**Decisión**: `saas/public/sw.js`, JavaScript plano, sin caché ni `fetch` (el modo sin conexión
queda fuera de alcance):

- `install` → `skipWaiting`;
- `activate` → `clients.claim`;
- `push` → `showNotification('Habitos', { body, tag: 'repaso-diario' | 'prueba', icon:
  '/icons/icono-192.png', badge: '/icons/icono-192.png', data: { url } })`;
- `notificationclick` → D12.

Se registra desde `PushSync` y desde `push-settings.tsx` con `navigator.serviceWorker.register('/sw.js')`.

Además:

- `next.config.ts` añade a `/sw.js` las cabeceras `Cache-Control: no-cache` y
  `Content-Type: application/javascript`;
- `proxy.ts` excluye `sw.js` del *matcher*.

**Motivo**: el mismo patrón que `sw.js` de la raíz. Ninguna dependencia como `next-pwa`.

## D14. Código de las Edge Functions frente a la compilación de Next

**Decisión**:

- Las funciones viven en `saas/supabase/functions/{review-reminders,push-test}/index.ts` (Deno).
- La lógica pura va en `saas/supabase/functions/_shared/`, sin imports: `web-push.ts` y
  `reminders.ts` (clasificación de respuestas y lista de hosts).
- `tsconfig.json` y `eslint.config.mjs` excluyen `supabase/functions/**/index.ts`.
- Los módulos `_shared` se comprueban con `tsc` a través de las pruebas que los importan.
- Las versiones de los imports de Deno quedan fijadas (`npm:postgres@3.4.x`).

**Motivo**: la CI actual (`lint`, `typecheck`, `test`, `build`) sigue cubriendo la parte
delicada, que es el cifrado, VAPID y la clasificación, sin instalar Deno.
