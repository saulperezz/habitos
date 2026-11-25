# Plan de implementación: Usar la app sin conexión

**Rama**: `005-sin-conexion` | **Fecha**: 2026-11-25 | **Especificación**: [spec.md](spec.md)

**Entrada**: especificación de `specs/005-sin-conexion/spec.md`. Solo se toca `saas/`.

## Resumen

La app de `saas/` arranca y funciona sin conexión en Hoy, Tareas y Diario. Se apoya en tres piezas,
todas sin dependencias nuevas:

1. **Service worker ampliado** (`public/sw.js`, conservando los avisos de la 004):
   - guarda en caché los recursos `/_next/static`;
   - guarda el documento de `/today`, `/tasks` y `/notes` con la estrategia «red primero»;
   - sirve `/sin-conexion.html` para el resto de pantallas.
2. **Copia local más pendientes encima**:
   - Cada vista guarda en IndexedDB los *props* que recibe del servidor.
   - Muestra la versión más reciente con los cambios pendientes aplicados encima.
   - Las páginas siguen siendo Server Components. La cabecera y la lista de Hoy, y la lista de
     Tareas, pasan a componentes cliente.
3. **Cola de cambios en IndexedDB, una por cuenta**:
   - Recoge los cambios de hábitos y tareas que no pueden ir por Server Action: sin conexión, con la
     cola no vacía o tras un fallo de red.
   - Compacta las operaciones redundantes y las envía en serie por `/api/v1` con `fetch`.
   - Usa un bloqueo Web Locks entre pestañas y reintenta con espera creciente.
   - El diario conserva su almacén de la 002 en `localStorage` y solo se integra en el contador.

En el servidor solo cambian tres cosas:

- **Altas idempotentes**: las altas aceptan un `id` generado en el cliente. Si ese `id` ya existe en
  la cuenta, devuelven la fila existente con un `200`.
- **Borrados idempotentes**: un borrado repetido responde `204`.
- **Hábitos archivados**: una consulta nueva para listarlos.

El cliente envía PATCH parciales, así que «gana el último cambio» se aplica campo a campo (Supuesto
de la spec ajustado). También se añade la interfaz que la spec exige y aún no existía: editar
tareas, y archivar y recuperar hábitos en una sección «Archivados».

Decisiones y alternativas: [research.md](research.md).

## Contexto técnico

**Lenguaje/versión**: TypeScript 6 (estricto), React 19, JavaScript plano en `public/sw.js`.

**Dependencias principales**: Next.js 16 App Router, `@supabase/ssr`, `@supabase/supabase-js`,
Zod 4 y Tailwind 4. **Sin dependencias nuevas.** Se usan IndexedDB, Cache Storage, Web Locks y
BroadcastChannel nativos (research D5).

**Almacenamiento**:

- Supabase Postgres sin cambios de esquema y **sin migración**.
- En el dispositivo, IndexedDB `habitos-sin-conexion` (almacenes `cambios` y `copias`), las cachés
  `habitos-*` del service worker y el `localStorage` del diario (002), que no cambia.

**Pruebas**: Vitest en Node.

- `tests/db.test.ts` (PGlite): idempotencia de altas y borrados, RLS y el disparador de límite.
- Pruebas unitarias nuevas de compactación, orden, traducción a peticiones, clasificación de
  errores, PATCH parcial y capa encima: `tests/offline-queue.test.ts`, `tests/offline-diff.test.ts`
  y `tests/offline-overlay.test.ts`.
- Prueba manual en la vista previa de Vercel según [quickstart.md](quickstart.md).

**Plataforma objetivo**: Safari iOS 16.4 o posterior como app de pantalla de inicio, Chromium
Android y escritorio. Despliegue en Vercel.

**Tipo de proyecto**: aplicación web Next.js (servidor y cliente en `saas/`).

**Objetivos de rendimiento**:

- Arranque sin conexión en menos de 3 s (SC-001).
- Respuesta a cada acción en menos de 100 ms (SC-004). La escritura en IndexedDB tarda unos pocos ms
  y no bloquea la actualización optimista.
- 50 cambios sincronizados en menos de 30 s (SC-003).

**Restricciones**:

- Pantallas de 360 a 430 px, modo oscuro y zonas táctiles de 44 px (FR-030).
- Sin Background Sync (iOS no lo tiene).
- Rate limit de 120 peticiones por minuto en `/api/v1`.
- No cambia el formato de exportación ni de importación (FR-031).

**Escala/alcance**:

- Como mucho 100 hábitos, unas 520 tareas visibles y 7 notas por copia.
- Colas de cientos de operaciones (una semana sin conexión).
- Tres pantallas sin conexión y cuatro que la necesitan.

## Comprobación de Constitución

*Puerta: debe superarse antes de la fase 0 y revisarse después de la fase 1.* Se comprueba contra la
constitución v3.1.0 (research D0: hoy solo está en la rama local `004-avisos-repaso`; respecto a la
3.0.1 de `master` cambia solo el principio II, que aquí no se usa).

| Principio | Estado | Cómo se cumple |
|---|---|---|
| **I. Next.js con lógica compartida** | ⚠️ justificado | Las páginas siguen siendo Server Components. Con conexión, la interfaz escribe con Server Actions. **Desviación**: los cambios que entran en la cola se envían por `/api/v1` con `fetch` («Seguimiento de complejidad», fila 1). Las acciones y las rutas siguen llamando a las mismas funciones de `features/*/queries.ts`, sin duplicar reglas. Nuevos componentes cliente: `TodayView`, `TasksView`, el proveedor y el aviso; usan API del navegador (fila 2). Sin dependencias nuevas |
| **II. Datos privados y seguros** | ✅ | RLS sin cambios. Se comprueba en `db.test.ts` que un `id` del cliente no permite tocar ni ver filas ajenas. Sin service role. La cola y las copias van por `userId`. La caché de páginas se borra al cerrar sesión y en `/login`. Nada sale a terceros |
| **III. Móvil primero** | ✅ | El aviso, los avisos de descarte, el diálogo y `/sin-conexion.html` se diseñan para 360-430 px, con zonas seguras, variables CSS, modo oscuro y zonas táctiles de 44 px |
| **IV. Integridad de datos** | ✅ | Cada cambio se escribe en IndexedDB antes de darse por hecho. Solo se borra al confirmarse o al descartarse por una regla explícita. Los `408` y `429` se reintentan (research D6). La idempotencia evita duplicados. El PATCH parcial no pisa otros campos. Cerrar sesión **no** borra la cola. El diario conserva su guardado síncrono por pulsación. Sin migración. Fechas: día natural en la zona del usuario (D11) |
| **V. Simplicidad (YAGNI)** | ⚠️ justificado | La cola, la capa encima y el SW con caché son complejidad nueva («Seguimiento de complejidad», filas 2 a 4). Para cada pieza se eligió la opción más simple que cumple la spec (research D5, D7 y D8). Sin tablas de idempotencia ni dependencias |
| Flujo y calidad | ✅ | Rama propia. CI completa (`lint`, `typecheck`, `test`, `build`). Las funciones que tocan la BD llevan prueba en `db.test.ts`. Prueba en móvil en la vista previa (quickstart §4) |
| Idioma | ✅ | Textos de interfaz y documentación en español (contracts/cliente-sin-conexion.md) |

**Resultado**: superada con desviaciones justificadas en I y V (filas 1 a 4 de «Seguimiento de
complejidad»). No hace falta enmendar la constitución.

### Revisión tras la fase 1

El diseño (data-model, contratos y quickstart) no introduce nada fuera de la tabla:

- no hay migración, así que no hace falta prueba de migración, pero sí pruebas de BD del
  comportamiento que se apoya en ella;
- no hay dependencias nuevas;
- no hay service role.

La desviación de I queda acotada: `/api/v1` solo se llama desde `lib/offline/sync.ts` (la cola) y
desde el `keepalive` ya existente del diario. Ningún componente llama a `/api/v1` directamente.
**Sigue superada.**

## Estructura del proyecto

### Documentación (esta funcionalidad)

```text
specs/005-sin-conexion/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones D0 a D14
├── data-model.md        # Fase 1: IndexedDB, cachés y cambios de validación
├── quickstart.md        # Fase 1: validación automática, de API, de navegador y a mano
├── contracts/
│   ├── api-v1-cola.md           # Altas y borrados idempotentes, PATCH parcial, trato de respuestas
│   └── cliente-sin-conexion.md  # SW, página de respaldo, avisos, diálogo e interfaz nueva
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Código fuente (`saas/`)

```text
saas/
├── public/
│   ├── sw.js                         # AMPLIADO: cachés versionadas, fetch, mensajes; push de la 004 intacto
│   └── sin-conexion.html             # NUEVO: página de respaldo estática
├── src/
│   ├── lib/
│   │   ├── validation.ts             # id opcional en habitCreate y taskCreate
│   │   └── offline/                  # NUEVO
│   │       ├── idb.ts                # Envoltorio de IndexedDB en promesas (cambios, copias)
│   │       ├── queue.ts              # PURO: tipos de operación, compactar(), aPeticion(), clasificar()
│   │       ├── diff.ts               # PURO: campos cambiados para el PATCH parcial
│   │       ├── overlay.ts            # PURO: aplicarPendientes a hoy, tareas y archivados; elegir copia
│   │       ├── sync.ts               # Envío en serie, Web Locks, espera creciente, BroadcastChannel
│   │       ├── connectivity.ts       # Estado de conexión (onLine, fallos, sonda /api/health)
│   │       └── client.ts             # Puerta única para escribir: Server Action o cola (research D1)
│   ├── features/
│   │   ├── habits/queries.ts         # createHabit idempotente, deleteHabit sin .single(), listArchivedHabits
│   │   ├── habits/actions.ts         # id en el alta, archived en la edición
│   │   ├── tasks/queries.ts          # createTask idempotente, deleteTask sin .single()
│   │   ├── tasks/actions.ts          # id en el alta
│   │   └── notes/pending-store.ts    # evento de cambio y recuento (sin cambiar el formato)
│   ├── app/
│   │   ├── api/v1/habits/route.ts    # 200 si ya existía y 201 si se creó
│   │   ├── api/v1/tasks/route.ts     # Igual
│   │   ├── (app)/layout.tsx          # OfflineProvider(userId), OfflineBanner y estado de la cabecera
│   │   ├── (app)/today/page.tsx      # Pasa datos y generadoEn a TodayView
│   │   ├── (app)/today/today-view.tsx      # NUEVO (cliente): cabecera, checklist, gestor, copia y pendientes
│   │   ├── (app)/today/habit-manager.tsx   # Edición parcial, Archivar, sección «Archivados»
│   │   ├── (app)/tasks/page.tsx      # Pasa datos a TasksView
│   │   ├── (app)/tasks/tasks-view.tsx      # NUEVO (cliente): listas con copia y pendientes
│   │   ├── (app)/notes/current-week.tsx    # Copia local y cambio de día sin conexión
│   │   ├── (app)/review/review-flow.tsx    # Desactivado sin conexión
│   │   ├── (app)/settings/*.tsx      # Exportar, importar, perfil, avisos y borrar cuenta desactivados sin conexión
│   │   └── (auth)/login/login-form.tsx     # Envía olvidar-paginas al montarse
│   └── components/
│       ├── offline-provider.tsx      # NUEVO: registra el SW, «calentar», contexto de conexión y cola
│       ├── offline-banner.tsx        # NUEVO: «Sin conexión · N…», «Sincronizando…», avisos
│       ├── needs-connection.tsx      # NUEVO: envoltorio desactivado con «Necesita conexión»
│       ├── habit-checklist.tsx       # Marcar a través de lib/offline/client
│       ├── task-form.tsx             # id del cliente, a través de lib/offline/client
│       ├── task-item.tsx             # Editar en línea, completar y borrar a través de lib/offline/client
│       ├── bottom-nav.tsx            # Calendario desactivado sin conexión
│       └── sign-out-button.tsx       # Diálogo con N pendientes; borra copias y páginas, no la cola
└── tests/
    ├── db.test.ts                    # Altas con id del cliente, mismo id dos veces, RLS, límite, borrado repetido
    ├── validation.test.ts            # id opcional
    ├── offline-queue.test.ts         # NUEVO
    ├── offline-diff.test.ts          # NUEVO
    └── offline-overlay.test.ts       # NUEVO
```

**Decisión de estructura**: un único proyecto Next.js en `saas/`, como en las funcionalidades
anteriores. Las piezas son estas:

- `src/lib/offline/` agrupa la lógica sin conexión. Los módulos puros (`queue`, `diff`, `overlay`)
  se separan de los que tocan el navegador (`idb`, `sync`, `connectivity`, `client`) para poder
  probarlos en Node.
- La lógica de dominio sigue en `features/*/queries.ts`.

## Seguimiento de complejidad

| # | Desviación o complejidad | Por qué hace falta | Alternativa más simple descartada |
|---|---|---|---|
| 1 | **Segundo camino de escritura**: la cola envía por `/api/v1` con `fetch`, aunque el principio I dice que la interfaz escribe con Server Actions | Una Server Action es una RPC ligada a la página y a su compilación: no se puede guardar, reenviar tras cerrar la app ni enviar desde otra pestaña o versión. `/api/v1` es un contrato HTTP estable con autenticación por cookie, errores con código y rate limit. Con conexión y la cola vacía se siguen usando Server Actions. Precedente: el `keepalive` del diario (002) | Todo por Server Actions: imposible sin conexión. Todo por `/api/v1`: viola el principio I sin necesidad. Enmendar la constitución: el usuario pidió no hacerlo |
| 2 | **Capa de datos en el cliente**: copias en IndexedDB, `TodayView` y `TasksView` como componentes cliente, y pendientes encima | FR-001 (últimos datos) y FR-002 (pendientes encima) no se cumplen solo con HTML en caché: el HTML se queda desfasado tras las Server Actions y es estático (research D7) | Solo HTML en caché (opción A): muestra datos viejos y no puede aplicar pendientes. RSC en caché (B): depende de detalles internos de Next. Capa completa en el cliente (C): reescribe mucho más |
| 3 | **Cola con compactación, bloqueo entre pestañas y espera creciente** | FR-012 y FR-015 a FR-018 (orden, exactamente una vez, reintentos automáticos) y el caso límite de las dos pestañas. Sin bloqueo se enviaría dos veces. Sin compactar, «crear y borrar» crearía algo que el usuario borró | Reintentar desde memoria: se pierde al cerrar. Background Sync: no existe en iOS. Tabla de idempotencia en el servidor: migración y limpieza sin necesidad (research D2 y D3) |
| 4 | **Service worker con caché y `fetch`** (la 004 era solo push) | Sin un SW que sirva el documento y el JS, la app no arranca sin conexión (FR-001 y SC-001) | Serwist, `next-pwa` o Workbox: dependencia y paso de compilación para un SW de unas 150 líneas (research D8) |
| 5 | **Dos almacenes de pendientes**: la cola en IndexedDB y el diario en `localStorage` | El diario guarda en cada pulsación. La escritura síncrona de `localStorage` es la que evita perder texto si la app se cierra de golpe (002). Moverlo a IndexedDB, que es asíncrono, abre una ventana de pérdida | Unificar el diario en la cola: más riesgo (principio IV) y repetir la validación de la 002 sin beneficio para la spec (research D5) |
