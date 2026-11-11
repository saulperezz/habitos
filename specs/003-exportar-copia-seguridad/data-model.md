# Modelo de datos (fase 1): Exportar copia de seguridad

## Cambios de esquema

Hay una migración nueva, `saas/supabase/migrations/20261110120000_backup_export.sql`. No se edita
ninguna migración aplicada.

| Cambio | Detalle |
|---|---|
| `alter table public.profiles add column last_exported_at timestamptz` | Nullable y sin valor por defecto: las cuentas existentes quedan «sin copia». La escribe solo `public.mark_backup_exported()` (llamada por `markBackupExported`) con `now()` de Postgres. |
| `create function public.export_backup() returns jsonb` | `security invoker`, `stable` y `search_path = ''`. Lanza `not_authenticated` sin sesión. Devuelve el documento descrito abajo. |
| `create function public.mark_backup_exported() returns void` | `security invoker`, `volatile` y `search_path = ''`. `update public.profiles set last_exported_at = now() where id = auth.uid()`: la fecha la pone el reloj de Postgres. Solo `authenticated`. |
| `create or replace function public.import_legacy_backup(payload jsonb)` | Misma firma; nueva lógica de reconocimiento, unión de notas, repasos, archivados y configuración. El resultado se amplía (ver contrato). |
| Permisos | `revoke execute … from anon, public` y `grant execute … to authenticated` en ambas funciones. |

Tipos de TypeScript (`src/lib/db/types.ts`):

- `profiles.Row` / `Update` + `last_exported_at`;
- `Functions.export_backup` y `Functions.mark_backup_exported`;
- resultado ampliado de `import_legacy_backup`.

## Documento de la copia (versión 2)

```text
{
  app: "mis-habitos",
  version: 2,
  exportado: ISO 8601 (now() del servidor),
  datos: {
    habits:              [HábitoCopia]       // solo activos, por position
    habitos_archivados:  [HábitoArchivado]   // extra de saas/ (la app original lo ignora)
    habitos_tareas:      [TareaCopia]        // todas, pendientes y hechas
    habitos_notas:       { "AAAA-MM-DD": NotaCopia }
    habitos_repaso:      RepasoOriginal | null   // el más reciente
    repasos:             [RepasoCopia]       // extra de saas/: todos
    habitos_config:      { repasoActivo: boolean, hora: "HH:MM" }
  }
}
```

### HábitoCopia (y HábitoArchivado)

| Campo | Origen | Notas |
|---|---|---|
| `id` | entero 1..n, único en la copia (activos y archivados) | Lo exige `index.html`, que lo usa sin comillas en `onclick` |
| `uuid` | `habits.id` | Extra: solo para buscar el hábito en la cuenta al reimportar; nunca se usa como id de una fila nueva |
| `name` | `habits.name` | 1–40 caracteres |
| `description` | `habits.description` o `''` | ≤ 120 |
| `history` | `{ "AAAA-MM-DD": true }` de `habit_logs` | Forma de la app original |
| `position` | `row_number() - 1` (activos) o `position` (archivados) | El orden también es el del array |
| `archivadoEn` | `archived_at` (solo en `habitos_archivados`) | ISO 8601 |

### TareaCopia

| Campo | Origen |
|---|---|
| `id` | entero 1..n, único en la copia |
| `uuid` | `tasks.id` (solo para buscar; nunca como id de una fila nueva) |
| `titulo` | `title` |
| `nota` | `note` o `''` |
| `fecha` | `due_date` o `null` |
| `hora` | `due_time` como `HH:MM` o `null` |
| `hecha` | `done_at is not null` |
| `hechaEn` | `floor(epoch(done_at) · 1000)` o `null` |
| `creadaEn` | `floor(epoch(created_at) · 1000)` |

### NotaCopia

`{ texto: body, editado: updated_at (ISO) }`. La clave es el día.

### RepasoCopia y RepasoOriginal

- **RepasoCopia**: `{ fecha, respuestas: { "<id de la copia>": "si" | "no" }, completado,
  completadoEn }`.
- **RepasoOriginal** (`habitos_repaso`): `{ version: 1, fecha, respuestas, completado,
  avisoCanceladoEnviado: false }`, del repaso de `day` más reciente.

Las respuestas cuya clave no es un hábito del usuario se omiten.

## Reglas de importación

El tratamiento de cada elemento, en orden y dentro de una sola transacción, es este:

1. **Validar**: `app = 'mis-habitos'`, `datos` objeto, `habits` array (como hoy) y
   `version ≤ 2` cuando venga (FR-019). Si no, `invalid_backup` y no se cambia nada.
2. **Hábitos** (`habits` y luego `habitos_archivados`): emparejar por `uuid`; si no, por nombre
   normalizado entre los no emparejados (research §4).
   - El `uuid` de la copia solo sirve para buscar:
     `where user_id = auth.uid() and id = <uuid de la copia>`. Un `uuid` que no sea un UUID válido
     se trata como ausente.
   - Si no se empareja, crear con un id nuevo (`gen_random_uuid()`, el valor por defecto de la
     columna), **nunca** con el `uuid` de la copia. Así, importar la copia de otra cuenta no choca
     con la clave primaria de filas ajenas, que RLS impide ver. Se crea activo detrás del último o
     archivado con `archivadoEn`.
   - Guardar el mapa `id de la copia (texto) → habits.id`.
   - Añadir los días de `history` con `on conflict do nothing`.
3. **Tareas**: emparejar por `uuid` (`where user_id = auth.uid() and id = <uuid>`); si no, por
   título normalizado + `creadaEn` en ms. Si no se empareja, insertar como hoy, con un id nuevo de
   `gen_random_uuid()` y nunca con el `uuid` de la copia. Las tareas reconocidas no se modifican.
4. **Notas**: sin nota → insertar; contenida o igual → nada; distinta → unir con `\n\n— — —\n\n`.
   Si se superan 10 000 caracteres → no tocar y contar como `notes_too_long`. Siempre
   `last_device = null`.
5. **Repasos**: `repasos` o, si no, `habitos_repaso`. Traducir claves con el mapa del paso 2 y
   `si/no → yes/no`; insertar con `on conflict (user_id, day) do nothing`.
6. **Configuración**: aplicar `repasoActivo` y `hora` si son válidos.
7. Devolver los contadores.

Lo que la cuenta ya tiene nunca se borra. Solo se modifican notas (por unión) y
`review_enabled`/`review_time` (FR-018).

### Transiciones de `profiles.last_exported_at`

```text
null ──(exportación correcta: Server Action)──▶ t1 ──(otra exportación)──▶ t2 …
```

No cambia al importar, al cancelar la hoja de compartir ni si falla la descarga.

**Aviso de Ajustes** = (`last_exported_at` < `now() − 30 días`) o (`null` y hay ≥ 1 hábito, tarea o
nota).
