---

description: "Lista de tareas: Diario semanal como en la app original"
---

# Tareas: Diario semanal como en la app original

**Entrada**: documentos de diseño de `specs/002-diario-semanal/`

**Requisitos previos**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Pruebas**: se incluyen porque la constitución las exige para cambios de base de datos
(`saas/tests/db.test.ts`) y el plan las define para la lógica pura (semanas, fechas, pendientes).

**Organización**: tareas agrupadas por historia de usuario para poder implementarlas y probarlas
por separado. Todas las rutas son relativas a la raíz del repositorio.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Historia]**: historia de usuario a la que pertenece (US1…US5)

---

## Fase 1: Preparación

**Propósito**: rama de trabajo y punto de partida limpio.

- [X] T001 Crear la rama `002-diario-semanal` desde `master` actualizado (`git switch -c 002-diario-semanal`) y comprobar que en `saas/` pasa `npm run lint && npm run typecheck && npm test && npm run build` antes de tocar nada

---

## Fase 2: Base (bloquea todas las historias)

**Propósito**: datos, lógica compartida y utilidades que usan todas las vistas.

**⚠️ CRÍTICO**: ninguna historia puede empezar hasta terminar esta fase.

### Pruebas de la base (escribir primero y comprobar que fallan)

- [X] T002 [P] Añadir en `saas/tests/db.test.ts` un bloque `describe('save_note')` que cubra, como ALICE: insertar sin fila previa (`p_base` null) → `outcome = 'saved'` y `last_device = p_device`; actualizar con `p_base = updated_at` actual → `saved`; texto vacío o solo espacios con fila → `deleted` y la fila desaparece; texto vacío sin fila → `deleted` sin error; conflicto (fila con `updated_at` ≠ `p_base` y `last_device` ≠ `p_device`) → `merged` y `body = servidor || E'\n\n— — —\n\n' || nuevo`; mismo dispositivo con base antigua → `saved` sin unir; conflicto con `p_body` igual al del servidor o vacío → `kept` sin modificar la fila; unión > 10 000 caracteres → `too_long` sin escribir; `p_device` nulo → la escritura deja `last_device` nulo y un segundo guardado con `p_device` nulo y base antigua es conflicto (`merged`); **H1**: tras un `save_note` del dispositivo X, una escritura directa tipo `saveNote` (`insert … on conflict (user_id, day) do update set body = excluded.body, last_device = null`) deja `last_device` nulo y un reintento de X con su base antigua da `merged`, no `saved`; **H2**: tras un `save_note` del dispositivo X, `import_legacy_backup` con una nota para ese día deja `last_device` nulo (también en el caso `on conflict … do update`) y un reintento de X con su base antigua da `merged`; BOB no ve ni modifica la nota de ALICE (RLS); `anon` no puede ejecutar `save_note`; la importación sigue devolviendo el mismo recuento de notas que antes
- [X] T003 [P] Añadir en `saas/tests/dates.test.ts` pruebas de `formatDayShort` (`'2026-11-09'` → `'09/11/2026'`) y de `startOfWeek` en cambio de año (`'2026-01-01'` → `'2025-12-29'`)
- [X] T004 [P] Crear `saas/tests/notes-weeks.test.ts` con pruebas de `visibleDaysCurrentWeek(monday, today, daysWithText)` (lunes a hoy, días anteriores sin texto ocultos, hoy siempre, nunca días futuros; hoy lunes → solo el lunes), `visibleDaysPastWeek(monday, daysWithText)` (solo días con texto, lunes a domingo), `groupWeeks(notes)` (orden de la semana más reciente a la más antigua, `daysWithText`, solo semanas con notas) y `excerpt(body)` (espacios y saltos colapsados, ≤ 80 caracteres + «…» si se recorta; sin «…» si cabe)
- [X] T005 [P] Crear `saas/tests/pending-store.test.ts` (con un `localStorage` simulado en memoria asignado a `globalThis`, sin añadir `jsdom` ni otras dependencias) con pruebas de `pending-store`: `setPending`/`getPending`/`clearPendingIfUnchanged` por usuario (claves `habitos:notas-pendientes:<userId>`), aislamiento entre usuarios, `getDeviceId()` estable entre llamadas (clave `habitos:dispositivo`), `getDeviceId()` estable entre llamadas también cuando todos los accesos a `localStorage` lanzan errores, y funcionamiento sin excepciones cuando `localStorage` lanza errores

### Implementación de la base

- [X] T006 Crear la migración `saas/supabase/migrations/20261110000000_notes_save_conflicts.sql`: `alter table public.notes add column last_device uuid;` (nullable, sin rellenar filas existentes); función `public.save_note(p_day date, p_body text, p_base timestamptz, p_device uuid) returns jsonb language plpgsql security invoker set search_path = public` que bloquea la fila (`select … for update`) y aplica exactamente la tabla de estados de `specs/002-diario-semanal/data-model.md` (separador `E'\n\n— — —\n\n'`; conflicto ⇔ fila existe ∧ `updated_at is distinct from p_base` ∧ no (`p_device is not null` ∧ `last_device = p_device`); conflicto con `btrim(p_body) = ''` o `p_body = body` → `kept` sin escribir; unión con `char_length(btrim(...)) > 10000` → `too_long` sin escribir; toda escritura pone `last_device = p_device`, que puede ser nulo) y devuelve `jsonb_build_object('outcome', …, 'note', to_jsonb(fila) o null)`. En la misma migración, redefinir `public.import_legacy_backup(jsonb)` con `create or replace function`, copiando su cuerpo actual de `20261107000000_init.sql` sin otro cambio que `on conflict (user_id, day) do update set body = excluded.body, last_device = null`, y conservando sus atributos (`security`, `search_path`). Terminar con `revoke execute on function public.save_note(date, text, timestamptz, uuid) from anon, public;`, `grant execute … to authenticated;` y volver a aplicar `revoke … from anon, public` + `grant … to authenticated` sobre `import_legacy_backup(jsonb)` (depende de T002)
- [X] T007 Ejecutar `npm test -- db` en `saas/` y dejar en verde las pruebas de T002 contra la migración de T006
- [X] T008 [P] Actualizar `saas/src/lib/db/types.ts`: añadir `last_device: string | null` a `Note` y los tipos `SaveOutcome = 'saved' | 'deleted' | 'merged' | 'kept' | 'too_long'` y `SaveResult = { outcome: SaveOutcome; note: Note | null }`, más la firma de la RPC `save_note` en el tipo de la base de datos si el archivo las declara
- [X] T009 [P] Añadir `formatDayShort(day: Day): string` (formato `dd/mm/aaaa`, en UTC como `formatDay`) en `saas/src/lib/dates.ts` (hace pasar T003)
- [X] T010 [P] Ampliar `saas/src/lib/validation.ts`: mantener `noteUpsert` (`body: z.string().max(10_000, 'Máximo 10.000 caracteres')`) y añadir `noteSave = noteUpsert.extend({ baseUpdatedAt: z.iso.datetime({ offset: true }).nullable().optional(), deviceId: z.uuid().optional() })`
- [X] T011 Añadir en `saas/src/features/notes/queries.ts` `listNotesBefore(db, before: Day)` (`select('day, body')`, `lt('day', before)`, `order('day', { ascending: false })`) y `saveNoteSafe(db, day, body, base: string | null, deviceId: string | null): Promise<SaveResult>` que llama a `db.rpc('save_note', { p_day, p_body, p_base, p_device: deviceId })` y usa `check` para los errores; cambiar `saveNote` para que el upsert incluya `last_device: null` (`upsert({ day, body, last_device: null }, { onConflict: 'user_id,day' })`), sin otros cambios (depende de T006, T008)
- [X] T012 Cambiar `saveNoteAction` en `saas/src/features/notes/actions.ts` a `saveNoteAction(day: string, body: string, base: string | null, deviceId: string)`: valida con `dayParam` y `noteSave`, llama a `saveNoteSafe`, devuelve `SaveResult` dentro de `safe(...)` y solo revalida `/notes` y `/calendar` si `outcome !== 'too_long'` (depende de T010, T011)
- [X] T013 Cambiar `PUT` en `saas/src/app/api/v1/notes/[day]/route.ts` según `specs/002-diario-semanal/contracts/notes-api.md`: leer con `noteSave`; si `baseUpdatedAt` no viene (`undefined`) usar `saveNote` como hasta ahora; si viene, usar `saveNoteSafe` con `deviceId ?? null` (nunca un UUID inventado), devolver el resultado completo `{ outcome, note }` con estado 200, también con `too_long` (ver «Notas de implementación») (depende de T011)
- [X] T014 [P] Crear `saas/src/features/notes/weeks.ts` (puro, sin React ni Supabase) con `visibleDaysCurrentWeek`, `visibleDaysPastWeek`, `groupWeeks` y `excerpt` tal como los describe `data-model.md` (hace pasar T004)
- [X] T015 [P] Crear `saas/src/features/notes/pending-store.ts` (sin React) con `getDeviceId()`, `getPending(userId, day)`, `listPending(userId)`, `setPending(userId, day, { body, base, at })` y `clearPendingIfUnchanged(userId, day, body)` (sin ninguna función que borre los pendientes de una cuenta entera); todo acceso a `localStorage` dentro de `try/catch` y sin lanzar nunca; `getDeviceId()` guarda además el id en una variable del módulo, de modo que devuelve siempre el mismo valor durante la sesión aunque `localStorage` falle (lo lee de `habitos:dispositivo` si existe; si no, genera uno con `crypto.randomUUID()`, intenta guardarlo y lo conserva en memoria igualmente) (hace pasar T005)

**Punto de control**: migración y lógica compartida listas y probadas; `npm test` en verde.

---

## Fase 3: Historia 1 - Escribir el diario de hoy sin perder nada (P1) 🎯 MVP

**Objetivo**: campo de hoy grande con guardado automático, copia local, envío al cerrar,
reintentos, indicador de estado y aviso de conflicto.

**Prueba independiente**: abrir el diario, escribir, cerrar la app al instante (también sin
conexión y en iPhone como app de pantalla de inicio) y reabrir: el texto completo sigue ahí
(escenarios 2–6 de `quickstart.md`).

- [X] T016 [P] [US1] Definir en `:root` de `saas/src/app/globals.css` las variables `--cabecera-h` y `--barra-h` con la altura real (sin zonas seguras) de la cabecera de `saas/src/app/(app)/layout.tsx` y de `saas/src/components/bottom-nav.tsx`, y hacer que ambos componentes usen esas variables como altura (`h-[var(--cabecera-h)]`, `h-[var(--barra-h)]`) sin cambiar su aspecto actual
- [X] T017 [P] [US1] Crear `saas/src/app/(app)/notes/note-field.tsx` (cliente): `<textarea>` controlado con `maxLength={10000}`, `placeholder` opcional, `resize-none overflow-hidden`, ajuste de altura en cada cambio y al montar (`height = 'auto'` → `scrollHeight + 'px'`), prop `fill` que añade `min-height: calc(100dvh - var(--cabecera-h) - var(--barra-h) - env(safe-area-inset-top) - env(safe-area-inset-bottom))` y `aria-label` con la fecha del día (las variables las define T016)
- [X] T018 [P] [US1] Crear `saas/src/app/(app)/notes/save-status.tsx` (cliente): indicador discreto con `aria-live="polite"` que muestra «Guardando…», «Guardado» o «Sin guardar», y aviso `role="status"` con un texto por resultado según `contracts/diario-ui.md`: `merged` → «Esta nota se cambió en otro dispositivo; se han juntado los dos textos. Revísala.»; `kept` → «La nota cambió en otro dispositivo; se ha conservado esa versión.»; `too_long` → «La nota cambió en otro dispositivo y juntar los dos textos supera 10.000 caracteres. Recorta el texto para poder guardarlo.»
- [X] T019 [US1] Crear `saas/src/app/(app)/notes/use-note-saver.ts` (hook cliente) que, para un `userId` y un mapa inicial `día → { body, updated_at }` del servidor:
  1. Al montar, aplica los pendientes de `pending-store` sobre los textos del servidor y los reintenta.
  2. En cada cambio, escribe de forma síncrona `setPending(userId, day, { body, base, at })` y programa el guardado a los 400 ms con `saveNoteAction(day, body, base, getDeviceId())`. Solo hay una petición en curso por día; al terminar, si el texto cambió entretanto, envía el último.
  3. Si la respuesta es `saved`, `merged`, `kept` o `deleted`, actualiza `base` al `note?.updated_at ?? null` devuelto y llama a `clearPendingIfUnchanged`. Con `merged`, reemplaza el texto local por `note.body` y activa el aviso de unión. Con `kept`, reemplaza el texto local por `note.body` y activa el aviso «se ha conservado esa versión». Con `too_long`, deja el pendiente y activa el aviso de recortar.
  4. Expone `flush()`, que guarda ya todo lo pendiente con la Server Action. Se llama al desmontar y al cambiar de vista.
  5. Con `visibilitychange`→`hidden` y con `pagehide`, **omite los días que ya tienen una petición en curso** (su texto sigue en el almacén y se reenvía al terminar esa petición o al reabrir la app; ver research.md §3) y envía cada uno de los demás pendientes con `fetch('/api/v1/notes/' + day, { method: 'PUT', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body, baseUpdatedAt: base, deviceId }) })`.
  6. Reintenta con `online`, con `visibilitychange`→`visible` y cada 15 s mientras haya pendientes.
  7. Expone el estado global `'saving' | 'saved' | 'unsaved'` y `editing` (algún campo con foco).

  Depende de T012, T013, T015.
- [X] T020 [US1] Crear `saas/src/app/(app)/notes/current-week.tsx` (cliente) con el día de hoy: `NoteField` con `fill` y `placeholder="Escribe aquí…"`, `SaveStatus` y `useNoteSaver`; recibe `userId`, `today`, `timezone` y las notas de la semana del servidor (depende de T017, T018, T019)
- [X] T021 [US1] Reescribir `saas/src/app/(app)/notes/page.tsx` como Server Component que, sin parámetros, obtiene `requireSession()` (`today` es el día natural, `todayIn`), lee `listNotes(db, startOfWeek(today), today)` y renderiza `CurrentWeek`; eliminar el uso de `NoteEditor` y borrar `saas/src/app/(app)/notes/note-editor.tsx` (depende de T020)
- [X] T022 [US1] Garantizar FR-033 en `saas/src/features/notes/pending-store.ts` y `saas/src/app/(app)/notes/use-note-saver.ts`: los pendientes **no se borran al cerrar sesión** (no tocar `signOutAction` ni `saas/src/app/(app)/settings/page.tsx`); se guardan solo bajo `habitos:notas-pendientes:<userId>`, y `useNoteSaver` lee, muestra y envía únicamente los del `userId` de la sesión actual (el que llega del servidor por `requireSession()`), nunca los de otra clave. Añadir a `saas/tests/pending-store.test.ts` una prueba de que los pendientes de un usuario siguen ahí tras usar el almacén con otro `userId`

**Punto de control**: escribir en hoy no pierde nada en ningún caso; la historia 1 se puede
probar y desplegar sola.

---

## Fase 4: Historia 2 - Ver la semana actual como en la app original (P1)

**Objetivo**: título «SEMANA dd/mm/aaaa», días de lunes a hoy con los vacíos ocultos, subtítulos,
hoy arriba del todo, edición de días anteriores y actualización a medianoche.

**Prueba independiente**: con notas el lunes y el miércoles y hoy jueves, abrir el diario y
comprobar título, días visibles, subtítulos y que hoy queda arriba (escenario 1 de `quickstart.md`).

- [X] T023 [P] [US2] Crear `saas/src/app/(app)/notes/week-header.tsx` (servidor): título «SEMANA » + `formatDayShort(monday)` centrado, con huecos a los lados para las flechas (que añade la historia 4)
- [X] T024 [US2] Ampliar `saas/src/app/(app)/notes/current-week.tsx`: renderizar `WeekHeader` y los días de `visibleDaysCurrentWeek(monday, today, díasConTexto)` en orden, con el lunes sin subtítulo y el resto con subtítulo `formatDayShort(day)`. Cada día es un `NoteField` conectado a `useNoteSaver`; solo el de hoy lleva `fill` y «Escribe aquí…». Un día anterior que se vacía sigue visible hasta salir de la vista (no desaparece mientras se edita, FR-003) (depende de T014, T023)
- [X] T025 [US2] En `saas/src/app/(app)/notes/current-week.tsx`, al montar, colocar el bloque de hoy arriba del todo con `scrollIntoView({ block: 'start' })` y `scroll-margin-top`, sin animación. *Implementado con `calc(env(safe-area-inset-top) + 0.75rem)`: la cabecera no es fija (se desplaza con la página), así que reservar `--cabecera-h` dejaría un hueco vacío de 60 px sobre hoy.*
- [X] T026 [US2] En `saas/src/app/(app)/notes/current-week.tsx`, comprobar cada 60 s y al volver a la app (`visibilitychange`→`visible`) si `todayIn(timezone)` es distinto del `today` pintado. Si lo es y `editing` es falso, ejecutar `flush()` y después `router.refresh()`. Si se está escribiendo, aplazarlo hasta que se pierda el foco (FR-008, FR-031)
- [X] T027 [US2] Añadir en la cabecera de `CurrentWeek` el botón-enlace «Ver notas anteriores» a `/notes?vista=anteriores` (`next/link`, mínimo 44×44 px, colores con variables CSS existentes)

**Punto de control**: la semana actual coincide con la app original (salvo las flechas).

---

## Fase 5: Historia 3 - Consultar y editar semanas anteriores (P2)

**Objetivo**: lista de semanas anteriores con notas y semana pasada en lectura con Editar/Hecho.

**Prueba independiente**: con notas en tres semanas anteriores, abrir la lista, entrar en una,
editar, «Hecho», volver a la lista y a «Esta semana» (escenarios 7, 8 y 10 de `quickstart.md`).

- [X] T028 [P] [US3] Crear `saas/src/app/(app)/notes/past-weeks-list.tsx` (servidor): botón-enlace «← Esta semana» a `/notes`. Recibe `groupWeeks(await listNotesBefore(db, mondayActual))` y pinta cada semana como `<Link href="/notes?w=<lunes>">` con «SEMANA dd/mm/aaaa», «N día con notas» / «N días con notas» y el `excerpt`. Sin semanas, muestra «Aún no hay semanas anteriores con notas.»
- [X] T029 [P] [US3] Crear `saas/src/app/(app)/notes/past-week.tsx` (cliente): `WeekHeader`, botón-enlace «← Notas anteriores» a `/notes?vista=anteriores` y botón «Editar»/«Hecho». En lectura, los días de `visibleDaysPastWeek` se muestran con el texto en párrafos (`whitespace-pre-wrap`) y el mismo criterio de subtítulos. En edición, cada día es un `NoteField` con `useNoteSaver` (los pendientes locales se muestran también en lectura). «Hecho» y desmontar llaman a `flush()`. Al volver a lectura, los días vacíos desaparecen y, si no queda ninguno, aparece «Esta semana no tiene notas.» (depende de T019, T023)
- [X] T030 [US3] Ampliar `saas/src/app/(app)/notes/page.tsx` para resolver la vista por URL (`specs/002-diario-semanal/contracts/diario-ui.md`):
  - `vista=anteriores` → `PastWeeksList`.
  - `w` válido (`isValidDay`) y normalizado con `startOfWeek` a un lunes anterior al actual → `PastWeek` con `listNotes(db, lunes, lunes+6)`.
  - `w` de la semana actual, futura o inválido → semana actual.

  Depende de T028, T029.

**Punto de control**: se pueden consultar y corregir semanas pasadas; al volver a la pestaña
siempre se ve la semana actual (FR-032).

---

## Fase 6: Historia 4 - Pasar de semana con las flechas ‹ › (P3)

**Objetivo**: flechas a los lados del título para ir a la semana anterior o siguiente.

**Prueba independiente**: desde la semana actual pulsar ‹ dos veces y › una; volver a la actual
y comprobar › desactivada (escenario 9 de `quickstart.md`).

- [X] T031 [US4] Añadir flechas en `saas/src/app/(app)/notes/week-header.tsx`:
  - ‹ es un `<Link>` a `/notes?w=<lunes−7>` con `aria-label="Semana anterior"`.
  - › es un `<Link>` a `/notes?w=<lunes+7>`, o a `/notes` si esa semana es la actual, con `aria-label="Semana siguiente"`.
  - En la semana actual, › se pinta como elemento desactivado (`aria-disabled="true"`, sin enlace, color atenuado).
  - Ambas flechas miden al menos 44×44 px.

  Recibe `monday` y `currentMonday`.
- [X] T032 [US4] Asegurar en `saas/src/app/(app)/notes/past-week.tsx` que una semana pasada sin notas a la que se llega con las flechas muestra «Esta semana no tiene notas.», con las flechas y «← Notas anteriores» visibles y «Editar» oculto (depende de T031)

**Punto de control**: navegación por flechas igual que en la versión actual.

---

## Fase 7: Historia 5 - Abrir el diario de un día desde el calendario (P3)

**Objetivo**: el enlace existente `/notes?d=<día>` del calendario abre la vista correcta.

**Prueba independiente**: desde el calendario abrir un día de esta semana y otro de hace un mes
(escenario 11 de `quickstart.md`).

- [X] T033 [US5] En `saas/src/app/(app)/notes/page.tsx`, resolver `d`:
  - Inválido o posterior a hoy → semana actual.
  - Dentro de la semana actual → semana actual, pasando `focusDay = d` a `CurrentWeek`.
  - Anterior → `PastWeek` del lunes de `d`.
- [X] T034 [US5] En `saas/src/app/(app)/notes/current-week.tsx`, si llega `focusDay` y ese día está en `visibleDaysCurrentWeek` (o es hoy), desplazar ese día arriba en lugar de hoy. Si el día no tiene texto, mostrar hoy arriba (depende de T033)

**Punto de control**: todas las historias funcionan por separado.

---

## Fase 8: Pulido y comprobaciones transversales

- [X] T035 [P] Revisar en 360 px y 430 px, en claro y oscuro, que `/notes` en todas sus vistas no tenga scroll horizontal y que respete las zonas seguras de iOS. Ajustar las clases en `saas/src/app/(app)/notes/*.tsx` usando solo variables CSS de `saas/src/app/globals.css`
- [X] T036 [P] Actualizar `saas/README.md` (sección de la API v1): documentar `baseUpdatedAt` y `deviceId` en `PUT /api/v1/notes/{day}` y la respuesta `{ outcome, note }`, según `specs/002-diario-semanal/contracts/notes-api.md`
- [X] T037 Ejecutar en `saas/` `npm run lint && npm run typecheck && npm test && npm run build` y corregir hasta que todo pase
- [ ] T038 Aplicar la migración `20261110000000_notes_save_conflicts.sql` al proyecto de Supabase de la vista previa, abrir la URL de vista previa de Vercel de la rama en el móvil y recorrer los 16 escenarios de `specs/002-diario-semanal/quickstart.md`
- [ ] T039 Abrir el PR de `002-diario-semanal` a `master` con el resumen de cambios, la migración nueva y el resultado de `quickstart.md`

---

## Dependencias y orden de ejecución

### Dependencias entre fases

- **Preparación (fase 1)**: sin dependencias.
- **Base (fase 2)**: depende de la fase 1. Bloquea todas las historias.
- **US1 (fase 3)**: depende de la base. Es el MVP.
- **US2 (fase 4)**: depende de la base y de `current-week.tsx`, `note-field.tsx` y `use-note-saver.ts` de la US1.
- **US3 (fase 5)**: depende de la base y de `use-note-saver.ts` (T019) y `week-header.tsx` (T023). Se puede hacer en paralelo con la US2 una vez existe T023.
- **US4 (fase 6)**: depende de `week-header.tsx` (US2) y de `past-week.tsx` (US3).
- **US5 (fase 7)**: depende de `page.tsx` de la US3 y de `current-week.tsx` de la US2.
- **Pulido (fase 8)**: depende de todas las historias.

### Dentro de cada fase

- Primero las pruebas (T002–T005) y comprobar que fallan.
- Después la migración y los tipos, luego `queries.ts`, luego la acción y la API.
- En cada historia: primero los componentes base y luego la integración en `page.tsx`.

### Oportunidades de paralelismo

- Fase 2: T002, T003, T004 y T005 en paralelo. Después, T008, T009, T010, T014 y T015 en paralelo (archivos distintos), mientras T006 → T007 → T011 → T012/T013 siguen en cadena.
- Fase 3: T016, T017 y T018 en paralelo antes de T019.
- Fase 5: T028 y T029 en paralelo.
- Fase 8: T035 y T036 en paralelo.

---

## Ejemplo de paralelismo: base

```bash
# Pruebas a la vez:
Tarea: "Pruebas save_note en saas/tests/db.test.ts"
Tarea: "Pruebas formatDayShort en saas/tests/dates.test.ts"
Tarea: "Pruebas de semanas en saas/tests/notes-weeks.test.ts"
Tarea: "Pruebas de pendientes en saas/tests/pending-store.test.ts"

# Utilidades puras a la vez:
Tarea: "formatDayShort en saas/src/lib/dates.ts"
Tarea: "weeks.ts en saas/src/features/notes/weeks.ts"
Tarea: "pending-store.ts en saas/src/features/notes/pending-store.ts"
```

## Ejemplo de paralelismo: historia 1

```bash
Tarea: "note-field.tsx en saas/src/app/(app)/notes/note-field.tsx"
Tarea: "save-status.tsx en saas/src/app/(app)/notes/save-status.tsx"
```

---

## Estrategia de implementación

### MVP primero (solo historia 1)

1. Fases 1 y 2 (preparación y base).
2. Fase 3: el diario de hoy se guarda sin pérdidas.
3. **Parar y validar** con los escenarios 2–6 de `quickstart.md` en la vista previa.

### Entrega incremental

1. Base + US1 → validar (MVP).
2. US2 → semana actual completa como la original.
3. US3 → notas anteriores.
4. US4 y US5 → flechas y enlace del calendario.
5. Pulido, comprobaciones de la CI, prueba en la vista previa y PR.

---

## Notas

- `[P]` = archivos distintos y sin dependencias pendientes.
- No editar migraciones ya aplicadas: cualquier corrección de `save_note` tras aplicarla va en una
  migración nueva.
- Ningún campo puede guardar solo con `onBlur` (constitución, principio IV).
- Hacer commits pequeños y descriptivos por tarea o grupo lógico.

## Notas de implementación

- **`save_note`, cambio respecto a `data-model.md` inicial** (ya reflejado allí): una unión (`merged`)
  deja `last_device = null` y, en conflicto, si el texto del servidor ya contiene el del
  dispositivo el resultado es `kept`. Sin esto, si la respuesta de una unión se perdía (app
  cerrada), el reintento del mismo dispositivo con su versión antigua la sobrescribía y se perdía el
  texto del otro dispositivo. Prueba: «un reintento de la misma unión no la sobrescribe ni la
  duplica» en `saas/tests/db.test.ts`.
- **Texto vacío**: `save_note` considera vacío un texto sin caracteres visibles (`!~ '[^[:space:]]'`),
  igual que `body.trim()` en TypeScript; `btrim` solo quita espacios y un texto con solo saltos
  de línea se habría guardado.
- **Unión demasiado larga**: se compara la longitud real (`char_length(joined) > 10000`), no la
  recortada, para que el texto unido siempre quepa en el campo (`maxLength=10000`).
- **Respuesta de la API con `baseUpdatedAt`**: devuelve `{ data: { outcome, note } }` con estado 200
  para los cinco resultados (también `too_long`, que significa que no se guardó nada), en lugar de
  la nota sola y un 409. Así el envío `keepalive` al cerrar la app recibe el resultado exacto y
  muestra el aviso correcto. Sin `baseUpdatedAt` la respuesta no cambia (`{ data: Note | null }`).
- **T035**: revisado sobre el código (no hay `.env` local para arrancar contra Supabase). Las barras
  de botones pueden pasar a dos líneas para caber en 360 px. La comprobación real en el móvil es
  T038.
