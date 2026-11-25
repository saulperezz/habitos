# Modelo de datos: Usar la app sin conexión

**Funcionalidad**: `005-sin-conexion` | **Fecha**: 2026-11-25

**No cambia el esquema de Supabase ni hay migración nueva.** Los cambios de datos son:

- en el servidor, que los esquemas Zod aceptan un `id` opcional en las altas;
- en el dispositivo, IndexedDB más la caché del service worker.

---

## 1. Servidor (Supabase): sin cambios de esquema

| Tabla | Lo que importa para la 005 |
|---|---|
| `habits` | `id uuid primary key default gen_random_uuid()` admite un `id` que llega del cliente. El RLS `habits_owner` y el disparador `habits_limit` (100) no cambian |
| `tasks` | Igual que `habits`, con el disparador `tasks_limit` (10 000) |
| `habit_logs` | La clave `(habit_id, day)` hace que marcar sea idempotente. La FK compuesta da `23503` si el hábito no existe, que se traduce en un 404 |
| `notes` | `save_note` (002), sin cambios |

**Validación** (`src/lib/validation.ts`):

- `habitCreate` y `taskCreate` añaden `id: uuidParam.optional()`.
- `habitUpdate` y `taskUpdate` no cambian: ya son parciales y rechazan un cuerpo vacío.

**Dominio** (`src/features/*/queries.ts`):

- `createHabit` y `createTask` devuelven `{ habit | task, created: boolean }`. El algoritmo está en
  research D2.
- `deleteHabit` y `deleteTask` no fallan si no hay fila.
- Función nueva: `listArchivedHabits(db)`.

---

## 2. Dispositivo: base IndexedDB `habitos-sin-conexion` (versión 1)

### 2.1 Almacén `cambios` (la cola)

Clave: `seq`, autoincremental. Índice: `userId`. El orden de envío es el de `seq` dentro de cada
`userId`.

| Campo | Tipo | Descripción |
|---|---|---|
| `seq` | number | Orden de la operación. Lo asigna IndexedDB y es estable |
| `userId` | uuid | Cuenta que hizo el cambio. Solo esa cuenta lo envía o lo muestra (FR-026) |
| `tipo` | enumeración | Ver la tabla de operaciones |
| `entityId` | uuid \| null | Hábito o tarea afectados. Vale `null` en `habit.reorder` |
| `datos` | objeto | Contenido según el tipo (ver abajo). Siempre ya validado con Zod en el cliente (FR-014) |
| `etiqueta` | string | Nombre o título del elemento cuando se hizo el cambio, para los avisos |
| `creadaEn` | number | `Date.now()` cuando se añadió |
| `enviando` | boolean | Se pone a `true` justo antes del primer `fetch`. Si está a `true`, la compactación no toca la operación |
| `intentos` | number | Fallos temporales seguidos. Sirve para calcular la espera |

**Operaciones**:

| `tipo` | `datos` | Petición (ver [contracts](contracts/api-v1-cola.md)) |
|---|---|---|
| `habit.create` | `{ name, description? }` | `POST /api/v1/habits` con `{ id, name, description }` |
| `habit.update` | `{ name?, description?, archived? }`, solo los campos cambiados | `PATCH /api/v1/habits/:id` |
| `habit.delete` | `{}` | `DELETE /api/v1/habits/:id` |
| `habit.log` | `{ day, done }` | `PUT` o `DELETE /api/v1/habits/:id/logs/:day` |
| `habit.reorder` | `{ ids: uuid[] }` (orden completo de los activos) | `PUT /api/v1/habits/reorder` |
| `task.create` | `{ title, note?, dueDate?, dueTime? }` | `POST /api/v1/tasks` con `{ id, … }` |
| `task.update` | `{ title?, note?, dueDate?, dueTime?, done? }`, solo los campos cambiados (fecha y hora van juntas) | `PATCH /api/v1/tasks/:id` |
| `task.delete` | `{}` | `DELETE /api/v1/tasks/:id` |

El diario **no** pasa por esta cola. Sigue en `localStorage` (`habitos:notas-pendientes:<userId>`,
feature 002), y cada día con texto sin guardar cuenta como un cambio pendiente.

**Reglas de compactación**: research D6, reglas 1 a 6. Invariantes:

- **I1**: dos elementos distintos mantienen entre sí el orden en que el usuario hizo los cambios.
- **I2**: una operación con `enviando: true` no se modifica ni se elimina, salvo al confirmarse o al
  descartarse.
- **I3**: después de compactar, el estado final que resulta de aplicar la cola es el mismo que antes
  (lo que el usuario ve).

**Ciclo de vida de una operación**:

```text
añadida ──(envío)──> enviando ──2xx──> borrada
   │                    │──404 / 4xx de negocio──> borrada + aviso (y cascada si era create)
   │                    │──red / 5xx / 408 / 429──> enviando (intentos+1, espera creciente)
   │                    └──401──> enviando (cola en pausa hasta que haya sesión)
   └──(compactación, solo si no está enviando)──> fusionada o eliminada
```

### 2.2 Almacén `copias` (última respuesta del servidor)

Clave: `[userId, vista]`.

| Campo | Tipo | Descripción |
|---|---|---|
| `userId` | uuid | Cuenta |
| `vista` | `'hoy'` \| `'tareas'` \| `'diario'` | Pantalla |
| `generadoEn` | ISO-8601 | Hora del servidor en que se generaron los datos. Se muestra la más reciente entre la copia y los *props* |
| `datos` | objeto | Los mismos *props* que la página pasa a su componente cliente (ver abajo) |

**Contenido de `datos` según la vista**:

- **`hoy`**: `{ today, timezone, habits: { id, name, description, position, done, streakBefore }[],
  archived: { id, name, description }[], reviewDue, reviewCompleted }`.
- **`tareas`**: `{ today, nowTime, pending: Task[], done: Task[] }`.
- **`diario`**: `{ today, monday, timezone, notes: { day, body, updated_at }[] }`.

Se borran al cerrar sesión (las de esa cuenta). No se borran por tiempo, porque el volumen es pequeño
(como mucho 100 hábitos, 500 tareas pendientes más 20 hechas y 7 notas).

### 2.3 Estado en memoria (no se guarda)

- **Estado de conexión**: `'con-conexion' | 'sin-conexion'`, a partir de `navigator.onLine` y del
  último fallo de red (research D9).
- **Estado de la cola**: `pendientes` (operaciones de la cola más días del diario),
  `sincronizando: boolean` y `enPausaPorSesion: boolean`.
- **Avisos de sincronización**: una lista de `{ id, texto }` que se cierra sola a los 6 s o al
  tocarla. Ejemplos de texto:
  - «La tarea “Comprar pan” se borró en otro dispositivo; tu cambio no se ha aplicado.»
  - «No se ha creado el hábito “Leer”: Has alcanzado el máximo permitido.»

  Las pestañas comparten la cola y los avisos por `BroadcastChannel('habitos-cola')`.

---

## 3. Dispositivo: cachés del service worker

| Caché | Contenido | Se borra |
|---|---|---|
| `habitos-estaticos-v1` | `/_next/static/*` usados por `/today`, `/tasks` y `/notes` | Al cambiar de versión. Al «calentar», se quitan los que ya no se usan |
| `habitos-paginas-v1` | Documento HTML de `/today`, `/tasks` y `/notes` (uno por ruta) | Al cambiar de versión, al cerrar sesión y al mostrar `/login` |
| `habitos-respaldo-v1` | `/sin-conexion.html`, iconos y manifiesto | Al cambiar de versión |

---

## 4. Relación con los requisitos

| Requisito | Dónde se cumple |
|---|---|
| FR-001, FR-002 y FR-006 | `copias`, `habitos-paginas-v1` y `/sin-conexion.html`, con las funciones de capa encima de `overlay.ts` |
| FR-012 y FR-018 | `cambios`: el cambio se escribe antes de darse por hecho y solo se borra al confirmarse o descartarse |
| FR-016 y FR-017 | Orden por `seq`, invariantes I1 e I2, idempotencia (research D2 y D3) |
| FR-020 | PATCH parcial y orden de llegada al servidor |
| FR-021 a FR-024 | Clasificación de respuestas (research D6) y `router.refresh()` |
| FR-026 a FR-029 | `userId` en `cambios` y `copias`, borrado de páginas al cerrar sesión y en `/login` |
