---

description: "Lista de tareas de la funcionalidad 005: usar la app sin conexión"
---

# Tareas: Usar la app sin conexión

**Entrada**: documentos de diseño de `/specs/005-sin-conexion/`

**Requisitos previos**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Pruebas**: sí. El plan (Contexto técnico y research D12) pide pruebas Vitest de la lógica pura
(`offline-queue`, `offline-diff`, `offline-overlay`), de BD (`db.test.ts`) y de validación. Se
escriben antes de la implementación de cada módulo y deben fallar primero. Navegador, SW e iOS se
validan a mano según quickstart.md.

**Organización**: por historia de usuario, para implementar y probar cada una por separado.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes).
- **[Historia]**: historia a la que pertenece (US1 a US6).
- Todas las rutas son relativas a la raíz del repositorio; el código está en `saas/`.

## Convenciones

- Sin dependencias nuevas, sin migración y sin service role (plan, Comprobación de Constitución).
- Textos de interfaz en español, tal como aparecen en `contracts/cliente-sin-conexion.md`.
- `/api/v1` solo se llama desde `saas/src/lib/offline/sync.ts` (y el `keepalive` ya existente del
  diario). Ningún componente lo llama directamente.
- Zonas táctiles de 44×44 px, sin desplazamiento horizontal entre 360 y 430 px, modo claro y
  oscuro (FR-030).

---

## Fase 1: Preparación

**Propósito**: confirmar el punto de partida del código (research D0).

- [ ] T001 Comprobar que la rama `005-sin-conexion` contiene `origin/master` con la 004
  (`git merge-base --is-ancestor origin/master HEAD`) y que `saas/public/sw.js` conserva los
  manejadores `push` y `notificationclick`; si no, traer `origin/master` antes de seguir
- [ ] T002 Ejecutar la línea base en `saas/` (`npm run lint && npm run typecheck && npm test && npm run build`)
  y anotar cualquier fallo previo que no sea de esta funcionalidad

---

## Fase 2: Base (requisitos previos que bloquean)

**Propósito**: validación compartida, cola pura, elección de copia, almacenamiento en el
dispositivo, detección de conexión, envío y proveedor. Todas las historias dependen de esta fase.

**⚠️ CRÍTICO**: ninguna historia puede empezar hasta terminar esta fase.

### Pruebas de la base (escribir primero; deben fallar)

- [ ] T003 [P] Añadir a `saas/tests/validation.test.ts` casos para que `habitCreate` y `taskCreate`
  acepten un `id` uuid opcional y rechacen un `id` que no sea uuid («Identificador inválido»)
- [ ] T004 [P] Crear `saas/tests/offline-queue.test.ts` con pruebas de:
  - `compactar()`: regla 1 (crear y borrar = nada, también quita el id de los `habit.reorder`
    pendientes), regla 2 (borrar descarta ediciones y marcados sin enviar y añade el borrado),
    regla 3 (ediciones seguidas = una, la nueva gana campo a campo y conserva el `seq`), regla 4
    (edición sobre un `*.create` sin enviar se fusiona en el alta; en tareas `done` se añade aparte),
    regla 5 (`habit.log` con el mismo `(habitId, day)` = el último, en la posición del anterior),
    regla 6 (reordenar = el último, al final), invariante I1 (orden relativo entre elementos
    distintos), I2 (nunca toca ni elimina una operación con `enviando: true`) e I3 (el estado final
    no cambia);
  - `aPeticion()`: método, URL y cuerpo de cada uno de los 8 `tipo` según la tabla de data-model
    §2.1; el alta incluye `id`; el PATCH lleva solo los campos de `datos`; `habit.log` con
    `done: true` → `PUT` y con `done: false` → `DELETE` en `/api/v1/habits/:id/logs/:day`;
  - `clasificar()`: `200/201/204` → confirmado; `404` en `update`/`log`/`delete` → descartar por
    borrado; `400/409/413/422` y `404` en `*.create` → descartar con `error.message`; `401` → pausa;
    `408`, `429`, `5xx`, error de red y tiempo agotado → reintentar; `Retry-After` respetado
- [ ] T005 [P] Crear `saas/tests/offline-diff.test.ts`: solo se devuelven los campos cambiados; si
  cambia `dueDate` o `dueTime` se envían los dos; sin cambios → objeto vacío (la interfaz no encola
  nada); `description`/`note` vacíos se normalizan a `null` como en los formularios actuales
- [ ] T006 [P] Crear `saas/tests/offline-overlay.test.ts` con pruebas de `elegirCopia(props, copia)`:
  gana el `generadoEn` más reciente; sin copia → props; con la misma hora → props; una copia de otra
  cuenta nunca llega porque la clave incluye `userId`

### Implementación de la base

- [ ] T007 [P] Añadir `id: uuidParam.optional()` a `habitCreate` y `taskCreate` en
  `saas/src/lib/validation.ts` (`habitUpdate` y `taskUpdate` no cambian: ya son parciales y rechazan
  un cuerpo vacío) — hace pasar T003
- [ ] T008 [P] Implementar `saas/src/lib/offline/queue.ts` (PURO, sin `window` ni IndexedDB):
  tipo `Operacion` con los campos de data-model §2.1 (`seq: number`, `userId: uuid`, `tipo`,
  `entityId: uuid | null` — `null` solo en `habit.reorder`, `datos`, `etiqueta: string`,
  `creadaEn: number`, `enviando: boolean`, `intentos: number`); enumeración `tipo` exactamente
  `habit.create | habit.update | habit.delete | habit.log | habit.reorder | task.create |
  task.update | task.delete` con su `datos` tipado según la tabla; funciones `compactar(cola, nueva)`
  (reglas 1 a 6 de research D6, que devuelve qué borrar, qué actualizar y qué añadir),
  `aPeticion(op)` y `clasificar(op, respuesta | error)` (un `404` en `*.create` se trata como un
  `400`: descartar y avisar, research D6); además `esperaReintento(intentos, retryAfter?)` (2 s, 4 s,
  8 s… hasta 60 s, ±20 % de azar) — hace pasar T004
- [ ] T009 [P] Implementar `saas/src/lib/offline/diff.ts` (PURO): `camposCambiadosHabito(antes,
  formulario)` y `camposCambiadosTarea(antes, formulario)`, con fecha y hora juntas (research D4) —
  hace pasar T005
- [ ] T010 [P] Crear `saas/src/lib/offline/overlay.ts` (PURO) con `elegirCopia(props, copia)`: recibe
  `{ datos, generadoEn }` de los *props* y la copia guardada (o `null`) y devuelve la de `generadoEn`
  más reciente (research D7) — hace pasar T006
- [ ] T011 [P] Implementar `saas/src/lib/offline/idb.ts`: envoltorio en promesas de IndexedDB
  `habitos-sin-conexion` versión 1 con el almacén `cambios` (clave `seq` autoincremental, índice
  `userId`) y el almacén `copias` (clave `[userId, vista]`, `vista` ∈ `'hoy' | 'tareas' | 'diario'`,
  `generadoEn` ISO-8601, `datos`); funciones `anadirCambio(userId, op)` que aplica `compactar()`
  dentro de la misma transacción `readwrite`, `listarCambios(userId)` en orden de `seq`,
  `marcarEnviando(seq)`, `sumarIntento(seq)`, `borrarCambios(seqs)`, `contarCambios(userId)`,
  `guardarCopia`, `leerCopia`, `borrarCopias(userId)`; llamar a `navigator.storage.persist()` sin
  pedir nada; los errores de `put` (`QuotaExceededError`, bloqueado, modo privado) se propagan, nunca
  se ignoran (research D14)
- [ ] T012 [P] Implementar `saas/src/lib/offline/connectivity.ts` (research D9): estado
  `'con-conexion' | 'sin-conexion'` = `navigator.onLine` con eventos `online`/`offline` Y último
  intento de red sin fallo; `notificarFalloDeRed()`, `notificarExito()`; sonda `GET /api/health`
  (`cache: 'no-store'`, 5 s) repetida con `esperaReintento()` mientras se esté en «sin conexión»;
  suscripción con `subscribe(listener)`
- [ ] T013 Implementar `saas/src/lib/offline/sync.ts` (depende de T008, T011, T012): `sincronizar(userId)`
  con `navigator.locks.request('habitos-cola:' + userId, { ifAvailable: true })` y respaldo de
  bloqueo en memoria si no hay Web Locks; envío en serie por `seq` (marcar `enviando: true` →
  `fetch` con `credentials: 'same-origin'` y `AbortSignal.timeout(15000)` → `clasificar()`);
  confirmado → borrar; descartar → borrar y emitir un evento `descartado` (los textos de aviso se
  completan en US5); `401` → parar sin descartar y emitir `enPausaPorSesion`; temporal → `sumarIntento`,
  `notificarFalloDeRed` si es error de red, y programar reintento; al vaciar la cola emitir
  `vaciada`; disparadores: llamada explícita, `online`, `visibilitychange` a visible, y el
  temporizador; difundir `{ pendientes, sincronizando }` por `BroadcastChannel('habitos-cola')`
- [ ] T014 Implementar `saas/src/lib/offline/client.ts` (depende de T011, T012, T013): puerta única
  `escribir({ op, accion, optimista, revertir })` según research D1: con conexión y cola vacía llama a
  la Server Action; si no hay conexión, la cola tiene cambios o la Server Action lanza `TypeError`
  (fallo de red), escribe la operación con `anadirCambio` y lanza `sincronizar`; un `TypeError` de la
  Server Action llama además a `notificarFalloDeRed()` de `connectivity.ts` (research D9); si
  `anadirCambio` falla, ejecuta `revertir()` y emite el aviso «No se ha podido guardar en este
  dispositivo. Libera espacio e inténtalo de nuevo.» (D14); valida `datos` con los esquemas Zod de
  `saas/src/lib/validation.ts` antes de aceptar el cambio (FR-014)
- [ ] T015 Crear `saas/src/components/offline-provider.tsx` (cliente, depende de T010 a T014):
  recibe `userId`; registra siempre `/sw.js` con `register('/sw.js')` (sin afectar a las
  suscripciones push de la 004); expone por contexto `{ userId, conexion, pendientes, cola,
  sincronizando, enPausaPorSesion, avisos, cerrarAviso }` y un hook `useCopia(vista, datos,
  generadoEn)` (guarda la copia con conexión, lee la guardada y devuelve la más reciente con
  `elegirCopia` de T010); llama a `sincronizar` al montarse; al vaciarse la cola o tras un descarte
  llama a `router.refresh()` (FR-019, FR-024)
- [ ] T016 Envolver el contenido de `saas/src/app/(app)/layout.tsx` en `OfflineProvider` pasando
  `user.id` desde el servidor
- [ ] T017 Ejecutar `npm run lint && npm run typecheck && npm test` en `saas/`: T003 a T006 en verde

**Punto de control**: la base está lista; las historias pueden empezar.

---

## Fase 3: Historia 1 - Abrir la app sin conexión y ver mis datos (P1) 🎯 MVP

**Objetivo**: la app arranca sin conexión y muestra Hoy, Tareas y Diario con la última copia, con
el aviso «Sin conexión · N cambios pendientes» y las secciones que necesitan conexión desactivadas.

**Prueba independiente**: abrir Hoy, Tareas y Diario con conexión; cerrar la app; modo avión;
abrirla desde el icono: se ven los mismos datos y «Sin conexión» (quickstart §3.1-3.4 y §4 A-B).

### Pruebas de la historia 1

- [ ] T018 [P] [US1] Añadir a `saas/tests/offline-overlay.test.ts` pruebas de
  `avanzarDia(datosHoy, diaCalculado)` (si el día calculado es posterior, hábitos conocidos sin
  marcar y racha = `streakBefore + (hechoAyer ? 1 : 0)`; si es el mismo día, sin cambios)

### Implementación de la historia 1

- [ ] T019 [P] [US1] Ampliar `saas/public/sw.js` (JavaScript plano, sin tocar `push` ni
  `notificationclick`): cachés `habitos-estaticos-v1`, `habitos-paginas-v1`, `habitos-respaldo-v1`;
  `install` precarga `/sin-conexion.html`, los iconos de `public/icons` y `/manifest.webmanifest`;
  `activate` borra las cachés `habitos-*` que no estén en la lista y mantiene `skipWaiting` y
  `clients.claim`
- [ ] T020 [US1] Añadir a `saas/public/sw.js` el manejador `fetch` según la tabla de
  `contracts/cliente-sin-conexion.md` §1: no interceptar lo que no sea `GET`, de otro origen,
  `/api/*`, `/auth/*` ni `/login`; `/_next/static/*` caché primero; navegación a `/today`, `/tasks`,
  `/notes` red primero con 4 s, guardando solo respuestas `ok`, sin redirección y con la misma ruta
  (clave sin query); una respuesta de red que no se guarda (redirección o `!ok`) se devuelve tal
  cual, y la caché solo se usa si falla la red (error o tiempo agotado): la copia guardada o, si no
  hay, `/sin-conexion.html?motivo=primera-vez`; `/` red y si falla
  la copia de `/today`; otras navegaciones red y si falla `/sin-conexion.html?motivo=seccion`;
  peticiones con cabecera `RSC: 1` sin conexión → `Response.error()` (depende de T019)
- [ ] T021 [US1] Añadir a `saas/public/sw.js` los mensajes `{ t: 'calentar' }` (pide `/today`,
  `/tasks`, `/notes`, los guarda, extrae con una expresión regular las URL `/_next/static/…` de su
  HTML, guarda las que faltan y borra de `habitos-estaticos-v1` las que ya no aparecen) y
  `{ t: 'olvidar-paginas' }` (borra `habitos-paginas-v1`) (depende de T020)
- [ ] T022 [P] [US1] Crear `saas/public/sin-conexion.html`: página estática en español con estilos en
  línea, `prefers-color-scheme`, zonas seguras, sin desplazamiento horizontal entre 360 y 430 px;
  lee `motivo` de la query: `primera-vez` → título «Sin conexión» y «Esta pantalla aún no se ha
  abierto con conexión en este dispositivo. Conéctate una vez para poder verla sin conexión.»;
  `seccion` (por defecto) → «Esta sección necesita conexión» y «El repaso, el calendario y los
  ajustes solo funcionan con conexión. Hoy, Tareas y Diario sí funcionan sin conexión.»; botones
  [Reintentar] (recarga) e [Ir a Hoy] (`/today`) de al menos 44×44 px
- [ ] T023 [P] [US1] Añadir `avanzarDia` a `saas/src/lib/offline/overlay.ts` (PURO) — hace pasar
  T018
- [ ] T024 [US1] En `saas/src/components/offline-provider.tsx`, enviar `{ t: 'calentar' }` al SW una
  vez por sesión con conexión (marca en `sessionStorage`) cuando el SW esté activo
- [ ] T025 [P] [US1] Crear `saas/src/components/offline-banner.tsx` (cliente): franja compacta fija
  bajo la cabecera con `role="status"` y `aria-live="polite"`, que no tapa la barra inferior; textos
  exactos: «Sin conexión», «Sin conexión · 1 cambio pendiente», «Sin conexión · N cambios
  pendientes», «Sincronizando…» (discreto) y nada con conexión y sin pendientes (el estado en pausa
  por sesión se añade en US6)
- [ ] T026 [P] [US1] Crear `saas/src/components/needs-connection.tsx` (cliente): envoltorio que, sin
  conexión, muestra su hijo con `aria-disabled="true"`, sin navegar ni ejecutar, y el texto
  «Necesita conexión» al lado o debajo (texto configurable para «El repaso necesita conexión»)
- [ ] T027 [US1] Montar `OfflineBanner` en `saas/src/app/(app)/layout.tsx` y envolver el botón de
  Ajustes de la cabecera con `NeedsConnection` (depende de T016, T025, T026)
- [ ] T028 [US1] Crear `saas/src/app/(app)/today/today-view.tsx` (cliente): recibe `datos` (`{ today,
  timezone, habits: { id, name, description, position, done, streakBefore }[], archived: [],
  reviewDue, reviewCompleted }`) y `generadoEn`; usa `useCopia('hoy', …)`; pinta la cabecera de
  progreso, `HabitChecklist` y `HabitManager` que antes pintaba la página; recalcula
  `todayIn(timezone, new Date())` de `saas/src/lib/dates.ts` al volver a la app y cada minuto y
  aplica `avanzarDia` si cambió el día (research D11); el enlace «Hacer el repaso ahora» y la tarjeta
  «Es hora del repaso» van dentro de `NeedsConnection`
- [ ] T029 [US1] Cambiar `saas/src/app/(app)/today/page.tsx` para que siga siendo Server Component,
  calcule `generadoEn = new Date().toISOString()` y pase los datos a `TodayView` en lugar de pintar
  la cabecera y la lista (depende de T028)
- [ ] T030 [P] [US1] Crear `saas/src/app/(app)/tasks/tasks-view.tsx` (cliente): recibe `datos`
  (`{ today, nowTime, pending: Task[], done: Task[] }`) y `generadoEn`, usa `useCopia('tareas', …)` y
  pinta `TaskForm` y las listas de pendientes y hechas que antes pintaba la página
- [ ] T031 [US1] Cambiar `saas/src/app/(app)/tasks/page.tsx` para pasar los datos y `generadoEn` a
  `TasksView` (depende de T030)
- [ ] T032 [US1] En `saas/src/app/(app)/notes/current-week.tsx` y `saas/src/app/(app)/notes/page.tsx`,
  guardar y leer la copia `diario` (`{ today, monday, timezone, notes: { day, body, updated_at }[] }`)
  con `useCopia`, y si el día calculado con `todayIn(timezone, new Date())` cae en otra semana,
  mostrar la semana nueva con los días vacíos y permitir escribir en hoy (research D11)
- [ ] T033 [P] [US1] En `saas/src/components/bottom-nav.tsx`, envolver la pestaña Calendario con
  `NeedsConnection`
- [ ] T034 [P] [US1] En `saas/src/app/(app)/review/review-flow.tsx`, desactivar los botones de
  respuesta sin conexión con `NeedsConnection` y el texto «El repaso necesita conexión»
- [ ] T035 [P] [US1] En `saas/src/app/(app)/settings/export-backup.tsx`, `import-backup.tsx`,
  `profile-form.tsx`, `push-settings.tsx` y `delete-account.tsx`, desactivar con `NeedsConnection`
  «Exportar copia de seguridad», «Elegir archivo», guardar perfil, los avisos y borrar cuenta cuando
  se pierde la conexión con la página abierta
- [ ] T036 [US1] Validar a mano quickstart §3.1-3.4 (incluida la premisa de research D8: una petición
  RSC fallida hace navegación completa) y §4 A-B; si la premisa no se cumple, hacer que
  `saas/src/components/bottom-nav.tsx` use `location.assign(href)` sin conexión

**Punto de control**: la app arranca y se consulta sin conexión. MVP de solo lectura.

---

## Fase 4: Historia 2 - Marcar hábitos y gestionar tareas sin conexión (P1)

**Objetivo**: marcar y desmarcar hábitos de hoy, y crear, editar, completar, descompletar y borrar
tareas sin conexión, con el cambio visible al instante, guardado en la cola y enviado solo, en
orden y una sola vez.

**Prueba independiente**: modo avión: marcar dos hábitos, crear una tarea, completarla y editar
otra; cerrar la app; reconectar y abrirla: todo aparece una sola vez en otro dispositivo
(quickstart §4 C-F).

### Pruebas de la historia 2

- [ ] T037 [P] [US2] Añadir a `saas/tests/db.test.ts`: alta de tarea con `id` explícito; el mismo
  `id` dos veces deja una sola fila y la segunda devuelve `created: false`; otro usuario con ese `id`
  recibe `23505` y no ve la fila; `tasks_limit` (10 000) sigue limitando; borrar dos veces la misma
  tarea no da error; marcar un hábito inexistente da `23503`
- [ ] T038 [P] [US2] Añadir a `saas/tests/offline-overlay.test.ts` pruebas de
  `aplicarPendientesHoy` para `habit.log` (marcar, desmarcar, varias veces = el último) y de
  `aplicarPendientesTareas` (crear, editar parcial, completar y descompletar moviendo entre
  `pending` y `done`, borrar, crear y luego editar/completar/borrar)

### Implementación de la historia 2

- [ ] T039 [P] [US2] En `saas/src/features/tasks/queries.ts`, hacer `createTask` idempotente según
  research D2 (si llega `id`: `select` por `id` → si existe devolver `{ task, created: false }`; si no,
  `insert` con ese `id` → `{ task, created: true }`; si el `insert` da `23505`, volver a buscar y si
  sigue sin verse lanzar `conflict` «Ya existe.») y quitar `.single()` de `deleteTask` para que un
  borrado repetido no falle — hace pasar T037
- [ ] T040 [US2] En `saas/src/app/api/v1/tasks/route.ts`, responder `201` si `created` y `200` si ya
  existía, con `{ data }`; en `saas/src/app/api/v1/tasks/[id]/route.ts`, que el `DELETE` repetido
  responda `204` (depende de T039)
- [ ] T041 [US2] En `saas/src/features/tasks/actions.ts`, aceptar `id` en el alta y adaptar las
  acciones al nuevo retorno `{ task, created }` (depende de T039)
- [ ] T042 [US2] Añadir `aplicarPendientesHoy` (solo `habit.log` en esta historia) y
  `aplicarPendientesTareas` a `saas/src/lib/offline/overlay.ts` — hace pasar T038
- [ ] T043 [US2] Aplicar los pendientes de la cola del contexto encima de los datos en
  `saas/src/app/(app)/today/today-view.tsx` y `saas/src/app/(app)/tasks/tasks-view.tsx` (depende de
  T042)
- [ ] T044 [P] [US2] En `saas/src/components/habit-checklist.tsx`, marcar y desmarcar a través de
  `escribir()` de `saas/src/lib/offline/client.ts` con `op = { tipo: 'habit.log', entityId, datos:
  { day, done }, etiqueta: name }`, guardando el `day` del momento del toque (research D11)
- [ ] T045 [P] [US2] En `saas/src/components/task-form.tsx`, generar el `id` con
  `crypto.randomUUID()` (respaldo `randomId()` de `saas/src/features/notes/pending-store.ts`) y crear
  a través de `escribir()` con `task.create`; validar con `taskCreate` antes (título 1-80, nota hasta
  200, la hora necesita una fecha)
- [ ] T046 [US2] En `saas/src/components/task-item.tsx`, añadir el botón «Editar» con edición en
  línea (título, nota, fecha y hora; [Guardar] [Cancelar]; mismos límites que `TaskForm`: 80 y 200
  caracteres, la hora necesita una fecha), enviar solo `camposCambiadosTarea()` como `task.update`, y
  pasar completar, descompletar (`task.update { done }`) y borrar (`task.delete`) por `escribir()`
  (depende de T009, T014)
- [ ] T047 [US2] Validar a mano quickstart §2 (con `/api/v1/tasks`), §3.5-3.7 y §4 C-F. Además,
  comprobar qué error lanza realmente una Server Action sin red: con DevTools › Network › Offline,
  invocarla directamente (sin pasar por `escribir()`, p. ej. desde la consola o un componente de
  prueba temporal), anotar el error observado en `specs/005-sin-conexion/research.md` (D1) y, si no
  es un `TypeError`, ajustar la detección de fallo de red en `saas/src/lib/offline/client.ts`

**Punto de control**: el uso diario principal (marcar y tareas) funciona sin conexión.

---

## Fase 5: Historia 3 - Escribir el diario sin conexión (P1)

**Objetivo**: el diario arranca sin conexión y sus días con texto sin guardar cuentan en el aviso
común.

**Prueba independiente**: modo avión, abrir desde el icono, escribir en hoy, cerrar; reabrir con
conexión: el texto se guarda y se ve en otro dispositivo (quickstart §4 G-H).

### Pruebas de la historia 3

- [ ] T048 [P] [US3] Añadir a `saas/tests/pending-store.test.ts` pruebas de que el almacén emite un
  evento al cambiar y de `contarPendientes(userId)` (un pendiente por día con texto sin guardar), sin
  cambiar el formato de `habitos:notas-pendientes:<userId>`

### Implementación de la historia 3

- [ ] T049 [US3] En `saas/src/features/notes/pending-store.ts`, emitir un evento
  (`habitos:notas-pendientes-cambio`) en cada escritura o borrado y exportar
  `contarPendientes(userId)`, sin cambiar el formato guardado — hace pasar T048
- [ ] T050 [US3] En `saas/src/components/offline-provider.tsx`, sumar `contarPendientes(userId)` a
  `pendientes` y actualizarlo con el evento de T049 y con `storage` (otras pestañas) (depende de T049)
- [ ] T051 [US3] Comprobar en `saas/src/app/(app)/notes/current-week.tsx` y
  `saas/src/app/(app)/notes/use-note-saver.ts` que, arrancando sin conexión desde la copia, se
  conservan el guardado síncrono por pulsación, el `keepalive` y la fusión de la 002, y que los fallos
  de red llaman a `notificarFalloDeRed()`
- [ ] T052 [US3] Validar a mano quickstart §4 G-H

**Punto de control**: las tres historias P1 funcionan; contador común de pendientes completo.

---

## Fase 6: Historia 4 - Organizar hábitos sin conexión (P2)

**Objetivo**: crear, editar (parcial), archivar, recuperar, reordenar y borrar hábitos con y sin
conexión, incluida la sección «Archivados».

**Prueba independiente**: modo avión: crear un hábito, marcarlo, renombrarlo, subirlo al primer
puesto y archivar otro; reconectar: el otro dispositivo lo refleja todo (quickstart §4 I-J).

### Pruebas de la historia 4

- [ ] T053 [P] [US4] Añadir a `saas/tests/db.test.ts`: alta de hábito con `id` explícito; el mismo
  `id` dos veces deja una sola fila; con 100 hábitos, reenviar el alta del nº 100 devuelve la fila
  existente y no `limit_exceeded`; otro usuario con ese `id` recibe `23505` y no ve la fila;
  `habits_limit` (100) sigue limitando altas nuevas; borrar dos veces no da error;
  `listArchivedHabits` solo devuelve los archivados del usuario
- [ ] T054 [P] [US4] Añadir a `saas/tests/offline-overlay.test.ts` pruebas de `aplicarPendientesHoy`
  para `habit.create` (aparece al final, se puede marcar), `habit.update` (nombre, descripción;
  `archived: true` lo pasa a `archived` y `false` lo devuelve con su `position` anterior),
  `habit.delete` y `habit.reorder`

### Implementación de la historia 4

- [ ] T055 [US4] En `saas/src/features/habits/queries.ts`, hacer `createHabit` idempotente con el
  mismo algoritmo que T039 (búsqueda previa para no llegar al disparador `enforce_row_limit`),
  quitar `.single()` de `deleteHabit` y añadir `listArchivedHabits(db)` — hace pasar T053
- [ ] T056 [US4] En `saas/src/app/api/v1/habits/route.ts`, responder `201` o `200` según `created`;
  en `saas/src/app/api/v1/habits/[id]/route.ts`, `DELETE` repetido → `204` (depende de T055)
- [ ] T057 [US4] En `saas/src/features/habits/actions.ts`, aceptar `id` en el alta y `archived` en la
  edición (objeto parcial), y adaptar al retorno `{ habit, created }` (depende de T055)
- [ ] T058 [US4] Ampliar `aplicarPendientesHoy` en `saas/src/lib/offline/overlay.ts` con
  `habit.create`, `habit.update`, `habit.delete` y `habit.reorder` — hace pasar T054
- [ ] T059 [US4] En `saas/src/app/(app)/today/page.tsx`, pasar `archived: { id, name, description }[]`
  de `listArchivedHabits` dentro de `datos` a `TodayView` (depende de T055)
- [ ] T060 [US4] En `saas/src/app/(app)/today/habit-manager.tsx`: alta con `id` del cliente
  (`habit.create`, validando con `habitCreate`), edición parcial con `camposCambiadosHabito()`
  (`habit.update`), botón [Archivar] (`habit.update { archived: true }`), [Eliminar]
  (`habit.delete`), mover arriba o abajo (`habit.reorder { ids }` con el orden completo de los
  activos), y sección plegada `<details>` «Archivados (N)» al final con [Recuperar]
  (`habit.update { archived: false }`) y [Eliminar]; todo por `escribir()` y con zonas táctiles de
  44 px (depende de T014, T058, T059)
- [ ] T061 [US4] Validar a mano quickstart §2 (con `/api/v1/habits`) y §4 I-J

**Punto de control**: todo lo habitual con hábitos funciona sin conexión.

---

## Fase 7: Historia 5 - Conflictos y rechazos explicados (P2)

**Objetivo**: los cambios descartados (borrado en otro dispositivo o rechazo del servidor) se
avisan con un mensaje breve, sin bloquear la cola, y la pantalla vuelve al estado real.

**Prueba independiente**: borrar una tarea en B, editarla sin conexión en A, reconectar A: aviso
breve y el resto se aplica; el contador llega a 0 (quickstart §4 K-M).

### Pruebas de la historia 5

- [ ] T062 [P] [US5] Añadir a `saas/tests/offline-queue.test.ts` pruebas de
  `descartarEnCascada(cola, opRechazada)` (si era `*.create`, devuelve también las operaciones
  posteriores sobre ese `entityId`, y quita el id de los `habit.reorder` pendientes) y de
  `textoAviso(op, resultado, nMas)` con los textos exactos del contrato §4

### Implementación de la historia 5

- [ ] T063 [US5] Añadir `descartarEnCascada` y `textoAviso` a `saas/src/lib/offline/queue.ts`:
  «La tarea “{título}” se borró en otro dispositivo; tu cambio no se ha aplicado.», «El hábito
  “{nombre}” se borró en otro dispositivo; tu cambio no se ha aplicado.», «No se ha guardado
  “{etiqueta}”: {mensaje del servidor}.» con «(y N cambios más sobre él)» si hubo cascada — hace
  pasar T062
- [ ] T064 [US5] En `saas/src/lib/offline/sync.ts`, al descartar aplicar `descartarEnCascada`,
  borrar todas esas operaciones, emitir un único aviso con `textoAviso` y seguir con la siguiente
  operación; difundir los avisos por `BroadcastChannel('habitos-cola')` para que se vean en todas las
  pestañas (depende de T063)
- [ ] T065 [US5] En `saas/src/components/offline-provider.tsx`, guardar los avisos `{ id, texto }`,
  cerrarlos solos a los 6 s y llamar a `router.refresh()` tras un descarte (FR-024)
- [ ] T066 [US5] En `saas/src/components/offline-banner.tsx`, pintar los avisos apilados encima de la
  barra inferior con `role="alert"`, cerrables al tocarlos y con botón de cerrar de 44×44 px
- [ ] T067 [US5] Validar a mano quickstart §4 K-M

**Punto de control**: ningún cambio rechazado bloquea la cola; el usuario sabe qué se descartó.

---

## Fase 8: Historia 6 - Los cambios pendientes son de mi cuenta (P2)

**Objetivo**: la cola y las copias van ligadas al `userId`; cerrar sesión avisa de los pendientes,
borra copias y páginas, pero no la cola; otra cuenta nunca ve ni envía lo de la anterior.

**Prueba independiente**: sin conexión, «Cerrar sesión» aparece desactivado con «Necesita
conexión»; con una conexión lenta y cambios sin enviar, cerrar sesión aceptando el aviso; entrar
con otra cuenta: no ve nada; volver con la primera: los cambios se envían (quickstart §4 N-P).

### Implementación de la historia 6

- [ ] T068 [US6] En `saas/src/components/sign-out-button.tsx`: sin conexión, mostrar el botón
  desactivado con `NeedsConnection` y el texto «Necesita conexión» (tocarlo no hace nada; FR-027);
  con conexión, si `pendientes > 0` mostrar un `<dialog>` modal accesible: «**¿Cerrar sesión?** Tienes N cambios sin enviar. Se enviarán cuando
  vuelvas a entrar con esta cuenta en este dispositivo.» con [Cancelar] [Cerrar sesión] (singular
  «1 cambio»); al confirmar (o sin pendientes): dar de baja los avisos como en la 004, `borrarCopias
  (userId)`, enviar `{ t: 'olvidar-paginas' }` al SW y ejecutar `signOutAction()`; **no** borrar la
  cola (FR-028)
- [ ] T069 [P] [US6] En `saas/src/app/(auth)/login/login-form.tsx`, enviar `{ t: 'olvidar-paginas' }`
  al SW activo al montarse (FR-029)
- [ ] T070 [US6] En `saas/src/components/offline-banner.tsx`, añadir el estado en pausa por sesión:
  «Inicia sesión para enviar N cambios» con el enlace [Entrar] a `/login`; en
  `saas/src/lib/offline/sync.ts`, salir de la pausa en el siguiente disparador con sesión
- [ ] T071 [US6] Revisar `saas/src/lib/offline/sync.ts`, `idb.ts` y `offline-provider.tsx` para
  confirmar que solo se leen, envían y muestran operaciones y copias con el `userId` de la sesión de
  la página (FR-026)
- [ ] T072 [US6] Validar a mano quickstart §4 N-P

**Punto de control**: todas las historias funcionan por separado.

---

## Fase 9: Acabado y aspectos transversales

- [ ] T073 [P] Comprobar con una búsqueda que `/api/v1` solo se llama desde
  `saas/src/lib/offline/sync.ts` y el `keepalive` del diario en `saas/src/app/(app)/notes/` (plan,
  revisión tras la fase 1)
- [ ] T074 [P] Comprobar el aviso de almacenamiento lleno (research D14) forzando un fallo de
  `anadirCambio` en `saas/src/lib/offline/client.ts` desde DevTools: se deshace el cambio y se ve el
  aviso
- [ ] T075 [P] Revisar a 360 y 430 px, en claro y oscuro, el aviso, los avisos de descarte, el
  diálogo de cerrar sesión, la edición de tareas, «Archivados» y `saas/public/sin-conexion.html`
  (FR-030)
- [ ] T076 Comprobar a mano que exportar e importar no cambian de formato (FR-031): con la misma
  cuenta, exportar la copia de seguridad desde Ajustes en `master` y en la rama `005-sin-conexion`
  (`saas/src/app/(app)/settings/export-backup.tsx`), comparar los dos archivos (solo pueden
  diferir la fecha de exportación y los datos cambiados entre medias) e importar la copia de la
  rama con «Elegir archivo» (`saas/src/app/(app)/settings/import-backup.tsx`) sin errores
- [ ] T077 Ejecutar la CI completa en `saas/` (`npm run lint && npm run typecheck && npm test && npm run build`)
- [ ] T078 Validar en la vista previa de Vercel quickstart §4 Q-S (cambio de día, 20 repeticiones en
  iPhone para SC-002, 50 cambios en menos de 30 s para SC-003), SC-001 (arranque en menos de 3 s) y
  SC-004: con DevTools › Performance, sin conexión, grabar marcar un hábito y completar, crear,
  editar y borrar una tarea, y comprobar que cada acción se pinta en menos de 100 ms desde el toque
  (`specs/005-sin-conexion/quickstart.md`)
- [ ] T079 Marcar el estado de `specs/005-sin-conexion/spec.md` como implementado y anotar en
  `specs/005-sin-conexion/plan.md` el resultado de la premisa RSC de research D8

---

## Dependencias y orden de ejecución

### Dependencias entre fases

- **Preparación (fase 1)**: sin dependencias.
- **Base (fase 2)**: depende de la fase 1. Bloquea todas las historias.
- **US1 (fase 3)**: depende de la base. Aporta `TodayView`, `TasksView`, `overlay.ts`, el SW y el
  aviso, que las demás historias amplían.
- **US2 (fase 4)** y **US4 (fase 6)**: dependen de la base y de US1 (amplían `TodayView`,
  `TasksView` y `overlay.ts`). Entre sí son independientes salvo que ambas tocan `overlay.ts` y
  `offline-overlay.test.ts` (hacer en serie esas tareas).
- **US3 (fase 5)**: depende de la base y de T032 (copia del diario). Independiente de US2 y US4.
- **US5 (fase 7)**: depende de la base; se prueba mejor con US2 o US4 hechas (necesita cambios que
  rechazar).
- **US6 (fase 8)**: depende de la base y de T021 (mensaje `olvidar-paginas`) y T025 (aviso).
- **Acabado (fase 9)**: depende de todas las historias que se quieran entregar.

### Dentro de cada historia

- Pruebas primero (deben fallar) → funciones puras → servidor → componentes → validación a mano.
- Las tareas sobre el mismo archivo van en serie aunque sean de historias distintas
  (`overlay.ts`, `offline-provider.tsx`, `offline-banner.tsx`, `sw.js`, `queue.ts`, `sync.ts`).

### Oportunidades en paralelo

- Base: T003-T006 (pruebas) en paralelo; T007-T012 en paralelo; T013 → T014 → T015 → T016 en serie.
- US1: T019 (SW), T022 (HTML), T023 (overlay), T025 (aviso), T026, T030, T033, T034 y T035 en
  paralelo; T020 y T021 siguen a T019.
- US2: T037 y T038 en paralelo; T039 en paralelo con T042; T044 y T045 en paralelo.
- US3 y US4 pueden avanzar a la vez por personas distintas tras US1.

---

## Ejemplo en paralelo: base

```text
Tarea: "T004 Pruebas de compactar(), aPeticion() y clasificar() en saas/tests/offline-queue.test.ts"
Tarea: "T005 Pruebas de PATCH parcial en saas/tests/offline-diff.test.ts"
Tarea: "T011 Envoltorio IndexedDB en saas/src/lib/offline/idb.ts"
Tarea: "T012 Estado de conexión en saas/src/lib/offline/connectivity.ts"
```

## Ejemplo en paralelo: historia 1

```text
Tarea: "T019 Cachés versionadas en saas/public/sw.js"
Tarea: "T022 Página de respaldo saas/public/sin-conexion.html"
Tarea: "T025 Aviso de estado en saas/src/components/offline-banner.tsx"
Tarea: "T030 TasksView en saas/src/app/(app)/tasks/tasks-view.tsx"
```

## Ejemplo en paralelo: historia 2

```text
Tarea: "T037 Pruebas de BD de tareas idempotentes en saas/tests/db.test.ts"
Tarea: "T038 Pruebas de capa encima de logs y tareas en saas/tests/offline-overlay.test.ts"
Tarea: "T044 Marcar por escribir() en saas/src/components/habit-checklist.tsx"
Tarea: "T045 Alta con id del cliente en saas/src/components/task-form.tsx"
```

---

## Estrategia de implementación

### Primero el MVP (solo historia 1)

1. Fases 1 y 2 (preparación y base).
2. Fase 3 (US1): la app arranca y se consulta sin conexión.
3. **Parar y validar** con quickstart §3.1-3.4 y §4 A-B, incluida la premisa RSC de D8.
4. Desplegar en la vista previa.

### Entrega incremental

1. Base + US1 → consulta sin conexión (MVP).
2. + US2 → marcar y tareas sin conexión (el uso diario principal).
3. + US3 → diario integrado en el contador. Con esto quedan las tres P1.
4. + US4 → organizar hábitos y «Archivados».
5. + US5 → avisos de conflictos y rechazos.
6. + US6 → cuentas en dispositivos compartidos.
7. Fase 9 y PR a `master`.

Cada paso deja la CI en verde y no rompe lo anterior.

---

## Notas

- [P] = archivos distintos y sin dependencias pendientes.
- La etiqueta de historia permite rastrear cada tarea hasta la spec.
- Hacer commit tras cada tarea o grupo lógico; parar en cada punto de control para validar.
- La cola **nunca** se borra al cerrar sesión; las copias y la caché de páginas sí.
- `408` y `429` son temporales: se reintentan, nunca se descartan (research D6).
