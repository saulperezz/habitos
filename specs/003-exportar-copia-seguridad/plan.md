# Plan de implementación: Exportar copia de seguridad

**Rama**: `003-exportar-copia` | **Fecha**: 2026-11-10 | **Especificación**: [spec.md](spec.md)

**Entrada**: especificación de `specs/003-exportar-copia-seguridad/spec.md`

## Resumen

Se añade a Ajustes de `saas/` el botón «Exportar copia de seguridad». El botón descarga
`mis-habitos-AAAA-MM-DD.json` desde un Route Handler nuevo, `GET /api/v1/export`, que usa el mismo
`route()` y el mismo rate limit (5/min) que la importación. El documento lo genera una función SQL
nueva, `export_backup()`. Usa el formato de `construirCopia` de `index.html` (`app`, `version: 2`,
`exportado`, `datos.habits`, `habitos_tareas`, `habitos_notas`, `habitos_repaso`, `habitos_config`)
y añade campos que la app original ignora:

- `uuid` en hábitos y tareas;
- `habitos_archivados`;
- `repasos`.

Los `id` de la copia son enteros, porque `index.html` los usa sin comillas en `onclick`.

`import_legacy_backup` se redefine en una migración nueva (`create or replace`, misma firma) para no
duplicar nada al reimportar:

- **Hábitos**: se reconocen por `uuid`, o por nombre normalizado si la copia no lo trae (copias de
  la app original).
- **Tareas**: se reconocen por `uuid`, o por título + `creadaEn` en milisegundos.
- **El `uuid` de la copia solo sirve para buscar** (`where user_id = auth.uid() and id = uuid`).
  Lo que no se encuentra se crea con un id nuevo (`gen_random_uuid()`), nunca con el de la copia.
  Así, importar la copia de otra cuenta no choca con la clave primaria de filas ajenas.
- **Días cumplidos y repasos**: se reconocen por su clave.
- **Notas**: se unen como en los conflictos de `save_note` si el texto de la copia no está ya
  contenido, y siempre quedan con `last_device = null`.
- **Además**: restaura archivados, repasos y configuración del repaso, y devuelve cuántas notas se
  han unido.

La fecha de la última copia se guarda en `profiles.last_exported_at` (misma migración). La escribe
una Server Action cuando el cliente termina la descarga o la hoja de compartir.

## Contexto técnico

**Lenguaje/versión**: TypeScript 6 (estricto), React 19, SQL (PostgreSQL de Supabase, PL/pgSQL).

**Dependencias principales**: Next.js 16 App Router, `@supabase/ssr`, `@supabase/supabase-js`,
Zod 4 y Tailwind 4. **Sin dependencias nuevas.**

**Almacenamiento**: Supabase Postgres. Hay una columna nueva (`profiles.last_exported_at`), una
funciones nuevas (`export_backup` y `mark_backup_exported`) y una función redefinida (`import_legacy_backup`).

**Pruebas**: Vitest. `tests/db.test.ts` usa PGlite y aplica todas las migraciones en orden; incluye
las tres pruebas de ida y vuelta que pide el usuario, la de exportar en A e importar dos veces en B
(sin errores de clave primaria ni duplicados) y los casos de `quickstart.md`. Se adaptan las
dos pruebas de importación existentes al resultado ampliado y a la unión de notas. Además hay prueba
manual en la vista previa de Vercel y en `index.html`.

**Plataforma objetivo**: navegadores móviles (Safari iOS como app de pantalla de inicio, Chromium
Android) y escritorio; despliegue en Vercel.

**Tipo de proyecto**: aplicación web (Next.js con servidor y cliente en `saas/`).

**Objetivos de rendimiento**: archivo descargado en < 5 s para 3 años de uso (SC-004, ≈ 1 MB); el
botón responde al instante con «Exportando…».

**Restricciones**:
- Cero pérdida o duplicación de datos al importar; importación de todo o nada.
- Compatibilidad con la validación de `index.html`, que no se modifica.
- Cuerpo ≤ 4 MB (límite de Vercel 4,5 MB).
- 360–430 px de ancho, modo oscuro y textos en español.

**Escala/alcance**:
- Una persona por cuenta: ≤ 100 hábitos, ≤ 10 000 tareas y ≈ 365 notas/año.
- 1 migración, 1 ruta nueva, 1 componente nuevo y ~8 archivos tocados.

## Comprobación de Constitución

*Puerta: debe superarse antes de la fase 0 y volver a comprobarse tras la fase 1.*

| Principio / regla | Cumplimiento |
|---|---|
| **I. Arquitectura** | ✅ `settings/page.tsx` sigue siendo Server Component; solo `export-backup.tsx` e `import-backup.tsx` son cliente (necesitan `fetch`, `Blob`, `navigator.share` y archivos). La escritura desde la UI (`last_exported_at`, importar) usa Server Actions. La API v1 (`GET /export`, `POST /import`) y las acciones llaman a la misma lógica de `features/profile/` (`queries.ts`, `import.ts`). La lectura de la exportación desde la UI usa `GET /api/v1/export`, como pide el usuario: es una lectura (descarga de archivo), no una escritura, así que no infringe la regla. TypeScript estricto y sin dependencias nuevas. |
| **II. Datos privados y seguros** | ✅ `export_backup`, `mark_backup_exported` e `import_legacy_backup` son `security invoker` (aplican RLS) y solo las ejecuta `authenticated`. Sin service role. La copia no incluye suscripciones push, otros usuarios ni secretos. Longitudes, fechas, límites por usuario y coherencia se siguen comprobando en SQL. Sin terceros nuevos; el archivo se genera en el servidor y se entrega solo al propio usuario (`Cache-Control: no-store`). |
| **III. Móvil primero** | ✅ Botón a todo el ancho de ≥ 44 px y un toque. Hoja de compartir en iOS. Aviso con variables CSS existentes y modo oscuro. Diseño a 360–430 px. |
| **IV. Integridad de datos** | ✅ Migración nueva `20261110120000_backup_export.sql`; no se edita ninguna aplicada. La columna es nullable, así que las filas existentes no cambian. `import_legacy_backup` mantiene la firma y sigue aceptando las copias de la app original. La importación solo añade; las notas se unen, nunca se sobrescriben, y quedan con `last_device = null`, de modo que `save_note` detecta conflicto en lugar de pisar el texto unido. Todo o nada en una transacción. Fecha del archivo en la zona del usuario (día natural). Sin campos que guarden solo con `onBlur`. |
| **V. Simplicidad** | ✅ Sin colas, sin compresión, sin importación por trozos y sin endpoint extra para marcar la copia desde la API. El cambio de `route()` es una línea (dejar pasar un `Response`). Los campos extra de la copia son los mínimos para FR-009/FR-012/FR-013. |
| Restricciones (español, < 100 ms) | ✅ Textos en español. Respuesta inmediata del botón («Exportando…»); la descarga no es una actualización optimista sino una acción explícita con estado. |
| App antigua congelada | ✅ `index.html` no se toca. Su copia sigue siendo importable en `saas/` (`/api/v1/import`) y la copia de `saas/` respeta su validación. |
| Flujo de calidad | ✅ Rama `003-exportar-copia` y PR a `master`. `lint`, `typecheck`, `test` y `build` en `saas/`. Prueba en la vista previa de Vercel (`quickstart.md`). La migración y las funciones llevan prueba en `tests/db.test.ts`. |

**Resultado**: superada sin excepciones.

**Revisión tras la fase 1**: sin cambios. `data-model.md` y `contracts/backup-api.md` mantienen las
conclusiones. El único punto delicado (la UI llama a un Route Handler) es una lectura pedida
expresamente y no una escritura.

## Estructura del proyecto

### Documentación (esta funcionalidad)

```text
specs/003-exportar-copia-seguridad/
├── plan.md              # Este archivo
├── research.md          # Fase 0
├── data-model.md        # Fase 1: esquema, formato de la copia y reglas de importación
├── quickstart.md        # Fase 1: pruebas automáticas y manuales
├── contracts/
│   └── backup-api.md    # Lógica compartida, GET /api/v1/export, POST /api/v1/import, acciones y UI
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Código fuente (`saas/`)

```text
saas/
├── next.config.ts                         # experimental.serverActions.bodySizeLimit = '4mb'
├── supabase/migrations/
│   └── 20261110120000_backup_export.sql   # NUEVA: profiles.last_exported_at + export_backup() + mark_backup_exported() + import_legacy_backup() redefinida + permisos
├── src/
│   ├── lib/
│   │   ├── server/api.ts                  # route(): deja pasar un Response sin envolverlo
│   │   ├── validation.ts                  # BACKUP_MAX_BYTES; legacyBackup + habitos_archivados/repasos acotados
│   │   └── db/types.ts                    # last_exported_at, export_backup, mark_backup_exported, ImportResult ampliado
│   ├── features/profile/
│   │   ├── import.ts                      # ImportResult ampliado
│   │   ├── queries.ts                     # + exportBackup, backupFileName, markBackupExported, needsBackupReminder, hasAnyData
│   │   └── actions.ts                     # + markBackupExportedAction; importBackupAction con BACKUP_MAX_BYTES
│   ├── app/api/v1/
│   │   ├── export/route.ts                # NUEVO: GET, limit 5, Content-Disposition attachment
│   │   └── import/route.ts                # límite de tamaño BACKUP_MAX_BYTES
│   └── app/(app)/settings/
│       ├── page.tsx                       # last_exported_at + showReminder; <ExportBackup> antes de <ImportBackup>
│       ├── export-backup.tsx              # NUEVO (cliente): fetch → compartir/descargar → markBackupExportedAction
│       └── import-backup.tsx              # textos y resumen ampliado (notas unidas, «nada nuevo»)
└── tests/
    ├── db.test.ts                         # + export_backup, ida y vuelta, reimportación, copia original ×2, unión de notas, límites, RLS; se adaptan 2 pruebas existentes
    └── validation.test.ts                 # + legacyBackup con campos nuevos y backupFileName
```

**Decisión de estructura**: se mantiene la organización actual de `saas/`:

- rutas en `src/app`;
- lógica de dominio en `src/features/profile`, porque la copia es de toda la cuenta, como la
  importación actual;
- utilidades en `src/lib`;
- pruebas en `tests/`.

## Seguimiento de complejidad

No hay infracciones de la constitución que justificar.
