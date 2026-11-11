# Contrato: exportación e importación de copias

## Lógica compartida (`saas/src/features/profile/`)

| Función | Archivo | Llama a |
|---|---|---|
| `exportBackup(db): Promise<Backup>` | `queries.ts` | `rpc('export_backup')` |
| `backupFileName(day: Day): string` → `mis-habitos-AAAA-MM-DD.json` | `queries.ts` | — |
| `importLegacyBackup(db, backup): Promise<ImportResult>` | `import.ts` (resultado ampliado) | `rpc('import_legacy_backup')` |
| `markBackupExported(db): Promise<void>` | `queries.ts` | `rpc('mark_backup_exported')` → `update profiles set last_exported_at = now()` (reloj de Postgres) |

```ts
type ImportResult = {
  habits: number; logs: number; tasks: number; notes: number;
  notes_merged: number; notes_too_long: number; reviews: number;
};
```

## `GET /api/v1/export`

- **Autenticación**: cookie de sesión o `Authorization: Bearer <token>`, mediante `route()`.
- **Rate limit**: 5 peticiones por minuto y usuario (`{ limit: 5 }`, igual que la importación).
- **200**: el cuerpo es el documento JSON de la copia (`data-model.md`), sin envoltorio `{ data }`.
  Cabeceras:
  - `Content-Type: application/json; charset=utf-8`
  - `Content-Disposition: attachment; filename="mis-habitos-AAAA-MM-DD.json"`, con el día de hoy en
    la zona del perfil
  - `Cache-Control: no-store`
- **401** `unauthorized`, **429** `rate_limited` (con `Retry-After`) y **500** `internal`, con la
  forma común `{ error: { code, message } }`.
- **Efectos**: ninguno; no cambia `last_exported_at`.

Cambio en `route()` (`src/lib/server/api.ts`): si el handler devuelve una instancia de `Response`, se
devuelve sin envolver. Su estado se usa en el log.

## `POST /api/v1/import` (existente)

- Acepta copias de la app original y de `saas/` (con `uuid`, `habitos_archivados` y `repasos`).
- El tamaño máximo pasa de 2 MB a `BACKUP_MAX_BYTES` (4 MB).
- **201**: `{ data: ImportResult }`, con los campos nuevos.
- **400**:
  - `bad_request` («Este archivo no es una copia de Mis Hábitos.», «La copia es de una versión más
    nueva.»);
  - `invalid_backup` (desde SQL);
  - `limit_exceeded` si se superan los límites por usuario. En ese caso no se importa nada.

## Server Actions (`src/features/profile/actions.ts`)

| Acción | Entrada | Salida | Efecto |
|---|---|---|---|
| `importBackupAction(json)` (existente) | texto del archivo (≤ 4 MB) | `Result<ImportResult>` | importa y `revalidatePath('/', 'layout')` |
| `markBackupExportedAction()` (nueva) | — | `Result<void>` | `markBackupExported` y `revalidatePath('/settings')` |

`next.config.ts`: `experimental.serverActions.bodySizeLimit = '4mb'`.

## Interfaz en Ajustes (`src/app/(app)/settings/`)

### `export-backup.tsx` (cliente, nuevo)

Recibe `{ userId: string, maxBytes: number, lastExportedAt: string | null, showReminder: boolean, timezone: string }`.
El límite `maxBytes` llega de `page.tsx` (que importa `BACKUP_MAX_BYTES` en el servidor); el
componente no importa `@/lib/validation`.

**Estado inicial**:
- Etiqueta «Copia de seguridad».
- Texto «Última copia: 3 de noviembre de 2026» o «Aún no has hecho ninguna copia».
- Si `showReminder`, aviso suave: «Hace más de un mes de tu última copia. Te recomendamos hacer una
  nueva.» o «Te recomendamos hacer una copia de tus datos.».
- Botón «Exportar copia de seguridad», a todo el ancho, ≥ 44 px de alto.

**Al pulsar**:
1. El botón pasa a «Exportando…» y queda deshabilitado.
1b. Se envían los pendientes de `pending-store` del usuario con `saveNoteAction`. Los que no se
   puedan enviar (sin conexión o error) se quedan en el dispositivo y la exportación continúa.
2. `fetch('/api/v1/export')`; si `!ok`, error.
3. `blob` y nombre desde `Content-Disposition`.
4. iOS con `canShare({ files })`: `navigator.share`. Si da `AbortError`, se vuelve al estado
   inicial sin mensaje.
5. Resto: `<a download>` temporal con `URL.createObjectURL` y `revokeObjectURL` a los 10 s.
6. `markBackupExportedAction()`.
7. Mensaje «Copia exportada ✓ Guárdala en un lugar seguro (Archivos, iCloud…).». Si
   `blob.size > maxBytes`, aviso añadido: «La copia es muy grande y no podrá volver a
   importarse aquí.». Si quedaron pendientes sin enviar en 1b, aviso añadido: «Hay notas sin
   guardar en este dispositivo; no están en la copia.».

**Si falla**: «No se pudo exportar la copia. Inténtalo de nuevo.» (con `role="alert"`). No se marca
la fecha.

### `import-backup.tsx` (existente)

- **Título**: «Traer datos».
- **Texto**: explica que acepta copias exportadas aquí o desde la app original y que no duplica lo
  que ya existe (FR-022).
- **Mensajes**:
  - Si todo es 0: «No había nada nuevo que añadir.».
  - Si no: «Importado ✓ X hábitos, Y días cumplidos, Z tareas, N notas y R repasos.».
  - Si `notes_merged + notes_too_long > 0`, además: «K notas tenían otro texto: revísalas en el
    Diario.».

### `page.tsx` (servidor)

- Pasa `last_exported_at` del perfil.
- Calcula `showReminder` (`data-model.md`).
- Coloca `<ExportBackup>` antes de `<ImportBackup>`.
