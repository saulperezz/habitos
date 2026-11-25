# Guía de validación: Usar la app sin conexión

**Funcionalidad**: `005-sin-conexion`

Las rutas son relativas a `saas/`. Contratos: [api-v1-cola.md](contracts/api-v1-cola.md) y
[cliente-sin-conexion.md](contracts/cliente-sin-conexion.md). Modelo: [data-model.md](data-model.md).

## 0. Requisitos previos

- La rama `005-sin-conexion` incluye `origin/master`, con la 004 (research D0).
- `npm ci` en `saas/` y `.env.local` como en el README.
- Para las pruebas a mano:
  - un iPhone con la app añadida a la pantalla de inicio y un móvil Android, contra la URL de vista
    previa de Vercel de la rama;
  - una segunda cuenta;
  - un segundo navegador o dispositivo para los conflictos.

## 1. Pruebas automáticas

```bash
cd saas
npm run lint && npm run typecheck && npm test && npm run build
```

Resultado esperado: todo en verde. En `npm test` deben aparecer y pasar estas pruebas:

| Archivo | Comprueba |
|---|---|
| `tests/db.test.ts` | El alta con `id` del cliente. El mismo `id` dos veces deja **una** fila. Otro usuario no puede usar ese `id` ni ver la fila. `enforce_row_limit` sigue limitando. Un borrado repetido no da error. Marcar un hábito inexistente da `23503` |
| `tests/validation.test.ts` | `habitCreate` y `taskCreate` aceptan un `id` uuid y rechazan uno inválido |
| `tests/offline-queue.test.ts` | Las reglas de compactación 1 a 6 y que no se toca lo que está `enviando`. El orden por `seq`. La traducción de operación a petición. La clasificación de respuestas, incluidos `408` y `429` como temporales |
| `tests/offline-diff.test.ts` | El PATCH parcial: solo los campos cambiados, con fecha y hora juntas |
| `tests/offline-overlay.test.ts` | Los pendientes encima de los datos y el cambio de día |

## 2. API (vista previa o `npm run dev`, con la cookie de sesión de un navegador)

```bash
ID=$(node -e "console.log(crypto.randomUUID())")
# 1.ª vez → 201; 2.ª vez → 200 con el mismo id, y GET /api/v1/habits lo lista una sola vez
curl -i -X POST "$URL/api/v1/habits" -H "cookie: $COOKIE" -H 'content-type: application/json' \
  --data "{\"id\":\"$ID\",\"name\":\"Prueba idempotente\"}"
# Se borra dos veces → 204 y 204
curl -i -X DELETE "$URL/api/v1/habits/$ID" -H "cookie: $COOKIE"
# PATCH sobre el borrado → 404 not_found
curl -i -X PATCH "$URL/api/v1/habits/$ID" -H "cookie: $COOKIE" -H 'content-type: application/json' --data '{"name":"x"}'
```

Repetir con `/api/v1/tasks` y `{ "id", "title" }`. Con la cookie de la **otra** cuenta, el mismo `id`
que ya existe en la primera → `409`.

## 3. Navegador (DevTools → Application y Network → Offline)

1. **Service worker**: abrir `/today` con conexión. `sw.js` aparece activo y existen las cachés
   `habitos-estaticos-v1`, `habitos-paginas-v1` (`/today`, `/tasks`, `/notes` tras «calentar») y
   `habitos-respaldo-v1`. Un aviso de prueba de la 004 (Ajustes → «Enviar aviso de prueba») sigue
   llegando y abre el repaso.
2. **Arranque sin conexión**: activar Offline y recargar `/today`, `/tasks` y `/notes`. Se ven los
   datos y «Sin conexión». Cambiar de pestaña con la barra inferior: sin pantallas en blanco.
   **Aquí se comprueba la premisa de research D8**: una petición RSC fallida hace una navegación
   completa. Si no es así, aplicar el respaldo de `BottomNav`.
3. **Secciones con conexión**: estando Offline, Calendario y Ajustes aparecen desactivados con
   «Necesita conexión». Abrir `/review` por URL muestra «Esta sección necesita conexión».
4. **Primera vez**: con otra cuenta recién entrada, abrir solo `/today`. Borrar
   `habitos-paginas-v1` → `/tasks`, sin conexión, muestra «… aún no se ha abierto con conexión…».
5. **Dos pestañas**: con 5 cambios pendientes y dos pestañas abiertas, volver a Online. En Network se
   ve cada petición **una vez** y en orden.
6. **Wifi sin internet**: con DevTools → Network → «Block request URL» `*/api/*`, marcar un hábito.
   Aparece «Sin conexión · 1 cambio pendiente». Al quitar el bloqueo, se sincroniza solo.
7. **429**: lanzar más de 120 cambios seguidos sin conexión y reconectar. Se ven `429`, la cola
   espera y termina sin descartar nada.

## 4. Escenarios de aceptación a mano (móvil, 360-430 px, claro y oscuro)

| # | Historia | Pasos | Resultado esperado |
|---|---|---|---|
| A | 1 | Abrir Hoy, Tareas y Diario con conexión. Cerrar la app. Modo avión. Abrirla desde el icono | En menos de 3 s se ven los datos y «Sin conexión» (SC-001) |
| B | 1 | Quitar la conexión con la app abierta | El aviso aparece sin recargar |
| C | 2 | Modo avión: marcar 2 hábitos, crear una tarea, completarla y editar otra (título y fecha). Cerrar la app. Desactivar el modo avión y abrirla | Se ve «Sincronizando…» y luego nada. En el segundo dispositivo aparece todo una sola vez |
| D | 2 | Modo avión: crear una tarea y borrarla. Reconectar | No llega a existir en el servidor |
| E | 2 | Modo avión: marcar y desmarcar el mismo hábito 5 veces. Reconectar | Queda el último estado visto |
| F | 2 | Con 10 cambios, reconectar y cortar la conexión a mitad. Volver a conectar | Sin duplicados ni pérdidas (SC-005) |
| G | 3 | Modo avión, abrir desde el icono: escribir en el día de hoy del diario. Cerrar. Abrir con conexión | El texto está en el otro dispositivo. Mientras tanto contaba como «1 cambio pendiente» |
| H | 3 | Cambiar la nota de hoy en B. Escribir sin conexión en A. Reconectar A | Fusión de la 002 con aviso. No se pierde texto |
| I | 4 | Modo avión: crear un hábito, marcarlo, renombrarlo, subirlo al primer puesto y archivar otro. Reconectar | En el otro dispositivo: el nuevo, marcado, con su nombre final y primero. El otro, en «Archivados» |
| J | 4 | Recuperar desde «Archivados» con y sin conexión | Vuelve a la lista de Hoy |
| K | 5 | Borrar una tarea en B. Editarla sin conexión en A. Reconectar A | Aviso «La tarea “…” se borró en otro dispositivo…». El resto se aplica y el contador llega a 0 (SC-006) |
| L | 5 | Con 99 hábitos en B, crear 2 sin conexión en A. Reconectar | Uno se crea. El otro se rechaza con el aviso del límite y desaparece de la lista |
| M | 5 | Editar en A el título de una tarea y en B su nota, ambos sin conexión. Reconectar los dos | Se conservan **los dos** cambios (PATCH parcial) |
| N | 6 | Sin conexión, marcar un hábito y pulsar «Cerrar sesión» | El diálogo dice «Tienes 1 cambio sin enviar…» y se puede cancelar |
| O | 6 | Confirmar. Entrar con otra cuenta con conexión | No ve los datos ni el cambio de la primera (SC-007) |
| P | 6 | Volver a entrar con la primera cuenta | El cambio pendiente se envía solo |
| Q | Casos límite | Con la app sin conexión pasada la medianoche (o cambiando la hora del sistema) | Hoy muestra el nuevo día sin marcar. Lo marcado ayer queda en ayer |
| R | Casos límite | En iPhone como app de pantalla de inicio, repetir C, G y P 20 veces en total (SC-002) | El 100 % llega una sola vez |
| S | Rendimiento | Con 50 cambios mezclados de hábitos, tareas y diario, reconectar | Todo sincronizado en menos de 30 s (SC-003) |

Cada acción sin conexión debe reflejarse en pantalla sin retraso perceptible (SC-004).
