# Contrato: cambios en `/api/v1` para la cola sin conexión

**Funcionalidad**: `005-sin-conexion`

Autenticación, formato de error (`{ error: { code, message } }`) y rate limit (120 por minuto por
usuario) como hasta ahora (`src/lib/server/api.ts`). Las Server Actions equivalentes siguen las
mismas reglas, porque llaman a las mismas funciones de `queries.ts`.

---

## POST /api/v1/habits y POST /api/v1/tasks: alta idempotente

**Cuerpo**: el de siempre, más un `id` opcional.

```json
{ "id": "3f0c6a8e-2b7d-4c1e-9a55-0d2f1b7e9c41", "name": "Leer", "description": null }
```

```json
{ "id": "…uuid…", "title": "Comprar pan", "note": null, "dueDate": "2026-11-26", "dueTime": "09:30" }
```

| Caso | Respuesta |
|---|---|
| Sin `id` | `201 { data: Habit \| Task }` con un id del servidor (como ahora) |
| `id` nuevo | `201 { data }`, con `data.id` igual al `id` enviado |
| `id` que ya existe **en la misma cuenta** | `200 { data }`: la fila que ya existía, sin tocarla ni duplicarla |
| `id` que existe en **otra** cuenta | `409 conflict` («Ya existe.»), sin ver la fila ajena |
| `id` que no es un uuid | `400 bad_request` («Identificador inválido») |
| Se supera el límite (100 hábitos o 10 000 tareas) | `422 limit_exceeded`, solo si el `id` no existía |

En la respuesta `200`, la fila existente se devuelve tal como está en el servidor, aunque el cuerpo
traiga otros valores. Un reenvío nunca sobrescribe ediciones posteriores.

---

## PATCH /api/v1/habits/:id y PATCH /api/v1/tasks/:id: edición parcial

Sin cambios en el servidor. El cliente envía **solo los campos cambiados**:

```json
{ "name": "Leer 20 min" }
```

```json
{ "archived": true }
```

```json
{ "dueDate": "2026-11-27", "dueTime": null }
```

| Caso | Respuesta |
|---|---|
| Existe | `200 { data }` con el elemento completo actualizado |
| No existe (borrado en otro dispositivo) | `404 not_found`. El cliente descarta el cambio y avisa |
| Cuerpo vacío o datos inválidos | `400 bad_request`. El cliente descarta el cambio y avisa |

---

## DELETE /api/v1/habits/:id y DELETE /api/v1/tasks/:id: borrado idempotente

| Caso | Respuesta |
|---|---|
| Existe | `204` (borra también sus marcados en cascada) |
| **Ya no existe** (borrado antes, o reenvío) | **`204`** (antes era `404`) |
| `id` inválido | `400 bad_request` |

---

## PUT y DELETE /api/v1/habits/:id/logs/:day: marcar y desmarcar

Sin cambios:

- `PUT` en un hábito inexistente → `404` (FK). El cliente descarta y avisa.
- `DELETE` → siempre `204`.

## PUT /api/v1/habits/reorder

Sin cambios: `{ ids: uuid[] }` (1 a 100). Los id que no existen se ignoran → `204`.

## PUT /api/v1/notes/:day

Sin cambios (002). El diario no usa la cola nueva.

---

## Cómo trata el cliente cada respuesta (cola)

| Estado | Acción del cliente |
|---|---|
| `200`, `201`, `204` | Confirmado: se quita de la cola |
| `404` (`update`, `log`, `delete`) | Se descarta y se avisa: «… se borró en otro dispositivo; tu cambio no se ha aplicado» |
| `400`, `409`, `413`, `422` | Se descarta y se avisa con `error.message`. Si era un alta, se descartan también las operaciones posteriores sobre ese elemento, con un único aviso |
| `401` | La cola se pone en pausa sin descartar nada, hasta que haya sesión |
| `408`, `429`, `5xx`, error de red o tiempo agotado (15 s) | Se reintenta: espera creciente de 2 s a 60 s, respetando `Retry-After` |
