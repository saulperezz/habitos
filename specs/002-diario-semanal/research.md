# Investigación (fase 0): Diario semanal

Decisiones técnicas para cumplir la especificación (`spec.md`) dentro de la pila actual de `saas/`
(Next.js 16 App Router, React 19, Supabase, Tailwind 4, Zod 4, Vitest + PGlite). No se añade
ninguna dependencia npm.

## 1. Guardado sin pérdidas: copia local + guardado automático

- **Decisión**: cada pulsación escribe el texto de forma síncrona en `localStorage` (almacén de
  «texto pendiente», clave `habitos:notas-pendientes:<userId>`, mapa `día → { body, base, at }`).
  A los 400 ms sin teclear se envía al servidor con una Server Action. Al confirmarse, la entrada
  se elimina del almacén solo si el texto no ha cambiado mientras tanto.
- **Justificación**: `localStorage` es síncrono, por lo que lo escrito sobrevive aunque iOS mate
  la app de pantalla de inicio sin aviso (FR-011, SC-001). El servidor sigue siendo la fuente de
  verdad; lo local solo guarda lo no confirmado.
- **Alternativas descartadas**: IndexedDB (asíncrono: una escritura puede no completarse antes de
  que el sistema mate la app); guardar solo en servidor (pierde texto sin conexión); service worker
  con Background Sync (no disponible en iOS Safari).
- Todo acceso a `localStorage` va en `try/catch`; si no está disponible, el guardado sigue
  funcionando con el servidor y el indicador muestra «Sin guardar» mientras haya algo pendiente.
- La clave incluye el `userId` para que, en un dispositivo compartido, los pendientes de una
  cuenta nunca se envíen con otra. Al cerrar sesión **no se borra nada** (perder texto es peor que
  dejarlo en el dispositivo): los pendientes se quedan bajo la clave de su cuenta y solo se leen y
  envían cuando vuelve a entrar ese mismo `userId` (FR-033). Lo confirmado ya no está en el almacén
  porque se elimina al guardarse.

## 2. Guardar al cambiar de pestaña, pasar a segundo plano o cerrar

- **Decisión**:
  - Cambio de pestaña dentro de la app (navegación de cliente) o de vista del diario: al
    desmontarse el editor se lanza el guardado pendiente con la Server Action (la página sigue
    viva, la petición termina).
  - `visibilitychange` → `hidden` y `pagehide`: se envía el pendiente con
    `fetch(PUT /api/v1/notes/<día>, { keepalive: true })`, que el navegador completa aunque la
    página se descargue. La sesión va en la cookie (misma app, `route()` ya la acepta).
  - Si el envío no llega, la copia local (decisión 1) lo reintenta al volver.
- **Justificación**: las Server Actions usan `fetch` sin `keepalive` y el navegador puede
  cancelarlas al ocultar o descargar la página; `keepalive` es el único mecanismo estándar fiable
  en iOS para enviar algo al cerrar. Ver «Seguimiento de complejidad» en `plan.md`.
- **Alternativas descartadas**: `navigator.sendBeacon` (solo POST y sin cabeceras JSON; la ruta
  es PUT); `beforeunload` (no se dispara en iOS al cerrar la app).

## 3. Reintentos e indicador de estado

- **Decisión**: con algo pendiente, se reintenta al recuperar la conexión (`online`), al volver
  a la app (`visibilitychange` → `visible`), al cargar la vista y cada 15 s. El indicador global
  del diario muestra: «Guardando…» (petición en curso), «Guardado» (nada pendiente) y «Sin
  guardar» (hay pendiente y el último intento falló o no hay conexión).
- **Justificación**: cubre FR-012 y FR-013 sin colas ni dependencias.
- Solo hay una petición en curso por día; si se escribe durante una petición, al terminar se
  envía el texto más reciente (no se encolan versiones intermedias).
- **Envío al cerrar y peticiones en curso**: al ocultar o cerrar la app, el envío `keepalive`
  **se omite para los días que ya tienen una petición en curso**. Si no, la petición en curso
  (texto anterior) podría llegar al servidor después del `keepalive` (texto nuevo) y dejar guardada
  una versión antigua hasta el siguiente reintento. El texto más reciente sigue en el almacén
  local; si la petición en curso termina antes de que se cierre la página, su gestor ve que el
  texto cambió y lo reenvía, y si la página se cierra antes, se reenvía al volver a abrir la app.
  Así, en el servidor nunca queda un texto más antiguo que otro ya enviado desde el mismo
  dispositivo.

## 4. Conflictos entre dispositivos (FR-030)

- **Decisión**: nueva función SQL `public.save_note(p_day date, p_body text, p_base timestamptz,
  p_device uuid)` en una migración nueva, que en una sola transacción, con `select … for update`:
  - si no hay fila y `p_body` está vacío → no hace nada (`deleted`);
  - si no hay conflicto → inserta, actualiza o borra (`saved` / `deleted`);
  - hay **conflicto** si la fila existe, su `updated_at` ≠ `p_base` (o `p_base` es nulo) **y** la
    última escritura no vino de este mismo dispositivo (`last_device` ≠ `p_device`). Entonces
    guarda la unión `servidor + separador + dispositivo` (`merged`), o, si la unión supera
    10 000 caracteres, no escribe nada (`too_long`). Si el texto del dispositivo está vacío o
    coincide con el del servidor, conserva el del servidor sin unir (`kept`, con su propio aviso).
  - se añade la columna nullable `notes.last_device uuid`. Solo `save_note` con un `p_device` no
    nulo la rellena; **toda otra escritura la pone a `null`**: `saveNote` (API sin
    `baseUpdatedAt`), `save_note` sin `deviceId` e `import_legacy_backup` (que se redefine en la
    misma migración para poner `last_device = null` también en su `on conflict … do update`).
    Si no, una escritura ajena dejaría la marca del último dispositivo y un reintento de ese
    dispositivo con una base antigua sobrescribiría el texto ajeno en silencio.
- **Justificación**: la comprobación debe ser atómica (dos dispositivos pueden guardar a la vez) y
  la constitución exige que la coherencia se compruebe también en SQL. Recordar el dispositivo
  evita el falso conflicto más común: una petición propia que llegó al servidor pero cuya
  respuesta se perdió (cierre de la app, red caída) y que luego se reintenta con la base antigua,
  lo que duplicaría el texto.
- **Separador**: `\n\n— — —\n\n` (visible y fácil de borrar a mano).
- **Identificador de dispositivo**: UUID aleatorio generado una vez y guardado en `localStorage`
  (`habitos:dispositivo`); no identifica a la persona ni sale de Supabase.
- **Alternativas descartadas**: comprobación condicional desde TypeScript con varias consultas
  (no atómica, más idas y vueltas); comparar solo `updated_at` (duplica texto en el reintento tras
  una respuesta perdida); última escritura gana (descartado en la aclaración).
- **Compatibilidad**: la columna es nullable y la importación (`import_legacy_backup`) mantiene su
  firma y su comportamiento visible; las notas importadas (nuevas o sobrescritas) quedan con
  `last_device` nulo, así que cuentan como «de otro dispositivo».
  El formato de las notas para el usuario (día + texto) no cambia (FR-029).
- **Permisos**: `security invoker` (RLS aplica), `revoke execute … from anon, public` y
  `grant execute … to authenticated`, siguiendo `20261109000000_revoke_anon_execute.sql`.

## 5. API v1 de notas

- **Decisión**: `PUT /api/v1/notes/{day}` acepta, además de `body`, los campos opcionales
  `baseUpdatedAt` (ISO 8601 o `null`) y `deviceId` (UUID). Si se envía `baseUpdatedAt`, el
  guardado usa `save_note` con detección de conflictos (con `p_device = null` si falta
  `deviceId`); si no, se mantiene el comportamiento actual (último guardado gana, ahora con
  `last_device = null`) para no romper clientes existentes. La respuesta sigue siendo
  `{ data: Note | null }`; `too_long` responde 409 `conflict`.
- **Justificación**: el cambio es compatible hacia atrás y la Server Action y la API llaman a la
  misma función de `features/notes/queries.ts` (principio I).

## 6. Vistas y navegación

- **Decisión**: la vista depende de la URL, resuelta en el Server Component `notes/page.tsx`:
  - `/notes` → semana actual (FR-032: la barra de pestañas enlaza aquí sin parámetros);
  - `/notes?d=AAAA-MM-DD` → desde el calendario: semana actual con ese día visible, o semana
    pasada en lectura; un día futuro o inválido abre la semana actual (FR-027);
  - `/notes?w=AAAA-MM-DD` → semana pasada identificada por su lunes (flechas ‹ ›); un `w` de la
    semana actual o futura muestra la semana actual;
  - `/notes?vista=anteriores` → lista de semanas anteriores.
  El modo edición de una semana pasada (Editar/Hecho) es estado de cliente; salir de la vista
  lo cierra (y guarda lo pendiente).
- **Justificación**: Server Components por defecto, enlaces reales (flechas y botones son `<Link>`
  con objetivos de 44×44 px) y la vuelta a la semana actual es automática al entrar por la barra.
- **Alternativa descartada**: estado de vista en cliente con `sessionStorage` (contradice FR-032 y
  complica el enlace del calendario).

## 7. Lista de semanas anteriores

- **Decisión**: `listNotesBefore(db, lunesActual)` lee `day, body` de todas las notas anteriores
  (orden descendente) y una función pura `groupWeeks()` en `features/notes/weeks.ts` agrupa por
  lunes, cuenta días con texto y saca el extracto: primer día con texto de la semana, espacios
  colapsados, recortado a 80 caracteres con «…».
- **Justificación**: una persona escribe como mucho una nota al día; incluso años de diario son
  unos pocos MB y la consulta es única. La función pura se prueba en Vitest.
- **Alternativa descartada**: vista o función SQL que resuma por semana (más migración y
  mantenimiento sin necesidad medida). Se revisará si la lista tarda más de 1 s.

## 8. «Hoy», medianoche y desplazamiento inicial

- **Decisión**:
  - El servidor calcula `today` con `todayIn(profile.timezone)` (día natural, FR-031 y
    constitución 3.0.1) y pasa también la zona horaria al cliente.
  - El cliente comprueba cada 60 s y al volver a la app si `todayIn(tz)` cambió; si cambió, ningún
    campo del diario tiene el foco y la vista es la semana actual, guarda lo pendiente y llama a
    `router.refresh()` (FR-008).
  - Al montar, el bloque de hoy se coloca arriba con `scrollIntoView({ block: 'start' })`, teniendo
    en cuenta la cabecera fija (`scroll-margin-top`). El campo de hoy tiene
    `min-height: calc(100dvh - var(--cabecera-h) - var(--barra-h) - env(safe-area-inset-top) -
    env(safe-area-inset-bottom))`, lo que garantiza que haya espacio para que hoy quede arriba
    aunque no haya nada debajo. `--cabecera-h` y `--barra-h` se definen en `:root` de
    `saas/src/app/globals.css` con la altura real de la cabecera de `(app)/layout.tsx` y de
    `components/bottom-nav.tsx` (sin zonas seguras), y esos dos componentes las usan como altura
    para que no se desajusten.
- **Justificación**: reproduce el comportamiento de la app original sin depender de la hora del
  servidor (UTC).

## 9. Altura automática de los campos

- **Decisión**: al cambiar el texto y al montar, `height = 'auto'` y luego
  `height = scrollHeight + 'px'`, con `overflow: hidden` y `resize: none`.
- **Justificación**: `field-sizing: content` no está disponible en todos los Safari de iOS
  que hay que admitir; el ajuste por JS es fiable y barato.

## 10. Pruebas

- **Decisión**:
  - `tests/db.test.ts`: `save_note` (insertar, actualizar, borrar con texto vacío, conflicto que
    une, conflicto del mismo dispositivo que no une, unión demasiado larga, RLS entre usuarios,
    anon sin permiso de ejecución).
  - `tests/notes-weeks.test.ts` (nuevo): `groupWeeks`, extracto y días visibles de la semana actual.
  - `tests/dates.test.ts`: `formatDayShort` (dd/mm/aaaa) y cambio de semana a fin de año.
  - Prueba manual en el ancho de móvil en la vista previa de Vercel siguiendo `quickstart.md`.
- **Justificación**: es lo que exige la constitución; la lógica de guardado en cliente se separa en
  un módulo sin React (`pending-store.ts`) para poder probarla con Vitest.
