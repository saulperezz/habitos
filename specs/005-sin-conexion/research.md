# Investigación: Usar la app sin conexión

**Funcionalidad**: `005-sin-conexion` | **Fecha**: 2026-11-25 | **Plan**: [plan.md](plan.md)

Cada decisión sigue el formato Decisión / Motivo / Alternativas descartadas. Las rutas son relativas
a `saas/` salvo que se indique otra cosa.

---

## D0. Punto de partida del código

**Decisión**: la 005 se construye sobre `origin/master` (`77ef9ae`), que ya incluye la 004 (avisos
push: `public/sw.js`, `components/push-sync.tsx`, `components/sign-out-button.tsx`,
`lib/push-client.ts`). Antes de la primera tarea de código hay que traer `origin/master` a la rama
`005-sin-conexion`, que hoy parte de `8509f2a` (anterior a la 004).

**Motivo**: el plan amplía `public/sw.js` y el botón de cerrar sesión de la 004; sin ellos la rama
no compila contra lo que describe este plan.

**Constitución**: el plan se comprueba contra la v3.1.0. Esa versión solo existe por ahora en la
rama local `004-avisos-repaso`, aún sin fusionar; `master` sigue en la 3.0.1. La diferencia entre
ambas está solo en el principio II (excepción de la service role en Edge Functions programadas), que
la 005 no usa. Por eso la comprobación da el mismo resultado con cualquiera de las dos.

---

## D1. Dos caminos de escritura: Server Actions con conexión y `/api/v1` para la cola

**Decisión**:

- Con conexión y con la cola vacía, la interfaz escribe con las Server Actions de siempre.
- El cambio va a la cola en IndexedDB en cualquiera de estos casos:
  - no hay conexión;
  - la cola tiene cambios;
  - la Server Action falla por red (`TypeError` al llamarla).
- La cola se envía con `fetch` a `/api/v1`.

**Motivo**:

- Una Server Action es una llamada RPC ligada a la página y a su compilación. No se puede guardar,
  ni reenviar tras cerrar la app, ni enviar desde otra pestaña o versión del código.
- `/api/v1` es un contrato HTTP estable. Además ya tiene autenticación por cookie, errores JSON con
  `code` y rate limit.
- La 002 ya hace lo mismo: el diario envía con `fetch(..., { keepalive: true })` a
  `PUT /api/v1/notes/:day` al ocultar la app.
- Si un cambio entra en la cola, todo lo que venga después también debe pasar por la cola: así se
  respeta el orden (FR-016). Si no, una edición con conexión podría llegar antes que la creación
  pendiente del mismo elemento.

**Alternativas descartadas**:

- **Todo por `/api/v1`, también con conexión.** Contradice el principio I («la interfaz DEBE
  escribir mediante Server Actions») sin necesidad y obliga a reescribir el `revalidatePath` de
  todas las acciones.
- **Reintentar Server Actions desde memoria.** No sobrevive al cierre de la app (FR-012).
- **Enmendar la constitución.** El usuario pidió justificarlo en «Seguimiento de complejidad».

---

## D2. Altas idempotentes con id generado en el cliente

**Decisión**:

- `habitCreate` y `taskCreate` aceptan un `id` opcional (`uuidParam`).
- El cliente lo genera con `crypto.randomUUID()`, con el respaldo de `randomId()` de
  `pending-store.ts`.
- `createHabit` y `createTask` siguen estos pasos:
  1. Si llega `id`, buscan `select * from <tabla> where id = :id`, una búsqueda que RLS ya limita
     al usuario. Si la fila existe, la devuelven con `created: false`.
  2. Si no existe, hacen un `insert` normal con ese `id` y devuelven `created: true`.
  3. Si el `insert` falla con `23505` (otra petición lo creó entre medias), vuelven a buscar. Si
     ahora aparece, devuelven `created: false`. Si sigue sin verse, el id es de otro usuario y
     responden `409 conflict`.
- `POST /api/v1/habits` y `POST /api/v1/tasks` responden `201` si se creó y `200` si ya existía. El
  manejador devuelve un `NextResponse` propio, que `route()` ya acepta.

**Motivo**:

- La búsqueda previa evita un fallo de `insert … on conflict do nothing` (`upsert` con
  `ignoreDuplicates`): el disparador `BEFORE INSERT enforce_row_limit` se ejecuta *antes* de comprobar
  el conflicto. Con 100 hábitos, reenviar el alta del hábito nº 100 (cuya respuesta se perdió) daría
  `limit_exceeded` aunque el hábito exista, y el cliente lo descartaría con un aviso falso.
- La búsqueda previa no llega al disparador.
- Las carreras entre pestañas se evitan con el bloqueo de D6.
- Entre dispositivos no hay carreras: cada id lo genera un solo dispositivo.

**RLS y el disparador** (se comprueban en `tests/db.test.ts`):

- `id` es `uuid primary key default gen_random_uuid()`, así que un `insert` con `id` explícito ya
  está permitido.
- La política `with check (user_id = auth.uid())` sigue en vigor, porque `user_id` toma su valor
  por defecto.
- Si otro usuario usa un `id` ya existente, el `insert` falla con `23505` y no ve la fila ajena.
- `enforce_row_limit` sigue limitando a 100 hábitos y 10 000 tareas.

**No hace falta migración.**

**Alternativas descartadas**:

- **Función SQL `create_habit(p_id, …)`.** Es atómica, pero exige una migración y duplica en SQL la
  lógica de `position`.
- **Clave de idempotencia aparte (tabla `applied_ops`).** Es más general, pero añade una tabla,
  limpieza y una migración sin necesidad: las demás operaciones ya son idempotentes por naturaleza
  (D3).

---

## D3. Idempotencia del resto de operaciones

| Operación | Petición | ¿Idempotente? | Si el elemento no existe |
|---|---|---|---|
| Crear hábito o tarea | `POST` con `id` | Sí (D2) | — |
| Editar hábito o tarea | `PATCH` parcial | Sí (mismos valores) | `404` → se descarta y se avisa |
| Borrar hábito o tarea | `DELETE` | Sí (cambio) | `204`: éxito |
| Marcar hábito | `PUT …/logs/:day` | Sí (`upsert … ignoreDuplicates`) | `404` (FK `23503`) → se descarta y se avisa |
| Desmarcar hábito | `DELETE …/logs/:day` | Sí | `204` (no borra nada; no hace falta aviso) |
| Reordenar | `PUT /habits/reorder` | Sí (posiciones absolutas) | Los id inexistentes se ignoran |
| Nota del diario | `PUT /notes/:day` | Sí (`save_note` con `deviceId`, 002) | — |

**Cambio en los borrados**: `deleteHabit` y `deleteTask` dejan de usar `.single()`, que convierte
«0 filas» en `PGRST116`, es decir, en un 404. Ahora borran sin exigir fila. Un borrado repetido
responde `204`, tanto por la API como por la Server Action.

**Motivo**: con todas las operaciones idempotentes, enviar «al menos una vez» con reintentos da
«exactamente una vez» en el resultado (FR-017) sin tablas de control.

---

## D4. PATCH parcial («gana el último cambio», campo a campo)

**Decisión**:

- Cada edición guarda en la cola solo los campos que el usuario cambió. Se calculan comparando el
  formulario con los valores que tenía el elemento al abrir la edición.
- La fecha y la hora de una tarea viajan juntas: si cambia una, se envían `dueDate` y `dueTime`.
  Así se respeta la regla «la hora necesita una fecha», que el servidor también comprueba en SQL.
- `habitUpdate` y `taskUpdate` ya son parciales, y `supabase-js` omite las claves `undefined`. **El
  servidor no cambia.**
- Las Server Actions de edición reciben el mismo objeto parcial.
- La spec se ajustó en sus Supuestos: gana el último cambio *por campo* (decisión del usuario en
  `/speckit-plan`).

**Motivo**: enviar el objeto entero desharía los cambios que otro dispositivo hizo en otros campos.

**Alternativa descartada**: versión o `updated_at` por elemento con rechazo de conflictos. La spec
excluye elegir manualmente qué versión conservar.

---

## D5. Almacenamiento en el dispositivo: IndexedDB nativa (y el diario se queda como está)

**Decisión**:

- Una base IndexedDB `habitos-sin-conexion` (versión 1) con dos almacenes:
  - `cambios`: la cola de cambios, con clave autoincremental `seq` e índice `userId`.
  - `copias`: la última respuesta del servidor por vista, con clave `[userId, vista]`.
- Un envoltorio propio de unas 60 líneas (`lib/offline/idb.ts`) convierte `IDBRequest` y las
  transacciones en promesas. **Sin dependencias nuevas.**
- El diario sigue guardando sus borradores en `localStorage` (`features/notes/pending-store.ts`).
  Solo se integra en tres puntos:
  - el contador de pendientes suma los días con texto sin guardar;
  - `pending-store` emite un evento al cambiar, para que el contador se actualice;
  - el aviso de cerrar sesión los cuenta.

**Motivo**:

- La cola necesita transacciones (compactar y escribir de forma atómica), un orden estable y poder
  guardar más de lo que cabe en `localStorage`. IndexedDB lo da en todos los navegadores objetivo,
  incluido Safari iOS como app de pantalla de inicio.
- El diario guarda en *cada pulsación*. La escritura síncrona de `localStorage` es lo que garantiza
  que no se pierde nada si la app se cierra de golpe (FR-009 a FR-013 de la 002, ya probado). Pasarlo
  a IndexedDB, que es asíncrono, abriría una ventana de pérdida y obligaría a rehacer pruebas de la
  002 sin beneficio para la spec. Además, la 002 ya cumple «una cola por cuenta» y «no se borra al
  cerrar sesión».
- Se llama a `navigator.storage.persist()` (sin pedir nada al usuario) para reducir el riesgo de que
  el navegador desaloje los datos.

**Alternativas descartadas**:

- **`idb`** (unos 1,2 kB): solo ahorra el envoltorio de promesas. No justifica una dependencia.
- **`localStorage` para la cola**: no tiene transacciones, el límite ronda los 5 MB y una cola de una
  semana podría acercarse a él.
- **Unificar el diario en la cola**: ver el motivo.
- **`fake-indexeddb` para las pruebas**: la lógica que hay que probar (compactación, orden, PATCH
  parcial, capa encima) va en funciones puras sin IndexedDB (D12).

---

## D6. La cola: operaciones, compactación y envío

**Operaciones** (detalle en [data-model.md](data-model.md)): `habit.create`, `habit.update`,
`habit.delete`, `habit.log`, `habit.reorder`, `task.create`, `task.update` y `task.delete`. Cada
operación lleva `userId`, `seq`, `entityId`, `etiqueta` (el nombre del elemento, para los avisos),
`creadaEn` y `enviando`.

**Compactación** (función pura `compactar(cola, nueva)`). Se aplica al añadir cada operación, dentro
de la misma transacción `readwrite`. Nunca toca una operación con `enviando: true`, porque puede que
el servidor ya la haya aplicado.

1. **Crear y después borrar = nada.** Si llega `*.delete` de un elemento cuya `*.create` sigue en la
   cola sin enviar, se quitan la creación y todas las operaciones posteriores sobre ese elemento
   (ediciones y marcados). El borrado no se añade. El id también se quita de los reordenamientos
   pendientes.
2. **Borrar descarta lo anterior.** Si llega `*.delete` de un elemento que ya existe en el servidor,
   se quitan sus ediciones y marcados pendientes sin enviar, y se añade el borrado.
3. **Ediciones seguidas = una.** Si llega `*.update` y la última operación pendiente de ese mismo
   elemento es otra `*.update` sin enviar (sin borrado ni creación entre medias), se combinan sus
   campos (la nueva gana campo a campo) y la operación conserva su `seq`.
4. **Edición sobre una creación pendiente.** Si la última operación de ese elemento es su `*.create`
   sin enviar, los campos se fusionan en la creación. Para una tarea, `done` no forma parte del alta,
   así que esa edición se añade aparte.
5. **Marcar varias veces = la última.** Para `habit.log` con el mismo `(habitId, day)`, se queda la
   última, en la posición de la anterior si esta seguía sin enviar.
6. **Reordenar varias veces = el último.** Se quitan los `habit.reorder` anteriores sin enviar y se
   añade el nuevo al final, porque contiene el orden completo.

Ninguna de estas reglas cambia el orden relativo entre elementos distintos. Las reglas 3 a 5 solo
mueven operaciones del *mismo* elemento, y las demás solo eliminan.

**Envío** (`lib/offline/sync.ts`):

- **Cuándo se envía**:
  - al montar el proveedor (abrir la app);
  - con el evento `online`;
  - con `visibilitychange` cuando la app vuelve a estar visible;
  - justo después de añadir un cambio si hay conexión;
  - con el temporizador de reintento.
- **No hay Background Sync**, porque iOS no lo tiene.
- **Bloqueo entre pestañas**: `navigator.locks.request('habitos-cola:' + userId, { ifAvailable: true })`.
  Si otra pestaña tiene el bloqueo, esta no envía nada y se entera del resultado por
  `BroadcastChannel('habitos-cola')`. Sin Web Locks (Safari anterior a 15.4), el respaldo es un
  bloqueo en memoria por pestaña. Basta porque una app de pantalla de inicio en iOS tiene una sola
  ventana.
- **En serie**, en orden de `seq`:
  1. Se marca `enviando: true` en IndexedDB.
  2. Se hace `fetch` con `credentials: 'same-origin'` y `AbortSignal.timeout(15 s)`.
  3. Se clasifica la respuesta (tabla siguiente).

| Resultado | Acción |
|---|---|
| `2xx` | Se borra la operación |
| `404` en `update`, `log` o `delete` | Se descarta. Aviso: «“X” se borró en otro dispositivo; tu cambio no se ha aplicado» |
| `400`, `409`, `413` o `422` | Se descarta y se avisa con el `message` del servidor. Si era un `*.create`, también se descartan las operaciones posteriores sobre ese elemento, con un único aviso (FR-022) |
| `401` | Se para la cola: «Inicia sesión para enviar N cambios». Se reanuda en el siguiente disparador con sesión |
| `408`, `429`, `5xx`, error de red o tiempo agotado | No se descarta. Se reintenta con espera creciente: 2 s, 4 s, 8 s… hasta 60 s, con ±20 % de azar. Si hay `Retry-After`, se respeta |

**Corrección sobre el punto 4 del usuario** («4xx distintos de 401: descartar»): `408` y `429` son
temporales. `route()` ya responde `429` al superar 120 peticiones por minuto, y una cola de una
semana puede llegar a ese límite. Descartarlos perdería datos (FR-023), así que se reintentan.

- **Al vaciar la cola**: `router.refresh()` para mostrar los datos del servidor (FR-019) y renovar
  las copias locales (D7).
- **Rendimiento**: 50 cambios a unos 150-300 ms cada uno caben de sobra en los 30 s de SC-003, y
  quedan por debajo del rate limit.

---

## D7. Datos sin conexión: ¿HTML o RSC en caché, o una capa de datos en el cliente?

La pregunta del usuario: ¿basta con guardar en caché del service worker el HTML o el RSC de Hoy,
Tareas y Diario, o hace falta una capa de datos en el cliente?

**Evaluación**:

| Opción | Arranque sin conexión | Datos al día (FR-001) | Pendientes encima (FR-002) | Coste |
|---|---|---|---|---|
| A. Solo el HTML del documento en caché | Sí | **No**: el HTML se guarda al cargar el documento. Lo que se marca después con Server Actions solo actualiza el RSC en memoria, así que al reabrir sin conexión se vería el día sin marcar | **No**: el HTML es estático | Bajo |
| B. HTML más el RSC de cada navegación en caché | Sí | Parcial: las respuestas RSC dependen de cabeceras internas de Next (`Next-Router-State-Tree`, prefetch) y su formato no es público | No | Medio y frágil entre versiones de Next |
| C. Capa de datos completa en el cliente (las páginas leen de IndexedDB o de `/api/v1`) | Sí | Sí | Sí | Alto: reescribir Hoy, Tareas y Diario como componentes cliente que piden datos |
| **D. Mixta**: el HTML en caché da el arranque; cada vista guarda en IndexedDB los *props* que recibe del servidor; la interfaz muestra lo más reciente con los pendientes encima | Sí | Sí: los *props* llegan en cada render, también tras `router.refresh()` | Sí | Medio: las páginas siguen siendo Server Components que pasan los datos a un componente cliente |

**Decisión**: opción D.

- **El service worker** guarda el documento HTML de `/today`, `/tasks` y `/notes` con la estrategia
  «red primero» (D8). Solo sirve para arrancar la app: trae el JS, el `userId`, la zona horaria y
  unos *props* que pueden estar desfasados.
- **Cada vista sin conexión** tiene un componente cliente: `TodayView`, `TasksView` y `CurrentWeek`,
  este último ya existente.
  - Recibe del servidor `datos` más `generadoEn` (la hora del servidor).
  - Con conexión, guarda `{ datos, generadoEn }` en `copias` con la clave `[userId, vista]`.
  - Muestra la versión más reciente entre los *props* y la copia guardada, según `generadoEn`.
  - Encima aplica los cambios pendientes con funciones puras (`aplicarPendientes*`, en
    `lib/offline/overlay.ts`).
- **Hoy deja de pintar en el servidor** la cabecera de progreso y la lista: pasan a `TodayView`,
  porque dependen de los pendientes. Lo mismo ocurre con la lista de Tareas en `TasksView`.
- **Las consultas no cambian**, salvo `listArchivedHabits` (D13).

**Motivo**: es la opción más simple que cumple FR-001 y FR-002. A no los cumple. B depende de
detalles internos de Next. C reescribe mucho más.

**Por qué no se usa A con una actualización en segundo plano**: refrescar el documento en caché tras
cada cambio costaría una petición más por acción, y aun así no aplicaría los pendientes.

---

## D8. Service worker (ampliación de `public/sw.js`)

**Decisión**: el archivo sigue siendo JavaScript plano, sin compilación, y conserva sin cambios los
manejadores `push` y `notificationclick` de la 004. Se añaden:

- **Cachés versionadas**: `habitos-estaticos-v1`, `habitos-paginas-v1` y `habitos-respaldo-v1`. En
  `activate` se borran las cachés `habitos-*` que no están en la lista actual. Se mantienen
  `skipWaiting` y `clients.claim`.
- **`install`**: precarga `/sin-conexion.html`, los iconos y `/manifest.webmanifest`.
- **`fetch`** solo para peticiones `GET` del mismo origen:
  - **`/api/*`, `/auth/*`, `/login`**: el SW no las toca (no llama a `respondWith`).
  - **`/_next/static/*`**: primero la caché. Si no está, se pide a la red y se guarda. Son archivos
    con hash, que no cambian.
  - **Navegación** (`request.mode === 'navigate'`):
    - **`/today`, `/tasks` y `/notes`**: red primero con un tiempo límite de 4 s. Si la respuesta es
      `ok`, no viene de una redirección y su ruta coincide, se guarda en `habitos-paginas-v1` con la
      ruta como clave, sin la query. Si falla la red, se sirve la copia en caché. Si no hay copia, se
      sirve `/sin-conexion.html?motivo=primera-vez` (FR-006).
    - **Resto**: `/`, `/review`, `/calendar` y `/settings`. Siempre red. `/` redirige a `/today` y
      sin conexión sirve la copia de `/today`. Si falla la red, se sirve
      `/sin-conexion.html?motivo=seccion` (FR-007).
  - **Peticiones RSC** (cabecera `RSC: 1`) sin conexión: el SW responde `Response.error()` de
    inmediato. El router de Next, al fallar la petición RSC, hace una navegación completa, que el SW
    atiende con el documento en caché. **Hay que comprobarlo en la fase de implementación con
    Next 16.4** (quickstart §3). Si no ocurre así, `BottomNav` hace una navegación completa
    (`location.assign`) cuando no hay conexión.
- **Mensaje `calentar`**: el cliente lo envía una vez por sesión con conexión.
  1. El SW pide `/today`, `/tasks` y `/notes` y los guarda en caché.
  2. Extrae de su HTML las URL `/_next/static/…` con una expresión regular y guarda las que falten.
  3. Borra de `habitos-estaticos-v1` las que ya no aparecen en ninguna de las tres.

  Este paso hace de «precaché»: una página nunca visitada en ese dispositivo también arranca sin
  conexión si se abrió la app con conexión al menos una vez.
- **Mensaje `olvidar-paginas`**: el SW borra `habitos-paginas-v1`. Se envía al cerrar sesión y al
  mostrar `/login` (D10).
- **Registro**: hoy `sw.js` solo se registra al activar los avisos (`getServiceWorker`). Pasa a
  registrarse siempre desde el proveedor sin conexión, con el mismo `register('/sw.js')`, lo que no
  afecta a las suscripciones push existentes.

**Motivo**: un SW escrito a mano, de unas 150 líneas, cubre lo que pide la spec sin compilación. Un
manifiesto de precaché exacto exigiría integrar el build de Next con una dependencia.

**Alternativas descartadas**:

- **Serwist, `next-pwa` o Workbox**: añaden una dependencia y un paso de compilación sobre un SW que
  ya existe y es pequeño.
- **Precaché a partir del manifiesto de build de Next**: no hay un manifiesto estable y público de
  `/_next/static`.

**Cabeceras**: `next.config.ts` ya sirve `/sw.js` sin caché. `/sin-conexion.html` es un archivo
estático de `public/`, en español, con estilos en línea que siguen `prefers-color-scheme` y un botón
«Reintentar» que recarga. No hace falta cambiar la CSP: `connect-src 'self'` cubre `/api/v1`.

---

## D9. Detección de la conexión

**Decisión**:

- Hay que cumplir dos condiciones a la vez para estar «con conexión»:
  - `navigator.onLine` debe valer `true`, y se escuchan los eventos `online` y `offline`;
  - el último intento de red no debe haber fallado.
- Si una petición de la cola o una Server Action falla por red, el estado pasa a «Sin conexión»
  aunque `navigator.onLine` diga lo contrario (wifi sin internet).
- Se sale de ese estado cuando un envío tiene éxito o cuando una sonda `GET /api/health`
  (`cache: 'no-store'`, 5 s) responde. La sonda se repite con la misma espera creciente de D6.

**Motivo**: los Supuestos de la spec piden tratar igual «sin red» y «red sin acceso real».
`navigator.onLine` solo detecta lo primero.

---

## D10. Cuentas y privacidad en el dispositivo

**Decisión**:

- La cola y las copias van ligadas al `userId`. `AppLayout` (servidor) pasa `user.id` al proveedor.
  Sin conexión, el `userId` viene del HTML en caché de esa misma cuenta.
- El envío solo lee las operaciones con el `userId` de la sesión que tiene la página. Si el servidor
  responde `401` (sesión caducada u otra cuenta), se para y no descarta nada (FR-026).
- **Cerrar sesión** (`SignOutButton`). La 004 ya da de baja los avisos del dispositivo; ahora,
  además:
  - Si hay pendientes (cola más días del diario), se muestra un diálogo de confirmación accesible
    (`<dialog>` con botones reales): «Tienes N cambios sin enviar. Se enviarán cuando vuelvas a
    entrar con esta cuenta en este dispositivo.» Opciones: [Cancelar] [Cerrar sesión].
  - Al confirmar, se borran las `copias` de esa cuenta y la caché de páginas (`olvidar-paginas`).
  - **La cola NO se borra** (FR-028; el usuario lo confirmó en `/speckit-plan` frente a su punto 8).
- **`/login`**: al montarse, envía `olvidar-paginas` al SW. Así se cubre una sesión que caduca y
  después entra otra cuenta: el HTML en caché de la cuenta anterior no se sirve nunca a la nueva
  (FR-029).

**Alternativa descartada**: guardar el HTML en caché con una clave por usuario. El SW no sabe de qué
usuario es una respuesta sin añadir una cabecera nueva en el proxy, y borrar la caché al cambiar de
sesión basta.

---

## D11. Cambio de día y zona horaria sin conexión

**Decisión**:

- `TodayView` recibe `timezone` y el `today` del servidor, y calcula en el cliente
  `todayIn(timezone, new Date())`, que viene de `lib/dates.ts` y se comparte. Lo recalcula al volver
  a la app y cada minuto.
- Si el día calculado es posterior al de la copia, muestra los hábitos conocidos sin marcar para el
  nuevo día. La racha se calcula como `rachaAnterior + (hechoAyer ? 1 : 0)` con los datos de la
  copia.
- Cada `habit.log` guarda el `day` del momento en que el usuario lo hizo.
- El diario hace lo mismo: si el día calculado cae en otra semana, se muestra la semana nueva con los
  días vacíos y se puede escribir en hoy.

**Motivo**: constitución IV (día natural en la zona del usuario) y el caso límite «cambio de día sin
conexión» de la spec.

---

## D12. Pruebas

**Decisión**: la lógica de la cola va en módulos puros, sin `window` ni IndexedDB, que se prueban
con Vitest en Node:

| Archivo | Qué prueba |
|---|---|
| `tests/offline-queue.test.ts` | La compactación (cada regla de D6, y que no toca lo que tiene `enviando`), que se conserva el orden, la traducción de operación a petición (método, URL, cuerpo con solo los campos cambiados) y la clasificación de respuestas (2xx, 404, 4xx, 401, 408/429, 5xx, red) |
| `tests/offline-overlay.test.ts` | Los pendientes encima de los datos (crear, editar, borrar, marcar, reordenar, archivar), el cambio de día y la elección entre los *props* y la copia por `generadoEn` |
| `tests/offline-diff.test.ts` | El PATCH parcial: solo los campos cambiados, con fecha y hora juntas |
| `tests/db.test.ts` | El alta con `id` explícito, que el mismo id dos veces deja una sola fila, que otro usuario no puede usar ese id ni ver la fila, que `enforce_row_limit` sigue limitando, que un borrado repetido no da error y el `23503` de marcar un hábito inexistente |
| `tests/validation.test.ts` | Que `habitCreate` y `taskCreate` aceptan un `id` uuid y rechazan uno inválido |

La parte HTTP (200 frente a 201, 204 en un borrado repetido) y el navegador (SW, IndexedDB, Web
Locks, iOS) se validan a mano según [quickstart.md](quickstart.md).

**Motivo**: así se prueba lo que puede perder o duplicar datos sin meter un DOM falso ni
`fake-indexeddb`.

---

## D13. Interfaz que falta: editar tareas, editar, archivar y recuperar hábitos

El usuario decidió en `/speckit-plan` mantener FR-008 y FR-009 tal como están y añadir la
interfaz, que debe funcionar con y sin conexión.

**Decisión**:

- **`TaskItem`**: un botón «Editar» abre la edición en línea (título, nota, fecha y hora) con los
  mismos textos, límites y validaciones que `TaskForm`. Los esquemas Zod de `lib/validation.ts` se
  usan también en el cliente (FR-014). Al guardar, se envía el PATCH parcial (D4).
- **`HabitManager`**:
  - La edición de nombre y descripción ya existe; ahora pasa a ser parcial.
  - Se añade un botón «Archivar» en cada hábito.
  - Se añade una sección plegada «Archivados (N)» al final, con «Recuperar» y «Eliminar» en cada
    uno.
- **Consulta nueva**: `listArchivedHabits(db)` en `features/habits/queries.ts`. La usan la página Hoy
  y su copia sin conexión.
  - No hace falta un endpoint nuevo: archivar y recuperar ya son `PATCH { archived }`.
  - Al recuperar, el hábito vuelve con su `position` anterior.
  - El marcado de hoy de un hábito archivado no se muestra en la lista de Hoy (igual que ahora).
- **Server Actions**: `updateHabitAction` acepta `archived`, y `updateTaskAction` ya acepta todos los
  campos.

**Motivo**: la API y las consultas ya lo permiten. Solo falta la interfaz.

---

## D14. Errores de almacenamiento

**Decisión**: si `put` en IndexedDB falla (`QuotaExceededError`, almacenamiento bloqueado o modo
privado), se deshace el cambio optimista y se avisa: «No se ha podido guardar en este dispositivo.
Libera espacio e inténtalo de nuevo.» Nunca se finge que se ha guardado. Con conexión y sin
IndexedDB, la app sigue funcionando con Server Actions como hasta ahora.

**Motivo**: caso límite «sin espacio» de la spec y constitución IV.
