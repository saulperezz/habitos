# Modelo de datos: Diario semanal

## Nota de un día (`public.notes`, existente)

| Campo | Tipo | Reglas |
|---|---|---|
| `user_id` | uuid | Propietario; por defecto `auth.uid()`; RLS `notes_owner`. |
| `day` | date | Día natural en la zona horaria del usuario. Clave `(user_id, day)`. |
| `body` | text | `char_length(btrim(body))` entre 1 y 10 000. Un texto vacío no se guarda: borra la fila. |
| `created_at` | timestamptz | Sin cambios. |
| `updated_at` | timestamptz | Lo actualiza el disparador `notes_updated_at`. Sirve como **versión** para detectar conflictos. |
| `last_device` | uuid, nullable | **Nuevo** (migración `20261110000000_notes_save_conflicts.sql`). Dispositivo que hizo la última escritura con `save_note`. **Se pone a `null`** en toda escritura que no identifique dispositivo: `saveNote` (API sin `baseUpdatedAt`), `save_note` con `p_device` nulo (API sin `deviceId`) e `import_legacy_backup` (tanto al insertar como en el `on conflict … do update`). |

La migración añade la columna nullable, la función `save_note` y redefine `import_legacy_backup`
(`create or replace`, misma firma y comportamiento, salvo `last_device = null` en el
`do update`); no modifica ni reescribe filas existentes.

**Invariante**: `last_device = X` solo si la última escritura de la fila la hizo el dispositivo X
mediante `save_note`. Cualquier otra escritura lo deja nulo, por lo que un reintento posterior de
X con una base antigua se detecta como conflicto y nunca sobrescribe en silencio.

### Función `public.save_note(p_day date, p_body text, p_base timestamptz, p_device uuid)`

Devuelve `jsonb`: `{ "outcome": "saved" | "deleted" | "merged" | "kept" | "too_long", "note": Note | null }`.

Estados y transiciones (todo dentro de una transacción con bloqueo de la fila):

```text
texto normalizado: vacío ⇔ btrim(p_body) = ''

¿existe fila?
├─ no
│   ├─ vacío            → deleted, note = null
│   └─ con texto        → INSERT (last_device = p_device) → saved
└─ sí
    ├─ sin conflicto (updated_at = p_base  ó  (p_device no nulo ∧ last_device = p_device))
    │   ├─ vacío        → DELETE → deleted, note = null
    │   └─ con texto    → UPDATE body, last_device = p_device → saved
    └─ conflicto
        ├─ vacío ó p_body = body actual → nada que unir → kept, note = fila actual (sin cambios)
        ├─ unión ≤ 10 000 → UPDATE body = body || '\n\n— — —\n\n' || p_body, last_device = p_device → merged
        └─ unión > 10 000 → sin escritura → too_long, note = fila actual
```

`security invoker` (se aplica RLS), ejecutable solo por `authenticated`.

## Texto pendiente (solo en el dispositivo, `localStorage`)

Clave `habitos:notas-pendientes:<userId>` → objeto `{ [day]: PendingNote }`.

| Campo | Tipo | Significado |
|---|---|---|
| `body` | string | Último texto escrito, aún sin confirmar. |
| `base` | string \| null | `updated_at` de la nota del servidor cuando se empezó a editar (null si no existía). |
| `at` | number | Momento de la última pulsación (ms), para depurar y ordenar reintentos. |

Ciclo de vida:

```text
(sin entrada) ──escribe──▶ pendiente ──saved/deleted/merged/kept y body sin cambios──▶ (sin entrada)
                              │  └─escribe durante la petición──▶ pendiente (se reenvía)
                              ├─fallo/sin conexión──▶ pendiente («Sin guardar», reintentos)
                              ├─cierre de sesión──▶ pendiente (se conserva, ligado al userId)
                              └─too_long──▶ pendiente + aviso de recortar
```

- `base` se actualiza al `updated_at` devuelto por cada guardado correcto (`saved`/`merged`/`kept`;
  `null` tras `deleted`).
- Los pendientes **no se borran al cerrar sesión**. Solo se leen y se envían con la sesión del
  mismo `userId` de su clave; otra cuenta en el mismo dispositivo no los ve ni los envía.
- Al cargar una vista, si hay pendiente para un día visible, se muestra el texto pendiente (no el
  del servidor) y se reintenta su guardado.

Clave `habitos:dispositivo` → UUID aleatorio del dispositivo (se genera una vez). También se guarda
en memoria del módulo, para que sea estable durante la sesión aunque `localStorage` no funcione.

## Semana (derivada, no se guarda)

| Campo | Cálculo |
|---|---|
| `monday` | `startOfWeek(day)` (lunes, `AAAA-MM-DD`). |
| Título | `SEMANA dd/mm/aaaa` del lunes. |
| Días visibles (semana actual) | días de `monday` a `today` con texto, más `today` siempre. |
| Días visibles (semana pasada) | días de `monday` a `monday + 6` con texto. |
| Subtítulo | ninguno para el lunes; `dd/mm/aaaa` para el resto. |

## Resumen de semana anterior (derivado, para la lista)

| Campo | Cálculo |
|---|---|
| `monday` | lunes de la semana (anterior al lunes actual). |
| `daysWithText` | número de notas de esa semana. |
| `excerpt` | texto del primer día con texto de la semana, espacios colapsados, ≤ 80 caracteres + «…» si se recorta. |

Orden: de la semana más reciente a la más antigua. Solo semanas con al menos una nota.
