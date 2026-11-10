# Contrato: notas (lógica compartida, Server Action y API v1)

## Lógica de dominio (`saas/src/features/notes/queries.ts`)

```ts
type SaveOutcome = 'saved' | 'deleted' | 'merged' | 'kept' | 'too_long';
type SaveResult = { outcome: SaveOutcome; note: Note | null };

listNotes(db, from: Day, to: Day): Promise<Note[]>              // existente
listNotesBefore(db, before: Day): Promise<Pick<Note,'day'|'body'>[]> // nuevo, orden day desc
getNote(db, day: Day): Promise<Note | null>                      // existente
saveNote(db, day: Day, body: string): Promise<Note | null>       // existente: el último gana; ahora pone last_device = null
saveNoteSafe(db, day: Day, body: string, base: string | null, deviceId: string): Promise<SaveResult> // nuevo → rpc save_note
```

`Note` incluye ahora `last_device: string | null` (tipos regenerados en `lib/db/types`).

## Server Action (`saas/src/features/notes/actions.ts`)

```ts
saveNoteAction(day: string, body: string, base: string | null, deviceId: string)
  : Promise<{ ok: true; data: SaveResult } | { ok: false; error: string }>
```

- Valida `day` (`dayParam`), `body` (`noteUpsert`, ≤ 10 000), `base` (ISO o null) y `deviceId` (UUID).
- Llama a `saveNoteSafe`; revalida `/notes` y `/calendar` salvo en `too_long`.

## API REST `PUT /api/v1/notes/{day}` (cambio compatible hacia atrás)

Petición:

```json
{ "body": "texto", "baseUpdatedAt": "2026-11-10T08:00:00.123456+00:00", "deviceId": "uuid" }
```

- `body` obligatorio (≤ 10 000; vacío o solo espacios borra).
- `baseUpdatedAt` opcional (`string` ISO o `null`). **Si falta**, comportamiento actual (el último
  guardado gana, `saveNote`). **Si está**, se usa `saveNoteSafe` (detección de conflictos).
- `deviceId` opcional (UUID); si falta con `baseUpdatedAt` presente, se pasa `p_device = null`:
  la escritura deja `last_device` nulo y cualquier cambio respecto a la base es conflicto.

Respuestas:

| Caso | Estado | Cuerpo |
|---|---|---|
| Sin `baseUpdatedAt` | 200 | `{ "data": Note }` o `{ "data": null }` si se borró (sin cambios respecto a la versión anterior) |
| Con `baseUpdatedAt` | 200 | `{ "data": { "outcome", "note" } }`: `outcome` ∈ `saved`, `merged`, `kept`, `deleted`, `too_long`; `note`: `Note` o `null` |
| Validación | 400 | `{ "error": { "code": "bad_request", … } }` |
| Sin sesión | 401 | `{ "error": { "code": "unauthorized", … } }` |

Con `baseUpdatedAt`, `outcome` dice qué ha pasado: `saved` (guardada), `deleted` (borrada,
`note` nulo), `merged` (cambió en otro dispositivo y se han unido los textos), `kept` (cambió en otro
dispositivo y se conserva esa versión) o `too_long` (**no se ha guardado nada**: la unión superaría
10 000 caracteres; `note` es la versión actual del servidor). El diario usa `outcome` para mostrar
el aviso correcto también tras el envío al cerrar la app.

Autenticación: cookie de sesión (la usa el envío `keepalive` del propio diario al cerrar) o
`Authorization: Bearer`. `GET /api/v1/notes/{day}` no cambia.
