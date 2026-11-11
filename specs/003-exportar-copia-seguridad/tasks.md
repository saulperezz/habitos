# Tareas: Exportar copia de seguridad

**Entrada**: documentos de diseño de `specs/003-exportar-copia-seguridad/`

**Requisitos previos**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/backup-api.md`, `quickstart.md`

**Pruebas**: se incluyen porque el usuario las pide expresamente en `tests/db.test.ts` y la
constitución exige pruebas de BD para todo cambio de migraciones o funciones. Se escriben antes de
la implementación y deben fallar primero.

**Organización**: por historia de usuario de `spec.md`. Todas las rutas son relativas a la raíz del
repositorio. La migración nueva es **un único archivo**,
`saas/supabase/migrations/20261110120000_backup_export.sql`; varias tareas lo amplían porque aún no
se ha aplicado en ningún entorno.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Historia]**: historia de usuario a la que pertenece (US1, US2, US3, US4)

---

## Fase 1: Preparación

- [X] T001 Comprobar que la rama actual es `003-exportar-copia` (creada desde `master` con el PR #5
  fusionado) y que en `saas/` pasa `npm run lint && npm run typecheck && npm test && npm run build`
  antes de tocar nada

---

## Fase 2: Base (bloquea todas las historias)

**Propósito**: piezas compartidas por la exportación y la importación.

- [X] T002 [P] En `saas/src/lib/server/api.ts`, cambiar `route()` para que, si el handler devuelve
  una instancia de `Response`, se devuelva tal cual (sin envolver en `{ data }`), usando su
  `status` en la variable `status` del log. No cambian la autenticación, el rate limit ni el
  manejo de errores
- [X] T003 [P] En `saas/src/lib/validation.ts`:
  - exportar `BACKUP_MAX_BYTES = 4 * 1024 * 1024`;
  - ampliar `legacyBackup` manteniendo `app: z.literal('mis-habitos')`, `version` entero `.max(2)`
    con el mensaje «La copia es de una versión más nueva.» y `.passthrough()`;
  - añadir a `datos` `habitos_archivados: z.array(z.unknown()).max(500).optional()` y
    `repasos: z.array(z.unknown()).max(5000).optional()`.
- [X] T004 [P] En `saas/next.config.ts`, añadir `experimental: { serverActions: { bodySizeLimit:
  '4mb' } }` sin tocar las cabeceras de seguridad existentes (research §11)
- [X] T005 [P] En `saas/src/lib/db/types.ts`:
  - añadir `last_exported_at: string | null` a `profiles.Row` y `last_exported_at?: string | null`
    a `profiles.Update`;
  - añadir la firma de `Functions.export_backup` (`Args: Record<string, never>; Returns: Json`) y
    la de `Functions.mark_backup_exported` (`Args: Record<string, never>; Returns: undefined`);
  - cambiar el `Returns` de `import_legacy_backup` a `Json`.

**Punto de control**: `npm run typecheck` pasa.

---

## Fase 3: Historia 1 - Descargar una copia con todos mis datos (P1) 🎯 MVP

**Objetivo**: el botón de Ajustes descarga `mis-habitos-AAAA-MM-DD.json` con todos los datos, en el
formato de `data-model.md`, y marca la fecha de la última copia solo si la descarga termina bien.

**Prueba independiente**: con ALICE con hábitos activos y archivados, historial, tareas, notas,
repasos y configuración, `export_backup()` devuelve todos esos datos. En la vista previa, el botón
descarga el archivo con el nombre correcto.

### Pruebas de la historia 1 (escribir primero y comprobar que fallan)

- [X] T006 [US1] Añadir en `saas/tests/db.test.ts` un `describe('export_backup')`. Prepara como
  ALICE:
  - 3 hábitos activos con `position` no contiguas (p. ej. 0, 5, 9);
  - 1 hábito archivado con `archived_at`;
  - días cumplidos en varios hábitos;
  - una tarea pendiente con fecha y hora, una hecha y una sin fecha;
  - dos notas;
  - dos `review_sessions` (una completada, con respuestas `yes`/`no`, y otra a medias);
  - `review_enabled = false` y `review_time = '21:30'`.

  Comprueba:
  - `app = 'mis-habitos'`, `version = 2` y `exportado` ISO válido;
  - `datos.habits` contiene solo los 3 activos, en orden de `position`, con `position` 0, 1, 2;
  - `datos.habitos_archivados` contiene el archivado con `archivadoEn`;
  - todos los `id` son enteros únicos entre `habits` y `habitos_archivados` (y entre tareas) y cada
    elemento lleva `uuid` = su `id` real;
  - `history` es `{ "AAAA-MM-DD": true }`;
  - las tareas tienen `titulo`, `nota` (`''` si nula), `fecha`, `hora` (`'HH:MM'` o `null`),
    `hecha`, `hechaEn` y `creadaEn` en milisegundos enteros;
  - `habitos_notas[día] = { texto, editado }`;
  - `repasos` tiene las dos sesiones, con respuestas `si`/`no` cuyas claves son los `id` numéricos
    de la copia (como texto), `completado` y `completadoEn`;
  - `habitos_repaso` es el de `day` más reciente con
    `{ version: 1, fecha, respuestas, completado, avisoCanceladoEnviado: false }`;
  - `habitos_config = { repasoActivo: false, hora: '21:30' }`;
  - una respuesta guardada con un UUID que no es hábito de ALICE no aparece;
  - como BOB, la copia no contiene nada de ALICE;
  - `anon` no puede ejecutar `export_backup`;
  - `mark_backup_exported()` como ALICE pone `last_exported_at` entre el `now()` de Postgres antes
    y después de la llamada, no toca el perfil de BOB y `anon` no puede ejecutarla.
- [X] T007 [P] [US1] Añadir en `saas/tests/validation.test.ts` pruebas de
  `backupFileName('2026-11-03')` → `'mis-habitos-2026-11-03.json'` y de que `legacyBackup` acepta
  una copia con `habitos_archivados` y `repasos`, rechaza `version: 3` y rechaza
  `habitos_archivados` con más de 500 elementos

### Implementación de la historia 1

- [X] T008 [US1] Crear `saas/supabase/migrations/20261110120000_backup_export.sql` con:
  - una cabecera de comentarios en español;
  - `alter table public.profiles add column last_exported_at timestamptz;` (nullable, sin valor
    por defecto);
  - la función `public.export_backup() returns jsonb language plpgsql stable security invoker set
    search_path = ''`, que lanza `not_authenticated` (`errcode 42501`) si `auth.uid()` es nulo y
    construye el documento exactamente como `specs/003-exportar-copia-seguridad/data-model.md`:
    - `id` enteros con `row_number()`; los archivados continúan la numeración de los activos;
    - `position` de los activos = `row_number() - 1` por `position, created_at`;
    - `description` `''` si es nula;
    - `hora` con `to_char(due_time, 'HH24:MI')`;
    - `creadaEn`/`hechaEn` = `floor(extract(epoch from …) * 1000)::bigint`;
    - `editado`/`archivadoEn`/`completadoEn`/`exportado` en ISO 8601 con
      `to_jsonb(timestamptz)`;
    - respuestas de repaso traducidas `yes → si`, `no → no`, con clave el `id` de la copia y
      omitiendo las claves sin hábito;
    - `habitos_repaso` `null` si no hay repasos;
    - listas vacías u objetos vacíos (`habitos_notas: {}`) si no hay datos.

  - la función `public.mark_backup_exported() returns void language sql volatile security invoker
    set search_path = ''` con `update public.profiles set last_exported_at = now() where id =
    auth.uid();` (la fecha la pone el reloj de Postgres, no el de Node).

  Terminar con `revoke execute on function public.export_backup() from anon, public;`,
  `grant execute on function public.export_backup() to authenticated;` y lo mismo para
  `public.mark_backup_exported()` (depende de T006)
- [X] T009 [US1] Ejecutar `npm test -- db` en `saas/` y dejar en verde las pruebas de T006 (depende
  de T008)
- [X] T010 [US1] Añadir en `saas/src/features/profile/queries.ts` (no se crea `backup.ts`;
  `import.ts` se queda donde está):
  - `exportBackup(db: DB): Promise<Record<string, unknown>>`, que llama a
    `db.rpc('export_backup')` con `check`;
  - `backupFileName(day: Day): string`, que devuelve `` `mis-habitos-${day}.json` ``.

  Hace pasar T007 junto con T003 (depende de T005)
- [X] T011 [US1] Crear `saas/src/app/api/v1/export/route.ts` con
  `export const GET = route(async ({ db }) => { … }, { limit: 5 })`, que:
  - lee el perfil con `getProfile(db)`;
  - construye el nombre con `backupFileName(todayIn(profile.timezone))`;
  - devuelve
    `new Response(JSON.stringify(await exportBackup(db)), { status: 200, headers })`.

  Cabeceras de `headers`: `'Content-Type': 'application/json; charset=utf-8'`,
  `'Content-Disposition': 'attachment; filename="<nombre>"'` y `'Cache-Control': 'no-store'`. No
  modifica `last_exported_at` (depende de T002, T010)
- [X] T012 [US1] Añadir `markBackupExported(db: DB): Promise<void>` en
  `saas/src/features/profile/queries.ts`, que llama a `db.rpc('mark_backup_exported')` con `check`
  (la fecha la pone `now()` de Postgres; nunca `new Date()` de Node). Añadir
  `markBackupExportedAction()` en `saas/src/features/profile/actions.ts`, que llama a
  `markBackupExported(db)` dentro de `safe(...)` y luego a `revalidatePath('/settings')`
  (depende de T005, T008 y de T010, que toca el mismo archivo)
- [X] T013 [US1] Crear `saas/src/app/(app)/settings/export-backup.tsx` (cliente) según
  `contracts/backup-api.md`:
  - props `userId`, `maxBytes`, `lastExportedAt`, `showReminder` y `timezone` (no importa
    `@/lib/validation` en el cliente: el límite llega como prop);
  - etiqueta «Copia de seguridad» y botón «Exportar copia de seguridad» (`btn-primary` o el estilo
    de botón principal existente, `w-full`, ≥ 44 px), que mientras trabaja muestra «Exportando…»
    y queda deshabilitado;
  - **antes de pedir la copia**, enviar los pendientes del usuario: para cada entrada de
    `listPending(userId)` de `@/features/notes/pending-store`, `await saveNoteAction(day, body,
    base, getDeviceId())`. Si el resultado es correcto y no es `too_long`,
    `clearPendingIfUnchanged(userId, day, body)`. Si alguno no se puede enviar (sin conexión,
    `ok: false`, excepción o `too_long`), se deja en el almacén y se marca `quedanPendientes =
    true`, pero la exportación continúa;
  - `fetch('/api/v1/export', { cache: 'no-store' })`; si `!res.ok`, error;
  - nombre desde `Content-Disposition` (o `mis-habitos.json` de respaldo) y
    `new File([blob], nombre, { type: 'application/json' })`;
  - en iOS (como `esIOS()` de `index.html`) y con `navigator.canShare?.({ files: [file] })`:
    `navigator.share({ files: [file], title: 'Copia de Mis Hábitos' })`. Con `AbortError`, volver
    al estado inicial sin mensaje y sin marcar;
  - en el resto, un `<a download>` temporal con `URL.createObjectURL` y `revokeObjectURL` a los
    10 s;
  - tras el éxito, `await markBackupExportedAction()` y el mensaje «Copia exportada ✓ Guárdala en
    un lugar seguro (Archivos, iCloud…).» (`role="status"`). Si `blob.size > maxBytes`, se añade
    «La copia es muy grande y no podrá volver a importarse aquí.». Si `quedanPendientes`, se añade
    «Hay notas sin guardar en este dispositivo; no están en la copia.»;
  - si falla, «No se pudo exportar la copia. Inténtalo de nuevo.» (`role="alert"`) sin marcar la
    fecha.

  Colores solo con las clases y variables CSS existentes (depende de T011, T012)
- [X] T014 [US1] En `saas/src/app/(app)/settings/page.tsx`, importar `BACKUP_MAX_BYTES` de
  `@/lib/validation` (en el servidor) y renderizar `<ExportBackup userId={user.id}
  maxBytes={BACKUP_MAX_BYTES} lastExportedAt={profile.last_exported_at} showReminder={false}
  timezone={profile.timezone} />` antes de `<ImportBackup />` (el aviso real lo calcula T025)
  (depende de T013)

**Punto de control**: en local, el botón descarga el archivo, `profiles.last_exported_at` cambia y
`GET /api/v1/export` sin sesión responde 401.

---

## Fase 4: Historia 2 - Restaurar la copia sin perder ni duplicar nada (P1)

**Objetivo**: «Traer datos» restaura una copia de `saas/` sin pérdidas y no duplica nada al
reimportar, tanto con copias de `saas/` como de la app original.

**Prueba independiente**: las pruebas de ida y vuelta de `quickstart.md` §1 pasan en
`tests/db.test.ts`.

### Pruebas de la historia 2 (escribir primero y comprobar que fallan)

- [X] T015 [US2] Añadir en `saas/tests/db.test.ts` un `describe('copia: ida y vuelta')`. Crea en
  `beforeAll` dos usuarios nuevos más en `auth.users`: CAROL (cuenta vacía para la ida y vuelta) y
  DAVE (usuario B de la prueba entre cuentas). Usa los datos de ALICE de T006. Pruebas:
  1. **Exportar → importar en un usuario nuevo → datos idénticos**: exportar como ALICE e importar
     como CAROL. Comparar por contenido, sin ids:
     - hábitos por `(name, description, position, archived_at is not null)`; para los
       archivados, `archived_at` igual;
     - días por `(habit name, day)`;
     - tareas por `(title, note, due_date, due_time, done_at, created_at)` truncando los tiempos
       con `date_trunc('milliseconds', …)`;
     - notas por `(day, body)`, con `last_device` nulo en todas;
     - repasos por `(day, completed_at is not null)` y respuestas traducidas al nombre del hábito;
     - `review_enabled`/`review_time`.

     El resultado devuelve `notes_merged = 0` y `notes_too_long = 0`.
  2. **Exportar → importar dos veces en el mismo usuario → sin duplicados ni texto repetido**:
     importar en ALICE su propia copia dos veces. Ambas devuelven todo a 0 y ningún
     `count(*)`/`body` cambia.
  3. **Exportar en A → importar en B dos veces → sin errores ni duplicados**: exportar como ALICE e
     importar como DAVE dos veces.
     - La primera no lanza ningún error (en particular, ninguna violación de clave primaria) y crea
       filas cuyos `id` son distintos de todos los `uuid` de la copia.
     - Los datos de ALICE siguen intactos (mismos `count(*)` como ALICE).
     - La segunda devuelve todo a 0: los hábitos se reconocen por nombre y las tareas por título +
       `creadaEn`.
  4. **Copia de la app original importada dos veces → sin duplicados**: la copia `backup` del
     `describe('import_legacy_backup')`, sin `uuid`, importada dos veces como DAVE después de
     limpiar sus datos o como otro usuario nuevo. La segunda devuelve todo a 0 y no hay tareas ni
     hábitos repetidos.
  5. **Nota distinta**: cambiar el texto de una nota en ALICE y reimportar su copia →
     `body = actual || E'\n\n— — —\n\n' || copia`, `last_device` nulo y `notes_merged = 1`. Una
     tercera importación no cambia nada (texto contenido).
  6. **Unión de más de 10 000 caracteres** → la nota no cambia y `notes_too_long = 1`.
  7. **Hábito renombrado o archivado en ALICE después de exportar**:
     - un hábito renombrado se reconoce por `uuid`, no se crea otro y conserva el nombre nuevo;
     - un hábito activo en la copia que se archiva en ALICE después de exportar se reconoce por
       `uuid`, no se crea otro y sigue archivado (mismo `archived_at`), recibiendo solo los días
       que falten.
  8. **Mayúsculas y espacios**: copia original con «Leer» y cuenta con «leer » → se reconoce por
     nombre.
  9. **`uuid` inválido** (p. ej. `'no-es-uuid'`): se trata como ausente, sin error.
  10. **Límite de hábitos**: una copia que haría superar 100 hábitos lanza `limit_exceeded` y no
      deja nada importado (todo o nada).
  11. **Configuración**: `habitos_config` aplica `review_enabled`/`review_time`; una `hora`
      inválida se ignora.
- [X] T016 [US2] Adaptar en `saas/tests/db.test.ts` las pruebas existentes:
  - «importa hábitos, historial, tareas y notas ignorando lo inválido» espera ahora
    `{ habits: 2, logs: 2, tasks: 2, notes: 1, notes_merged: 0, notes_too_long: 0, reviews: 0 }`;
  - «la importación borra la marca de dispositivo al sobrescribir» se renombra a «la importación
    une la nota y borra la marca de dispositivo». Espera `body = 'de X\n\n— — —\n\nimportada'`,
    `last_device` nulo, `notes: 0` y `notes_merged: 1`, y que el reintento de X siga dando
    `merged`.

### Implementación de la historia 2

- [X] T017 [US2] Añadir en `saas/supabase/migrations/20261110120000_backup_export.sql`
  `create or replace function public.import_legacy_backup(payload jsonb)`. Misma firma, `returns
  jsonb`, `language plpgsql security invoker set search_path = ''`, partiendo del cuerpo de
  `20261110000000_notes_save_conflicts.sql` y aplicando las reglas de
  `specs/003-exportar-copia-seguridad/data-model.md` («Reglas de importación»):
  - **Validación**: además de la actual, `invalid_backup` si viene `version` y no es un número
    `≤ 2`.
  - **Hábitos** de `habits` (activos) y luego de `habitos_archivados`:
    - `uuid` → solo para buscar con
      `select id from public.habits where user_id = uid and id = <uuid>::uuid`, si `uuid` cumple la
      forma de UUID (regex) y no está ya emparejado.
    - Si no, buscar por `lower(btrim(name)) = lower(btrim(<name>))` entre los no emparejados,
      primero activos y luego archivados, por `position`.
    - Llevar los emparejados en un array `uuid[]`.
    - Si no hay coincidencia, `insert` **sin columna `id`** (se usa `gen_random_uuid()` por
      defecto; nunca el `uuid` de la copia) con `left(btrim(name), 40)`, la descripción ≤ 120 y
      `position`. Los activos nuevos van en `base_position + i`; los archivados, con
      `archived_at = archivadoEn` válido o `now()` y su `position`.
    - Guardar el mapa `id de la copia (texto) → habits.id` en una variable `jsonb`.
    - Insertar los días de `history` con `on conflict do nothing`, contando solo las filas
      insertadas.
    - **Hábitos reconocidos**: no se actualiza ningún campo.
  - **Tareas**:
    - Buscar por `uuid` igual que los hábitos.
    - Si no, por `title = left(btrim(titulo), 80)` y
      `floor(extract(epoch from created_at) * 1000)::bigint = (creadaEn)::bigint` entre las no
      emparejadas.
    - Si no hay coincidencia, `insert` sin `id`, como hoy. Las tareas reconocidas no se tocan.
  - **Notas**:
    - Sin fila: `insert … last_device null` → `notes + 1`.
    - `strpos(body, texto) > 0`: nada.
    - Unión `body || E'\n\n— — —\n\n' || texto` con `char_length ≤ 10000`:
      `update … set body = unión, last_device = null` → `notes_merged + 1`.
    - Si no cabe: nada y `notes_too_long + 1`.
    - Mantener el `exception when invalid_datetime_format or datetime_field_overflow`.
  - **Repasos**: los de `repasos` (array) o, si no hay, `habitos_repaso` (objeto) si `fecha` es un
    día válido.
    - Traducir las claves con el mapa y `si → yes`, `no → no`; descartar las demás.
    - `completed_at` = `completadoEn` válido; si no, `exportado` cuando `completado` es `true`, o
      `now()` si tampoco hay; si no está completado, `null`.
    - `insert into public.review_sessions … on conflict (user_id, day) do nothing` → `reviews + 1`
      solo si se inserta.
  - **Configuración**: si `habitos_config.repasoActivo` es booleano, `update profiles set
    review_enabled`; si `hora ~ '^([01]\d|2[0-3]):[0-5]\d$'`, `review_time`.
  - **Resultado**: `jsonb_build_object('habits', …, 'logs', …, 'tasks', …, 'notes', …,
    'notes_merged', …, 'notes_too_long', …, 'reviews', …)`.

  Terminar con `revoke execute on function public.import_legacy_backup(jsonb) from anon, public;` y
  `grant … to authenticated;` (depende de T008, T015, T016)
- [X] T018 [US2] Ejecutar `npm test -- db` en `saas/` y dejar en verde T015, T016 y T006 (depende de
  T017)
- [X] T019 [P] [US2] En `saas/src/features/profile/import.ts`, ampliar `ImportResult` a
  `{ habits; logs; tasks; notes; notes_merged; notes_too_long; reviews }` (todos `number`)
- [X] T020 [P] [US2] Usar `BACKUP_MAX_BYTES` en lugar de `2 * 1024 * 1024`:
  - en `importBackupAction` de `saas/src/features/profile/actions.ts`, con el mensaje «El archivo
    es demasiado grande (máx. 4 MB).»;
  - en `saas/src/lib/server/api.ts`, añadir a `readJson` un tercer parámetro opcional
    `maxBytes = MAX_BODY_BYTES` (2 MB por defecto) y usarlo en las dos comprobaciones de tamaño;
    las demás rutas no cambian;
  - en `POST` de `saas/src/app/api/v1/import/route.ts`, llamar a
    `readJson(request, legacyBackup, BACKUP_MAX_BYTES)`.

  Actualizar el comentario de la ruta para decir que acepta copias de la app original y de `saas/`
  (depende de T003)
- [X] T021 [US2] En `saas/src/app/(app)/settings/import-backup.tsx`:
  - título «Traer datos»;
  - texto «Elige un archivo `mis-habitos-….json` exportado aquí o desde la app original. Se
    añadirá a lo que ya tengas sin duplicar nada.»;
  - mensajes según `contracts/backup-api.md`:
    - todo 0 (incluidos `notes_merged` y `notes_too_long`) → «No había nada nuevo que añadir.»;
    - si no → «Importado ✓ X hábitos, Y días cumplidos, Z tareas, N notas y R repasos.»;
    - si `notes_merged + notes_too_long > 0`, un segundo párrafo «K notas tenían otro texto:
      revísalas en el Diario.».

  (depende de T019)

**Punto de control**: las historias 1 y 2 juntas cumplen la ida y vuelta completa (SC-001, SC-002 y
SC-003).

---

## Fase 5: Historia 3 - Saber cuándo hice la última copia (P2)

**Objetivo**: Ajustes muestra la fecha de la última copia y un aviso suave si han pasado más de 30
días o si nunca se ha hecho y hay datos.

**Prueba independiente**: con `last_exported_at` de hace 31 días se ve el aviso; con 30 días o
menos, no. Exportar en un dispositivo y ver la misma fecha en otro.

- [X] T022 [US3] Añadir en `saas/src/features/profile/queries.ts` la función pura
  `needsBackupReminder(lastExportedAt: string | null, hasData: boolean, now: Date): boolean`. Es
  `true` si `lastExportedAt` es nulo y `hasData`, o si `now - lastExportedAt > 30 días`
  (`30 * 24 * 3600 * 1000` ms); `false` en el resto
- [X] T023 [P] [US3] Añadir en `saas/tests/validation.test.ts` pruebas de `needsBackupReminder`:
  - nunca exportado con datos → `true`;
  - nunca exportado sin datos → `false`;
  - hace exactamente 30 días → `false`;
  - hace 30 días + 1 ms → `true`;
  - hoy → `false`.

  Escribir antes de T022 y comprobar que fallan
- [X] T024 [US3] Añadir `hasAnyData(db: DB): Promise<boolean>` en
  `saas/src/features/profile/queries.ts`. Hace tres
  `select('*', { count: 'exact', head: true })` con `.limit(1)` sobre `habits`, `tasks` y `notes`
  (RLS limita al usuario) y devuelve `true` si alguno es > 0
- [X] T025 [US3] En `saas/src/app/(app)/settings/page.tsx`, calcular
  `showReminder = needsBackupReminder(profile.last_exported_at, await hasAnyData(db), new Date())`
  (consultando `hasAnyData` solo cuando `last_exported_at` sea nulo, para no consultar de más) y
  pasarlo a `<ExportBackup>` junto con `timezone={profile.timezone}` (depende de T014, T022, T024)
- [X] T026 [US3] En `saas/src/app/(app)/settings/export-backup.tsx`:
  - mostrar «Última copia: <fecha>», con la fecha en español (`toLocaleDateString('es-ES', { day:
    'numeric', month: 'long', year: 'numeric', timeZone })` con la zona del perfil, que llega como
    prop `timezone` desde `page.tsx`), o «Aún no has hecho ninguna copia»;
  - si `showReminder`, el aviso suave (texto informativo con el estilo de aviso no crítico
    existente, sin `role="alert"`): «Hace más de un mes de tu última copia. Te recomendamos hacer
    una nueva.» si hay fecha, o «Te recomendamos hacer una copia de tus datos.» si no;
  - tras exportar, la fecha se actualiza por `revalidatePath` y el aviso desaparece.

  (depende de T025)

**Punto de control**: escenarios 1–4 de la historia 3 en local.

---

## Fase 6: Historia 4 - Llevar la copia a la app original (P3)

**Objetivo**: la copia exportada desde `saas/` se importa en `index.html` sin modificar esa app.

**Prueba independiente**: importar el archivo en `index.html` y usar la app sin errores en la
consola.

- [X] T027 [US4] Añadir en `saas/tests/db.test.ts`, dentro de `describe('export_backup')`, una
  prueba «la copia pasa la validación de la app original». Reproduce las comprobaciones de
  `validarCopia` de `index.html`:
  - `app === 'mis-habitos'`;
  - `typeof version === 'number' && version <= 2`;
  - `datos.habits` y `datos.habitos_tareas` son arrays;
  - cada hábito tiene `name` string e `history` objeto;
  - cada tarea tiene `titulo` string.

  Comprueba además que todos los `id` de `habits` y `habitos_tareas` cumplen
  `Number.isSafeInteger` (se usan sin comillas en `onclick`), que ningún hábito archivado está en
  `habits` y que `habitos_config.hora` cumple `^([01]\d|2[0-3]):[0-5]\d$` (depende de T008)
- [X] T028 [US4] Prueba manual (`quickstart.md` §3): abrir `index.html` en el navegador, importar
  un archivo exportado desde `saas/` (Ajustes › Copia de seguridad › Importar › Reemplazar) y
  comprobar:
  - hábitos activos en su orden con su historial y sin archivados;
  - tareas, notas, hora del repaso y, si el repaso es de hoy, su estado;
  - marcar un hábito, una tarea y un día del calendario sin errores en la consola.

  No modificar `index.html`

---

## Fase 7: Pulido y comprobaciones transversales

- [X] T029 [P] Revisar `saas/src/app/(app)/settings/*.tsx` en 360 px y 430 px, en claro y en
  oscuro: sin scroll horizontal, botones ≥ 44×44 px, textos en español con buena ortografía y
  colores solo con variables CSS de `saas/src/app/globals.css`
- [X] T030 [P] Actualizar `saas/README.md` (sección de la API v1):
  - documentar `GET /api/v1/export` (cabeceras, límite de 5/min, que no actualiza la fecha de la
    última copia);
  - documentar el resultado ampliado de `POST /api/v1/import` y el límite de 4 MB;
  - remitir a `specs/003-exportar-copia-seguridad/contracts/backup-api.md` y `data-model.md`.
- [X] T031 Ejecutar en `saas/` `npm run lint && npm run typecheck && npm test && npm run build` y
  corregir hasta que todo pase
- [X] T032 Validación en el proyecto de Supabase `habitos` (el mismo para producción y vista previa):
  - [X] aplicar la migración `20261110120000_backup_export.sql` (hecho el 2026-11-11; comprobado que
    exportar y reimportar la misma copia da todo a 0);
  - [X] abrir la URL de vista previa de Vercel de la rama en el móvil y recorrer
    `specs/003-exportar-copia-seguridad/quickstart.md` §2 y §4 (ida y vuelta, cancelar la hoja de
    compartir en iPhone, otro dispositivo, reimportación, nota unida, aviso de 30 días, nota escrita
    sin conexión → aviso «Hay notas sin guardar…»);
  - [ ] (omitida: la copia real ocupa ~12 KB, muy lejos del límite de 4 MB) **medición manual de volumen** (no va en la CI): con una cuenta con muchos datos (p. ej. 10
    hábitos con 3 años de historial, 500 tareas y 1000 notas, cargados con un script SQL puntual),
    medir con la pestaña de red el tiempo desde el toque hasta tener el archivo (SC-004: < 5 s) y
    comprobar que importar esa copia en una cuenta vacía termina sin errores. Anotar los tiempos en
    el PR.
- [X] T033 Abrir el PR de `003-exportar-copia` a `master` con el resumen de cambios, la migración
  nueva, la nota sobre el cambio de comportamiento de la importación (las notas ahora se unen en
  lugar de sobrescribirse) y el resultado de `quickstart.md`

---

## Dependencias y orden de ejecución

### Dependencias entre fases

- **Preparación (fase 1)**: sin dependencias.
- **Base (fase 2)**: depende de la fase 1 y bloquea todas las historias.
- **Historia 1 (fase 3)**: depende de la base. Crea la migración (T008), que amplían las historias
  2 y 4.
- **Historia 2 (fase 4)**:
  - T017 depende de T008, porque escribe en el mismo archivo de migración;
  - T015 usa los datos de T006;
  - el resto (T019–T021) solo depende de la base.
- **Historia 3 (fase 5)**: depende de T012–T014 (columna, acción y componente de la historia 1).
- **Historia 4 (fase 6)**: depende de T008. T028 depende además de que haya UI para exportar
  (T013).
- **Pulido (fase 7)**: depende de todas las historias.

### Dentro de cada fase

- Las pruebas se escriben primero y deben fallar: T006/T007 antes de T008/T010; T015/T016 antes de
  T017; T023 antes de T022.
- Primero SQL, luego la lógica de `features/`, luego la ruta o acción y por último la UI.
- `saas/tests/db.test.ts` y `saas/supabase/migrations/20261110120000_backup_export.sql` los tocan
  varias tareas: esas tareas no son [P] entre sí.

### Oportunidades de paralelismo

- Base: T002, T003, T004 y T005 (archivos distintos).
- Historia 1: T007 en paralelo con T006. T010 y T012 tocan `queries.ts`: van seguidas.
- Historia 2: T019 y T020 en paralelo con la escritura de T017.
- Historia 3: T023 en paralelo con T022/T024 (T022 y T024 tocan `queries.ts`: seguidas).
- Pulido: T029 y T030.

---

## Ejemplo de paralelismo: base

```text
Tarea: "T002 route() deja pasar Response en saas/src/lib/server/api.ts"
Tarea: "T003 BACKUP_MAX_BYTES y legacyBackup en saas/src/lib/validation.ts"
Tarea: "T004 bodySizeLimit en saas/next.config.ts"
Tarea: "T005 tipos en saas/src/lib/db/types.ts"
```

## Ejemplo de paralelismo: historia 1

```text
Tarea: "T006 describe('export_backup') en saas/tests/db.test.ts"
Tarea: "T007 backupFileName y legacyBackup en saas/tests/validation.test.ts"
# después de T005:
Tarea: "T010 exportBackup/backupFileName en saas/src/features/profile/queries.ts"
# y a continuación (mismo archivo):
Tarea: "T012 markBackupExported + markBackupExportedAction"
```

## Ejemplo de paralelismo: historia 2

```text
Tarea: "T019 ImportResult ampliado en saas/src/features/profile/import.ts"
Tarea: "T020 BACKUP_MAX_BYTES en actions.ts e import/route.ts"
```

---

## Estrategia de implementación

### MVP primero (solo historia 1)

1. Fases 1 y 2.
2. Fase 3: el usuario ya puede descargar su copia completa y se registra la fecha.
3. **Parar y validar**: archivo correcto y fecha marcada solo al terminar bien.

Aun así, la historia 2 también es P1. No se debe publicar el botón de exportar sin la importación
sin duplicados, porque reimportar la copia con la función actual duplicaría hábitos y tareas.
Ambas historias van en el mismo PR.

### Entrega incremental

1. Base → historia 1 → historia 2: ida y vuelta completa (SC-001, SC-002 y SC-003).
2. Historia 3: fecha y aviso (SC-006).
3. Historia 4: compatibilidad comprobada con `index.html` (SC-005).
4. Pulido, vista previa y PR.

---

## Notas

- [P] = archivos distintos y sin dependencias pendientes.
- Hacer un commit pequeño y descriptivo tras cada tarea o grupo lógico.
- No editar ninguna migración ya aplicada (`20261107000000_init.sql`,
  `20261109000000_revoke_anon_execute.sql`, `20261110000000_notes_save_conflicts.sql`).
- El `uuid` de la copia nunca se inserta como `id`; las filas nuevas siempre usan
  `gen_random_uuid()`.
- `index.html` no se modifica en esta funcionalidad.
