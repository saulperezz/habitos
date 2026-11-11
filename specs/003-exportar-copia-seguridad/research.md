# Investigación (fase 0): Exportar copia de seguridad

No quedaba ningún «NEEDS CLARIFICATION» en el contexto técnico. Este documento recoge las
decisiones de diseño y los problemas encontrados al leer el código actual:

- `import_legacy_backup` en `saas/supabase/migrations/20261110000000_notes_save_conflicts.sql`;
- `construirCopia`, `validarCopia` y `confirmarImportacion` en `index.html`;
- `route()` en `saas/src/lib/server/api.ts`.

## 1. Dónde se construye la copia

- **Decisión**: una función SQL nueva, `public.export_backup()` (`security invoker`, `stable`), que
  devuelve el objeto completo de la copia como `jsonb`. `GET /api/v1/export` la llama a través de
  `features/profile/queries.ts`.
- **Motivo**:
  - Una sola sentencia da una foto coherente de todas las tablas.
  - Es simétrica con `import_legacy_backup`, de modo que el formato se define y se lee en el mismo
    sitio.
  - Las pruebas pedidas (exportar → importar) se pueden escribir en `tests/db.test.ts` con PGlite
    sin levantar Next.
  - Con `security invoker` se aplica RLS, así que la copia solo puede incluir filas del usuario.
- **Alternativas descartadas**:
  - Montarla en TypeScript con 6 consultas: la foto no es coherente y no se puede probar en
    `db.test.ts`.
  - Una vista: no puede devolver un único documento por usuario de forma cómoda.

## 2. Identificadores en la copia: `id` numérico + `uuid`

- **Problema encontrado**: `index.html` mete los identificadores sin comillas en atributos
  `onclick`. Por ejemplo `toggleOnDate(${h.id}, '…')` (línea ~2778) y `alternarTarea(${t.id})`
  (línea ~2554). Además compara con `===` contra números. Un `id` con un UUID rompería la app
  original con un error de sintaxis al pulsar.
- **Decisión**:
  - Cada hábito y tarea exportados llevan un `id` numérico entero y único dentro de la copia
    (1, 2, 3… por orden de exportación). Los hábitos activos y los archivados comparten la
    secuencia.
  - El identificador real de `saas/` va en un campo extra, `uuid`, que la app original ignora.
  - Las respuestas de los repasos usan como clave ese `id` numérico (como texto), igual que la app
    original (`r.respuestas[String(id)]`).
- **Motivo**: la copia funciona en `index.html` (FR-023). Al importar, una única tabla
  «`id` de la copia → hábito de la cuenta» sirve tanto para copias de `saas/` como para copias de la
  app original.
- **Alternativa descartada**: usar el UUID como `id` (rompe `index.html`).

## 3. Hábitos archivados y repasos antiguos: campos extra

- **Decisión**:
  - `datos.habits` lleva solo los hábitos activos, ordenados por `position`.
  - Los archivados van en `datos.habitos_archivados`, con `archivadoEn`.
  - `datos.habitos_repaso` lleva solo el repaso más reciente con la forma de la app original.
  - Todos los repasos van en `datos.repasos`.
  - `version` sigue siendo `2`.
- **Motivo**:
  - `validarCopia` de la app original rechaza `version > 2` y solo mira `habits` y
    `habitos_tareas`.
  - `confirmarImportacion` guarda `habits` tal cual: si los archivados estuvieran ahí aparecerían
    como activos (lo prohíbe FR-024).
  - La app original ignora las claves que no conoce.
- **Alternativa descartada**: `habits` con un campo `archivado`. La app original mostraría los
  archivados como activos.

## 4. Cómo se reconocen al importar lo que ya existe (aclaración P1 = A)

| Elemento | Primero | Si no hay coincidencia |
|---|---|---|
| Hábito (de `habits` o `habitos_archivados`) | `uuid` de la copia = `habits.id` de la cuenta (RLS limita a los suyos) | `lower(btrim(name))` igual, entre los hábitos de la cuenta aún no emparejados (primero activos, luego archivados; a igualdad, menor `position`) |
| Tarea | `uuid` = `tasks.id` | título normalizado igual (`left(btrim(titulo), 80)`) y `floor(extract(epoch from created_at) * 1000) = creadaEn`, entre las tareas aún no emparejadas |
| Día cumplido | — | clave primaria `(habit_id, day)`: `on conflict do nothing` |
| Nota | — | clave `(user_id, day)` (ver §5) |
| Repaso | — | clave `(user_id, day)`: `on conflict do nothing` (FR-016) |

- **Emparejamiento uno a uno**: dentro de la función se lleva un array con los identificadores ya
  emparejados.
- **Comparación de tiempos por milisegundos enteros**: `creadaEn` está en milisegundos (formato de
  la app original), mientras que `created_at` tiene microsegundos. Una tarea importada se guarda
  con `to_timestamp(creadaEn / 1000)`, así que comparar milisegundos enteros reconoce siempre las
  tareas importadas antes, sin errores de redondeo de `double`.
- **El `uuid` de la copia solo sirve para buscar**
  (`where user_id = auth.uid() and id = <uuid>`). Las filas nuevas siempre reciben un id de
  `gen_random_uuid()`. Insertar con el `uuid` de la copia chocaría con la clave primaria de las
  filas de la otra cuenta, que RLS no deja ver.
- **Al importar en otra cuenta**: los UUID no se encuentran y se generan identificadores nuevos. En la segunda importación entra en juego el respaldo por nombre
  y por título + creación, así que importar dos veces en una cuenta nueva tampoco duplica nada.
- **Hábitos reconocidos**: no se cambia su nombre, descripción, orden ni archivado (FR-012). Solo se
  añaden los días que falten.

## 5. Unión de notas (aclaración P2)

- **Decisión**: se usa el mismo criterio que la parte de conflicto de `save_note`:
  - sin nota en la cuenta → `insert`;
  - `strpos(cuenta, copia) > 0` (texto igual o contenido) → no se toca;
  - en otro caso → `cuenta || E'\n\n— — —\n\n' || copia`;
  - si la unión supera 10 000 caracteres → se conserva la de la cuenta y cuenta como
    `notes_too_long`.

  Toda nota insertada o unida queda con `last_device = null`, tal como pide el usuario y como ya
  hace hoy la importación.
- **Motivo**:
  - Reimportar la misma copia da «contenido» y no duplica texto (SC-002).
  - Un dispositivo con una versión antigua de una nota unida detecta conflicto en `save_note` y
    nunca la sobrescribe.
- **Cambio de comportamiento**: hoy la importación sobrescribe la nota. La prueba existente «la
  importación borra la marca de dispositivo al sobrescribir» se adapta: ahora une los textos y deja
  `last_device` nulo.

## 6. Resultado de la importación

- **Decisión**: la función devuelve
  `{ habits, logs, tasks, notes, notes_merged, notes_too_long, reviews }`, con solo lo añadido de
  verdad. `ImportResult` y el mensaje de Ajustes se amplían:
  - «No había nada nuevo que añadir» si todo es 0;
  - si `notes_merged + notes_too_long > 0`, una línea aparte: «N notas tenían otro texto: revísalas
    en el Diario».
- **Alternativa descartada**: devolver la lista de días unidos. No hace falta para cumplir FR-020
  (principio V).

## 7. Repasos y configuración

- **Exportación**:
  - En `repasos` y en `habitos_repaso` las respuestas usan los valores de la app original (`si`/`no`)
    y las claves `id` numéricas de la copia. Esto evita dos formatos.
  - `habitos_repaso` lleva
    `{ version: 1, fecha, respuestas, completado, avisoCanceladoEnviado: false }`, con la forma que
    crea `index.html` (línea ~1661).
  - Para los repasos, `completadoEn` es la fecha y hora ISO de `completed_at`.
- **Importación**:
  - Se usa `repasos` si existe; si no, el único `habitos_repaso` de las copias de la app original.
  - `si → yes` y `no → no`.
  - Se descartan las claves sin hábito emparejado o con un valor no válido.
  - `completed_at` = `completadoEn` o, si solo viene `completado: true`, el `exportado` de la
    copia; si no hay ninguno, `now()`.
- **Configuración**: si `habitos_config.repasoActivo` es booleano y `hora` cumple `HH:MM`, se aplican
  a `profiles.review_enabled` y `profiles.review_time` (FR-017, igual que `confirmarImportacion`).

## 8. Orden y archivado de los hábitos nuevos

- Los hábitos activos nuevos se añaden detrás del mayor `position` activo de la cuenta, en el orden
  de la copia.
- En una cuenta vacía la base es 0, así que el orden queda idéntico.
- Los archivados nuevos se crean con `archived_at = archivadoEn` (o `now()` si no es válida) y con
  la `position` que traían.
- La exportación numera `position` con `row_number() - 1` entre los activos, para que el orden sea
  contiguo.

## 9. Ruta de exportación y rate limit

- **Decisión**:
  - `GET /api/v1/export` con `route(..., { limit: 5 })`, el mismo límite que `POST /api/v1/import`.
  - `route()` se amplía mínimamente: si el handler devuelve un `Response`, se devuelve tal cual (sin
    envolverlo en `{ data }`) y se conservan la autenticación, el rate limit, los errores y el log.
  - Cabeceras:
    - `Content-Type: application/json; charset=utf-8`;
    - `Content-Disposition: attachment; filename="mis-habitos-AAAA-MM-DD.json"`, con la fecha
      `todayIn(profile.timezone)`;
    - `Cache-Control: no-store`.
- **Motivo**: es lo que pide el usuario. Además, el navegador o la API pueden descargarla
  directamente.
- **Alternativa descartada**: un handler propio sin `route()`, que duplicaría la autenticación y el
  rate limit.

## 10. Descarga desde Ajustes y fecha de la última copia

- **Descarga**: un componente cliente (`export-backup.tsx`):
  0. envía antes los pendientes de `pending-store` del usuario; si alguno no se puede enviar, se
     exporta igualmente y se avisa «Hay notas sin guardar en este dispositivo; no están en la
     copia.»;
  1. hace `fetch('/api/v1/export')` con la cookie de sesión y obtiene un `Blob`;
  2. en iOS, si `navigator.canShare({ files })`, abre la hoja de compartir; si no, descarga con un
     `<a download>` temporal (como `exportarDatos` de la app original);
  3. si todo va bien, llama a la Server Action `markBackupExportedAction()`.

  Si la petición falla o el usuario cancela la hoja (`AbortError`), no se marca nada (FR-010).
- **Por qué no se marca en el GET**: en iOS, cancelar la hoja de compartir no debe actualizar la
  fecha. Un acceso directo a la API tampoco garantiza que el archivo se guardara. La UI escribe con
  Server Action (principio I).
- **Almacenamiento**: nueva columna nullable `profiles.last_exported_at timestamptz`. La escribe
  `markBackupExported(db)` en `features/profile/queries.ts`, que llama a la función
  `public.mark_backup_exported()` (`security invoker`, `update … set last_exported_at = now() where
  id = auth.uid()`): la fecha sale del reloj de Postgres, no del de Node. No hace falta una nueva
  política, porque `profiles_update` ya limita a la propia fila.
- **Aviso**: lo calcula `settings/page.tsx` (Server Component):
  - `last_exported_at` anterior a hace 30 días;
  - o `null` y el usuario tiene al menos un hábito, una tarea o una nota (tres
    `count … head: true`).

  Es un texto informativo con el estilo de aviso suave existente, nunca de error.

## 11. Tamaño máximo de la copia

- **Problemas encontrados**:
  - `importBackupAction` acepta 2 MB, pero las Server Actions de Next limitan el cuerpo a 1 MB por
    defecto (`next.config.ts` no lo cambia). Hoy, un archivo de entre 1 y 2 MB falla antes de llegar
    a la acción.
  - Vercel limita el cuerpo de las peticiones a 4,5 MB.
- **Decisión**:
  - Constante `BACKUP_MAX_BYTES = 4 * 1024 * 1024` en `lib/validation.ts`, usada por
    `importBackupAction` y por `POST /api/v1/import`.
  - `experimental.serverActions.bodySizeLimit: '4mb'` en `next.config.ts`.
  - La exportación genera JSON compacto, sin sangría.
  - Si el archivo exportado supera `BACKUP_MAX_BYTES`, se descarga igualmente y se muestra el aviso
    «La copia es muy grande y no podrá volver a importarse aquí».
- **Estimación**: 3 años con 10 hábitos, 500 tareas y 1000 notas de unos 500 caracteres ocupan
  ≈ 1 MB (SC-004).
- **Alternativa descartada**: importar por trozos o comprimir. Es una complejidad que no exige
  ningún escenario (principio V).

## 12. Validación de la copia en TypeScript

`legacyBackup` (Zod) mantiene `version ≤ 2` y `.passthrough()`, y añade límites a los campos
nuevos:

- `habitos_archivados`: ≤ 500;
- `repasos`: ≤ 5000.

Así se rechazan pronto los archivos desmesurados. La validación de verdad sigue en SQL (FR-021):
longitudes, fechas, límites por usuario (`enforce_row_limit`, que aborta toda la importación con
`limit_exceeded`) y RLS.
