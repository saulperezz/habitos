# Investigación (fase 0): Recordatorio diario de hábitos, tareas y calendario

No quedaban marcadores «NEEDS CLARIFICATION» en el contexto técnico; esta fase documenta las
decisiones tecnológicas y los riesgos.

## D1. Mecanismo de notificación con la app cerrada

- **Decisión**: Web Push estándar (Push API + Notifications API) con un service worker (`sw.js`) y
  claves VAPID propias. Es la única vía que ofrece iOS (16.4+) para una web instalada en la pantalla
  de inicio.
- **Justificación**: no requiere SDK de terceros, funciona igual en iOS y Android, y el servicio de
  entrega (APNs / FCM, a través del `endpoint`) lo pone el propio sistema operativo.
- **Alternativas descartadas**:
  - *Notification Triggers / alarmas locales en el navegador*: no están disponibles en Safari ni en
    Chrome estable; no hay forma de programar un aviso local sin servidor.
  - *OneSignal u otros SDK*: cargan scripts externos (infringe el principio I) y recogen datos de uso
    (infringe el principio II).
  - *Firebase Cloud Messaging con SDK*: añade un SDK externo y una cuenta de Google; no aporta nada
    sobre Web Push estándar.

## D2. Dónde se programa y envía el aviso

- **Decisión**: Cloudflare Workers (plan gratuito) con un *Cron Trigger* cada minuto (`* * * * *`)
  y Workers KV para las suscripciones.
- **Justificación**: sin servidores que mantener (principio V), gratuito (100 000 peticiones/día,
  1 440 ejecuciones de cron/día), latencia de cron de segundos → cumple SC-002a (≤5 min). Web
  Crypto nativo permite firmar el JWT VAPID (ES256) sin paquetes npm.
- **Alternativas descartadas**:
  - *GitHub Actions programado*: intervalo mínimo de 5 min y retrasos habituales de 10–30 min;
    no cumple SC-002a.
  - *Supabase Edge Functions + pg_cron*: viable, pero añade una base de datos Postgres para guardar
    tres campos; más complejidad sin beneficio.
  - *Servidor propio / VPS*: requiere mantenimiento; contrario al principio V.

## D3. Contenido del push

- **Decisión**: enviar el *push* **sin carga útil**. El texto genérico («¿Qué tal hoy? Haz el repaso
  de tus hábitos») lo define `sw.js`.
- **Justificación**: así el worker no necesita guardar las claves `p256dh`/`auth` ni implementar el
  cifrado `aes128gcm` (RFC 8291); solo guarda el `endpoint` → máxima privacidad (FR-003b) y mínimo
  código.
- **Alternativa**: carga útil cifrada con un texto fijo (requiere guardar `p256dh`/`auth` e
  implementar RFC 8291 con Web Crypto, ~80 líneas). Se reserva como plan B (ver R1).

## D4. Evitar avisos duplicados y respetar la zona horaria

- **Decisión**: cada minuto el worker lee una única clave KV `suscripciones` (lista), calcula la hora
  local de cada suscripción con `Intl.DateTimeFormat(..., { timeZone })` y envía si
  `horaLocal ≥ hora` y `ultimoEnvio ≠ fechaLocal`; después escribe `ultimoEnvio`.
- **Justificación**: una sola lectura KV por minuto (1 440/día, dentro de las 100 000 lecturas
  gratuitas); una escritura por dispositivo y día; si un minuto falla, el siguiente recupera el envío.
- **Alternativas**: una clave por suscripción con `list()` (el plan gratuito permite 1 000
  `list`/día, insuficiente para 1 440 ejecuciones); Durable Objects con alarmas (más complejo).

## D5. Repaso ya hecho antes de la hora

- **Decisión**: el worker no conoce el estado del repaso (privacidad), así que la notificación puede
  llegar igualmente; al abrirla, si el repaso del día está completado, la app muestra «El repaso de
  hoy ya está hecho» con un resumen. Además, al completar el repaso, el cliente avisa al worker con
  `POST /suscripcion/hecho` para que ese día no envíe el aviso (solo envía el `endpoint` y la fecha,
  sin datos de hábitos).
- **Justificación**: cubre los dos caminos del caso límite de la especificación sin exponer datos.
- **Alternativa**: que el service worker no muestre la notificación si el repaso está hecho. Se
  descarta: iOS y Chrome exigen mostrar una notificación por cada *push* y revocan la suscripción si
  no se hace.

## D6. Interpretación de las respuestas del repaso

- **Decisión**: «Sí» marca el hábito como cumplido en el día del repaso. «No» lo registra como
  respondido sin marcarlo (no desmarca si ya estaba marcado, según la especificación). «Saltar» lo
  deja sin responder, para poder retomarlo al continuar el repaso.
- **Justificación**: sigue literalmente el escenario 3 de la historia 1 y FR-007.

## D7. Día al que pertenece el repaso

- **Decisión**: el «día del repaso» es la fecha local en Europe/Madrid; si la hora local es anterior
  a las 04:00, el día del repaso es el anterior.
- **Justificación**: supuesto de la especificación. Se aplica solo al repaso; el marcado manual de la
  lista sigue usando el día actual.

## D8. Clave de fecha única (corrección de un defecto existente)

- **Decisión**: una única función que devuelve `AAAA-MM-DD` en Europe/Madrid para cualquier `Date`,
  usada por `today()`, las rachas y el calendario.
- **Justificación**: hoy `today()` usa la hora de Madrid y `dateStr()` usa UTC (`toISOString`), lo que
  puede romper rachas entre las 00:00 y las 01:00/02:00. El principio IV exige un único formato
  coherente. Las claves guardadas ya son `AAAA-MM-DD`, así que no hay migración de datos.

## D9. Navegación de la interfaz

- **Decisión**: barra de pestañas inferior con «Hábitos» y «Tareas»; el calendario sigue abriéndose
  desde la fecha de la cabecera y su detalle de día es una hoja inferior; el repaso es una vista a
  pantalla completa; los ajustes del recordatorio, una hoja inferior abierta desde un botón con
  icono de campana.
- **Justificación**: FR-009 (Tareas en un toque), SC-003 (detalle de un día en ≤2 toques: fecha →
  día) y reutiliza los patrones de hoja inferior que ya tiene la app.

## D10. Permiso de notificaciones e instalación

- **Decisión**: el permiso solo se pide al pulsar «Activar avisos» en Ajustes (iOS exige un gesto
  del usuario). Si la app no está instalada en iOS (`navigator.standalone` falso) o el navegador no
  soporta Push, se muestran instrucciones para añadirla a la pantalla de inicio y el estado
  «no soportado»; el repaso al abrir sigue funcionando.

## D11. Protección del endpoint público del worker

- **Decisión**: CORS limitado al origen `https://saulperezz.github.io`; solo se aceptan `endpoint`
  de servicios de push conocidos (`*.push.apple.com`, `fcm.googleapis.com`,
  `*.notify.windows.com`, `updates.push.services.mozilla.com`); máximo 10 suscripciones; validación
  estricta de `hora` (`HH:MM`) y `zonaHoraria` (IANA válida).
- **Justificación**: no hay cuentas (principio II), así que se acota el abuso sin pedir
  credenciales. Una clave compartida en el cliente sería pública igualmente.

## Riesgos

- **R1 — push sin contenido en iOS**: la especificación de Web Push permite mensajes sin carga útil
  y Safari los entrega al service worker con `event.data === null`, pero hay que comprobarlo en un
  iPhone real (paso 6 de quickstart). Si fallara, se aplica la alternativa de D3 (carga útil cifrada
  con texto fijo), que sigue cumpliendo FR-003b porque el texto no contiene datos del usuario.
- **R2 — caducidad de suscripciones**: si el servicio responde 404/410, el worker borra esa
  suscripción; la app vuelve a suscribirse al abrirse si el permiso sigue concedido
  (`pushManager.getSubscription()` nulo).
- **R3 — iOS borra el almacenamiento de webs no instaladas**: con la app instalada en la pantalla de
  inicio no se aplica; se recomienda instalarla y se mantiene la exportación de datos fuera de
  alcance de esta funcionalidad.
