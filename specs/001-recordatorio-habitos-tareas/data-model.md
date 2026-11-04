# Modelo de datos (fase 1)

Todo se guarda en `localStorage` del dispositivo salvo la entidad «Suscripción de aviso», que vive
en Workers KV. Cada lectura/escritura va dentro de `try/catch` con copia en memoria como respaldo.

## Claves de `localStorage`

| Clave | Contenido | Estado |
|-------|-----------|--------|
| `habits` | Lista de **Hábito** | Existente, forma sin cambios |
| `habitos_esquema` | Número de versión del esquema (`2`) | Nueva |
| `habitos_config` | **Configuración del repaso** | Nueva |
| `habitos_repaso` | **Estado del repaso del día** | Nueva |
| `habitos_tareas` | Lista de **Tarea** | Nueva |

## Hábito (existente)

| Campo | Tipo | Reglas |
|-------|------|--------|
| `id` | número | Único; `Date.now()` al crearlo |
| `name` | texto | Obligatorio, 1–40 caracteres tras recortar espacios |
| `description` | texto | Opcional, ≤120 caracteres |
| `history` | objeto `{ "AAAA-MM-DD": true }` | Presencia de la clave = cumplido ese día |

- Orden de la lista = orden de las preguntas del repaso (FR-002).
- Al eliminar un hábito desaparece de los detalles de días pasados (caso límite).

## Configuración del repaso (`habitos_config`)

| Campo | Tipo | Reglas / valor por defecto |
|-------|------|----------------------------|
| `version` | número | `1` |
| `repasoActivo` | booleano | `true` |
| `hora` | texto `HH:MM` | `"22:00"`; 00:00–23:59 |
| `zonaHoraria` | texto IANA | `"Europe/Madrid"` |
| `avisos` | enumerado | `no-solicitado` \| `concedido` \| `denegado` \| `no-soportado` |
| `endpointRegistrado` | texto o `null` | `endpoint` enviado al worker, para actualizarlo o darlo de baja |

Transiciones de `avisos`:

```text
no-soportado  (sin Push API o iOS sin instalar; se reevalúa en cada arranque)
no-solicitado ──pulsar «Activar avisos»──► concedido | denegado
concedido ──desactivar en Ajustes──► no-solicitado (se da de baja en el worker)
denegado ──el usuario lo cambia en Ajustes del sistema y reabre la app──► concedido
```

Si `repasoActivo` es `false`, no se ofrece el repaso al abrir y se da de baja la suscripción.

## Estado del repaso del día (`habitos_repaso`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| `version` | número | `1` |
| `fecha` | `AAAA-MM-DD` | Día del repaso (regla de las 04:00, research D7) |
| `respuestas` | objeto `{ [idHábito]: "si" \| "no" }` | «Saltar» no se guarda |
| `completado` | booleano | `true` al llegar al final del repaso |
| `avisoCanceladoEnviado` | booleano | `true` tras `POST /suscripcion/hecho` con éxito |

Transiciones:

```text
(sin estado o fecha ≠ día del repaso) ──iniciar──► en curso
en curso ──responder Sí/No──► en curso (se añade a respuestas; Sí marca history[fecha])
en curso ──salir a mitad──► en curso (se conserva; se ofrece «Continuar repaso»)
en curso ──último hábito──► completado (resumen «X de Y cumplidos»)
completado ──iniciar manualmente──► en curso (solo pregunta los no respondidos o todos si se elige «Repetir»)
```

- **Ofrecer al abrir** (FR-004): `repasoActivo` ∧ hay ≥1 hábito ∧ hora local ≥ `hora` ∧
  ¬(`fecha` = día del repaso ∧ `completado`).
- Si hay hábitos nuevos sin respuesta tras completar, no se relanza solo (caso límite).

## Tarea (`habitos_tareas`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| `id` | número | Único |
| `titulo` | texto | Obligatorio, 1–80 caracteres tras recortar |
| `nota` | texto | Opcional, ≤200 caracteres |
| `fecha` | `AAAA-MM-DD` o `null` | Opcional |
| `hora` | `HH:MM` o `null` | Solo si hay `fecha`; con hora se muestra como «evento» (FR-015) |
| `hecha` | booleano | `false` al crear |
| `creadaEn` | marca de tiempo | Al crear |
| `hechaEn` | marca de tiempo o `null` | Al marcar como hecha; `null` al desmarcar |

Reglas derivadas:

- **Vencida**: `¬hecha ∧ fecha ≠ null ∧ (fecha < hoy ∨ (fecha = hoy ∧ hora ≠ null ∧ hora < ahora))`.
- **Orden pendientes** (FR-012): por `fecha`, luego `hora` (sin hora antes que con hora del mismo
  día), luego `creadaEn`; las que no tienen fecha, al final.
- **Completadas**: apartado aparte, ordenadas por `hechaEn` descendente.
- **Indicador del calendario** (FR-014): un día tiene indicador si existe ≥1 tarea con esa `fecha` y
  `¬hecha`.

## Suscripción de aviso (Workers KV, clave única `suscripciones`)

| Campo | Tipo | Reglas |
|-------|------|--------|
| `endpoint` | URL | Identificador; dominio de un servicio de push conocido |
| `hora` | `HH:MM` | Igual que en la configuración |
| `zonaHoraria` | texto IANA | Igual que en la configuración |
| `ultimoEnvio` | `AAAA-MM-DD` o `null` | Fecha local del último aviso enviado o cancelado |
| `creadaEn` | marca de tiempo | Al registrar |

- Máximo 10 elementos. No se guarda ningún otro dato (FR-003b).
- Se elimina al darse de baja o si el servicio de push responde 404/410.

## Migración v1 → v2

1. Si `habitos_esquema` no existe: leer `habits` (si falla o no existe → lista vacía, sin
   sobrescribir), no modificar su contenido, crear `habitos_config` con valores por defecto, crear
   `habitos_tareas = []` y escribir `habitos_esquema = 2`.
2. Si `habitos_esquema = 2`: no hacer nada.
3. Ninguna migración borra ni reescribe `habits` (FR-018, SC-005).
