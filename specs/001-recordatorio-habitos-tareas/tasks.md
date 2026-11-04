---

description: "Lista de tareas para implementar la funcionalidad"
---

# Tareas: Recordatorio diario de hábitos, lista de tareas y agenda en el calendario

**Entrada**: documentos de diseño en `specs/001-recordatorio-habitos-tareas/`

**Requisitos previos**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Pruebas**: la especificación no pide pruebas automatizadas y la constitución prohíbe gestores de
paquetes en el cliente; la verificación es manual con [quickstart.md](./quickstart.md) al final de
cada historia.

**Organización**: las tareas se agrupan por historia de usuario para poder implementar y probar
cada una por separado.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede hacer en paralelo (archivo distinto y sin dependencias pendientes). Casi todo
  vive en `index.html`, así que solo llevan [P] las tareas de `sw.js`, `manifest.webmanifest`,
  `iconos/` y `notificaciones/`.
- **[Historia]**: US1–US5, según [spec.md](./spec.md).
- Rutas relativas a la raíz del repositorio.

---

## Fase 1: Preparación (infraestructura compartida)

**Propósito**: archivos nuevos que exige la plataforma y esqueleto del worker.

- [X] T001 Crear la rama de git `001-recordatorio-habitos-tareas` desde `master` y las carpetas `iconos/` y `notificaciones/` en la raíz del repositorio
- [X] T002 [P] Crear `iconos/icono-192.png` (192×192), `iconos/icono-512.png` (512×512) y `iconos/apple-touch-icon.png` (180×180): fondo `#0f0f13`, círculo `#7c6af7` y una marca ✓ blanca; generarlos con un script temporal fuera del repositorio (p. ej. PowerShell + System.Drawing en la carpeta temporal), sin añadir dependencias al proyecto
- [X] T003 [P] Crear `manifest.webmanifest` con exactamente el JSON de `specs/001-recordatorio-habitos-tareas/contracts/service-worker.md` (`name` «Mis Hábitos», `short_name` «Hábitos», `lang` «es», `start_url`/`scope` `./`, `display` `standalone`, colores `#0f0f13`, iconos 192 y 512)
- [X] T004 [P] Crear `notificaciones/wrangler.toml` con `name = "habitos-avisos"`, `main = "worker.js"`, `compatibility_date` actual, `[triggers] crons = ["* * * * *"]`, un `[[kv_namespaces]]` con `binding = "SUSCRIPCIONES"` (id a rellenar al desplegar) y `[vars]` `VAPID_CLAVE_PUBLICA`, `VAPID_SUJETO`, `ORIGEN_PERMITIDO = "https://saulperezz.github.io"`; `VAPID_CLAVE_PRIVADA` se documenta como *secret*, nunca en el archivo

---

## Fase 2: Base (requisitos que bloquean todas las historias)

**Propósito**: almacenamiento, migración, fechas y navegación comunes en `index.html`.

**⚠️ CRÍTICO**: ninguna historia puede empezar hasta terminar esta fase.

- [X] T005 Sustituir `today()` y `dateStr()` en `index.html` por una única función `claveFecha(fecha = new Date())` que devuelva `AAAA-MM-DD` en `Europe/Madrid` (con `toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })`), y usarla en `calcStreak`, `render`, `toggle`, `openDetail` y `renderCalendar` (research D8); mantener `today()` como alias de `claveFecha()` si simplifica el cambio
- [X] T006 Añadir en `index.html` helpers genéricos `leerJSON(clave, porDefecto)` y `guardarJSON(clave, valor)` con `try/catch` y copia en memoria por clave (generaliza el `_mem` actual), y reescribir `load()`/`save()` de `habits` sobre ellos sin cambiar la clave `habits` ni la forma `{ id, name, description, history }`
- [X] T007 Implementar `migrar()` en `index.html` según «Migración v1 → v2» de `data-model.md`: si no existe `habitos_esquema`, crear `habitos_config` = `{ version: 1, repasoActivo: true, hora: "22:00", zonaHoraria: "Europe/Madrid", avisos: "no-solicitado", endpointRegistrado: null }`, `habitos_tareas = []` y `habitos_esquema = 2`; nunca reescribir ni borrar `habits`; llamarla antes del primer `render()`
- [X] T008 Añadir en `index.html` las funciones de acceso `leerConfig()`/`guardarConfig()`, `leerTareas()`/`guardarTareas()` y `leerRepaso()`/`guardarRepaso()` sobre las claves `habitos_config`, `habitos_tareas` y `habitos_repaso`
- [X] T009 Añadir en `index.html` la barra de pestañas inferior fija «Hábitos» | «Tareas» (botones reales, ≥44×44 px, `padding-bottom: env(safe-area-inset-bottom)`), un contenedor `<main>` por pestaña (`#vistaHabitos` con la lista actual y `#vistaTareas` vacío), estado `pestañaActiva`, y adaptar el título de la cabecera y la acción del botón «+» (`.fab`) a la pestaña activa; subir el `.fab` y el `padding-bottom` del `body` para que no tapen la barra
- [X] T010 Añadir en `index.html` un componente reutilizable de hoja inferior (abrir/cerrar, cierre al tocar el fondo, asa superior) basado en el patrón de `#detailOverlay`/`#calOverlay`, para usarlo en repaso, ajustes, detalle del día y formulario de tarea

**Punto de control**: la app abre con datos antiguos intactos (quickstart pasos 1 y 2) y con pestañas.

---

## Fase 3: Historia 1 - Repaso diario de hábitos, uno por uno (Prioridad: P1) 🎯 MVP

**Objetivo**: repaso hábito por hábito, ofrecido al abrir tras la hora y anunciado con una
notificación del sistema aunque la app esté cerrada.

**Prueba independiente**: quickstart pasos 3, 4, 5, 6 y 7.

### Repaso dentro de la app

- [X] T011 [US1] Implementar en `index.html` `diaRepaso(ahora = new Date())`: fecha local `Europe/Madrid`, y si la hora local es anterior a las 04:00 devuelve el día anterior (research D7)
- [X] T012 [US1] Implementar en `index.html` la lógica del repaso sobre `habitos_repaso` = `{ version: 1, fecha, respuestas: { [idHábito]: "si" | "no" }, completado, avisoCanceladoEnviado }`: iniciar (si `fecha` ≠ `diaRepaso()` crear estado nuevo), `pendientes()` = hábitos en el orden de la lista sin respuesta, `responder(id, "si")` → guardar respuesta y `history[fecha] = true`, `responder(id, "no")` → guardar respuesta sin tocar `history` (no desmarca), «Saltar» → no guarda nada (research D6), y marcar `completado = true` al no quedar pendientes
- [X] T013 [US1] Crear en `index.html` la vista Repaso a pantalla completa según `contracts/interfaz.md`: progreso «N de M» con barra, tarjeta con nombre, descripción y etiqueta «Ya marcado» si `history[fecha]`, botones «Sí, cumplido» (primario), «No» y «Saltar» (≥44 px), «✕ Salir» que conserva respuestas, y pantalla final «X de Y cumplidos» con la lista de cumplidos y botón «Volver»; cada respuesta llama a `render()` para actualizar lista, barra, rachas y calendario en <100 ms (FR-005)
- [X] T014 [US1] Añadir en la cabecera de la pestaña Hábitos de `index.html` el botón «Hacer repaso» (o «Continuar repaso» si hay estado del día sin completar con respuestas) que abre el repaso en cualquier momento (FR-006, FR-007); si el repaso ya está completado, abrirlo pregunta solo por hábitos sin respuesta o ofrece «Repetir»
- [X] T015 [US1] Implementar en `index.html` la oferta al abrir (FR-004): al cargar y en `visibilitychange` a visible, si `repasoActivo` ∧ hay ≥1 hábito ∧ hora local ≥ `hora` ∧ ¬(`fecha` = `diaRepaso()` ∧ `completado`), mostrar la hoja «Es hora del repaso de hoy» con «Empezar» / «Ahora no»; «Ahora no» no vuelve a preguntar hasta la próxima apertura; sin hábitos no se ofrece
- [X] T016 [US1] Crear en `index.html` la hoja «Ajustes del recordatorio» (botón de campana en la cabecera): interruptor «Repaso diario» (`repasoActivo`) y `input type="time"` para `hora` (validar `HH:MM` 00:00–23:59), guardando en `habitos_config`
- [X] T017 [US1] Corregir en `index.html` los textos visibles existentes del flujo de hábitos al español con tildes: «Mis Hábitos», «Nuevo hábito», «Nombre del hábito», «Descripción (opcional)», «Agrega tu primer hábito con el botón +», «Escribe un nombre para el hábito», «Sin racha aún», «día(s) seguido(s)»

### Notificación del sistema (service worker y worker)

- [X] T018 [P] [US1] Crear `sw.js` en la raíz según `contracts/service-worker.md`: `install` → `skipWaiting()`, `activate` → `clients.claim()`, `push` → siempre `showNotification("Habitos", { body: "¿Qué tal hoy? Haz el repaso de tus hábitos", tag: "repaso-diario", icon: "iconos/icono-192.png" })` ignorando `event.data`, `notificationclick` → enfocar ventana existente y enviarle `{ tipo: "abrir-repaso" }` o abrir `./?repaso=1`; sin caché
- [X] T019 [P] [US1] Crear `notificaciones/worker.js` (módulo ES, sin npm) con el enrutado HTTP de `contracts/api-notificaciones.md`: CORS limitado a `ORIGEN_PERMITIDO` y `OPTIONS`; `GET /clave-publica` → `{ clavePublica }`; `PUT /suscripcion`, `POST /suscripcion/hecho` y `DELETE /suscripcion` sobre la clave KV única `suscripciones`; cuerpo ≤2 KB; rechazar con `400` cualquier campo no listado; `endpoint` `https://` en `*.push.apple.com`, `fcm.googleapis.com`, `*.notify.windows.com` o `updates.push.services.mozilla.com`; `hora` con `^([01]\d|2[0-3]):[0-5]\d$`; `zonaHoraria` aceptada por `Intl.DateTimeFormat`; máximo 10 suscripciones (`409`); errores `{ "error": "<mensaje en español>" }`; guardar solo `endpoint`, `hora`, `zonaHoraria`, `ultimoEnvio`, `creadaEn`
- [X] T020 [US1] Añadir en `notificaciones/worker.js` la firma VAPID con Web Crypto: importar `VAPID_CLAVE_PRIVADA` (JWK, ECDSA P-256), crear JWT ES256 con `aud` = origen del `endpoint`, `exp` ≤ 12 h, `sub` = `VAPID_SUJETO`, codificación base64url, y la cabecera `Authorization: vapid t=<JWT>, k=<VAPID_CLAVE_PUBLICA>`
- [X] T021 [US1] Añadir en `notificaciones/worker.js` el manejador `scheduled` (cron cada minuto): leer `suscripciones` una vez, para cada una calcular fecha y hora locales con `Intl.DateTimeFormat` en su `zonaHoraria`; si hora local ≥ `hora` y `ultimoEnvio` ≠ fecha local, enviar `POST` sin cuerpo al `endpoint` con `TTL: 3600`, `Urgency: high` y la cabecera VAPID; `201` → `ultimoEnvio = fecha local`; `404`/`410` → eliminar la suscripción; otros errores → reintentar el minuto siguiente; escribir KV solo si hubo cambios (research D4)
- [X] T022 [P] [US1] Crear `notificaciones/LEEME.md` en español: crear cuenta gratuita de Cloudflare, generar el par de claves VAPID (JWK privada + clave pública base64url) con un fragmento de Web Crypto ejecutable en la consola del navegador, crear el KV `SUSCRIPCIONES`, configurar `wrangler.toml`, guardar el *secret* `VAPID_CLAVE_PRIVADA`, desplegar (panel de Cloudflare o `npx wrangler deploy`), y comprobar con los `curl` del paso 5 de `quickstart.md`
- [X] T023 [US1] Añadir en `<head>` de `index.html` `<link rel="manifest" href="manifest.webmanifest">` y `<link rel="apple-touch-icon" href="iconos/apple-touch-icon.png">`, y registrar `sw.js` con `navigator.serviceWorker.register('./sw.js')` si la API existe
- [X] T024 [US1] Añadir en `index.html` la constante `URL_AVISOS` (URL del worker desplegado) y funciones `activarAvisos()` / `desactivarAvisos()`: detectar soporte (`PushManager` y, en iOS, `navigator.standalone`) → si no, `avisos = "no-soportado"`; pedir permiso solo desde el clic en «Activar avisos»; obtener `GET /clave-publica`, `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`, `PUT /suscripcion` con solo `{ endpoint, hora, zonaHoraria }`, guardar `avisos = "concedido"` y `endpointRegistrado`; permiso rechazado → `avisos = "denegado"`; desactivar → `DELETE /suscripcion`, `unsubscribe()`, `avisos = "no-solicitado"`, `endpointRegistrado = null`
- [X] T025 [US1] Completar la hoja de Ajustes en `index.html` con el estado de avisos y los textos de `contracts/interfaz.md` para `no-solicitado`, `concedido`, `denegado` y `no-soportado`; al cambiar `hora` o `repasoActivo` con avisos concedidos, llamar a `PUT /suscripcion` o a `desactivarAvisos()`; ante cualquier error de red mostrar «No se pudo programar el aviso. Te preguntaremos al abrir la app.» sin bloquear la app (FR-003c)
- [X] T026 [US1] Implementar en `index.html` la sincronización al arrancar: con `avisos = "concedido"`, si `pushManager.getSubscription()` es `null` o su `endpoint` ≠ `endpointRegistrado`, volver a suscribirse y llamar a `PUT /suscripcion`; si `Notification.permission` ya es `granted` y el estado era `denegado`, pasar a `concedido` (research R2)
- [X] T027 [US1] Implementar en `index.html` la apertura desde la notificación: al cargar con `?repaso=1` o al recibir `{ tipo: "abrir-repaso" }` por `navigator.serviceWorker`, abrir el repaso o, si está `completado`, mostrar «El repaso de hoy ya está hecho» con el resumen; después limpiar la URL con `history.replaceState`
- [X] T028 [US1] Implementar en `index.html` el aviso de repaso hecho: al marcar `completado` con `avisos = "concedido"`, enviar `POST /suscripcion/hecho` con `{ endpoint, fecha }`, guardar `avisoCanceladoEnviado = true` si responde `200`, volver a registrar con `PUT /suscripcion` si responde `404`, e ignorar errores de red (research D5)

**Punto de control**: historia 1 completa y verificable sola (quickstart 3–7).

---

## Fase 4: Historia 2 - Ver qué hábitos se cumplieron cada día (Prioridad: P1)

**Objetivo**: al tocar un día del calendario se ven los hábitos cumplidos y no cumplidos.

**Prueba independiente**: quickstart paso 8.

- [X] T029 [US2] Hacer tocables (como botones accesibles, ≥44 px) todas las celdas de día de `renderCalendar()` en `index.html` y abrir con ellas una hoja «detalle del día» con el título de la fecha en español (p. ej. «martes, 4 de noviembre»)
- [X] T030 [US2] Rellenar en `index.html` la sección «Hábitos» del detalle del día para días ≤ hoy: cada hábito actual con ✓ si `history[fecha]` o ○ si no, y el mensaje «Ningún hábito cumplido este día» si ninguno; los hábitos eliminados no aparecen (FR-008)

**Punto de control**: historias 1 y 2 funcionan por separado.

---

## Fase 5: Historia 3 - Lista de tareas pendientes (Prioridad: P2)

**Objetivo**: pestaña «Tareas» con alta, edición, marcado, borrado, orden y vencidas.

**Prueba independiente**: quickstart paso 9 (puntos 1, 2, 4 y 5).

- [X] T031 [US3] Implementar en `index.html` la lógica de tareas sobre `habitos_tareas`: crear con `{ id, titulo, nota, fecha, hora, hecha: false, creadaEn, hechaEn: null }`; validar `titulo` «Obligatorio, 1–80 caracteres tras recortar», `nota` «Opcional, ≤200 caracteres», `fecha` `AAAA-MM-DD` o `null`, `hora` `HH:MM` o `null` y «Solo si hay `fecha`»; editar, eliminar y alternar `hecha` (fijando `hechaEn` o volviéndolo `null`)
- [X] T032 [US3] Implementar en `index.html` `esVencida(tarea)` = `¬hecha ∧ fecha ≠ null ∧ (fecha < hoy ∨ (fecha = hoy ∧ hora ≠ null ∧ hora < ahora))` y el orden de pendientes por `fecha`, luego `hora` (sin hora antes que con hora del mismo día), luego `creadaEn`, sin fecha al final; completadas por `hechaEn` descendente (FR-012)
- [X] T033 [US3] Renderizar en `#vistaTareas` de `index.html` las secciones «Vencidas» (resaltadas), «Próximas», «Sin fecha» y «Completadas» (plegable), cada fila con casilla para marcar, título escapado con `escHtml`, fecha/hora corta en español («mar 5 nov, 18:30»), icono de evento si tiene hora, toque en la fila para editar y botón eliminar; estado vacío «No tienes tareas pendientes»
- [X] T034 [US3] Crear en `index.html` el formulario de tarea en hoja inferior (alta y edición), abierto con «+» en la pestaña Tareas: campos «Título» (`maxlength="80"`), «Nota» (`maxlength="200"`), «Fecha» (`input type="date"`, opcional) y «Hora» (`input type="time"`, solo habilitada con fecha); error «Escribe un título para la tarea» con la animación de error existente

**Punto de control**: historia 3 funciona por separado.

---

## Fase 6: Historia 4 - Tareas y eventos en el calendario (Prioridad: P2)

**Objetivo**: añadir tareas desde cualquier día del calendario y ver indicadores de pendientes.

**Prueba independiente**: quickstart paso 9 (puntos 3 y 4). Depende de T031–T034 (modelo y
formulario de tareas) y de T029 (detalle del día).

- [X] T035 [US4] Cambiar `renderCalendar()` en `index.html` para que los días futuros también sean tocables y muestren un punto indicador cuando exista ≥1 tarea con esa `fecha` y `¬hecha`, además del estado de hábitos actual en días ≤ hoy; mantener la navegación a meses futuros (FR-014)
- [X] T036 [US4] Añadir al detalle del día en `index.html` la sección «Tareas y eventos» (tareas de esa fecha, con casilla para marcarlas) y el botón «Añadir tarea» que abre el formulario de T034 con la fecha ya rellenada; al guardar, refrescar el detalle, el calendario y la pestaña Tareas (FR-013, FR-015)

**Punto de control**: historias 1–4 funcionan y se integran.

---

## Fase 7: Historia 5 - Aplicación y documentación íntegramente en español (Prioridad: P3)

**Objetivo**: ningún texto ni documento fuera del español (el código conserva sus nombres).

**Prueba independiente**: quickstart paso 10.

- [X] T037 [US5] Revisar todos los textos visibles, `placeholder`, `aria-label`, `title`, mensajes de error y nombres de meses/días en `index.html`, `sw.js` y `manifest.webmanifest` y corregir cualquier texto en otro idioma o sin tildes (FR-016)
- [X] T038 [P] [US5] Revisar que `notificaciones/LEEME.md`, `.specify/memory/constitution.md` y todos los archivos de `specs/001-recordatorio-habitos-tareas/` estén en español y traducir lo que no lo esté (FR-017); quitar el comentario del informe de impacto de `.specify/memory/constitution.md` antes de confirmar

---

## Fase 8: Pulido y aspectos transversales

**Propósito**: mejoras que afectan a varias historias.

- [X] T039 Revisar accesibilidad en `index.html`: todos los elementos interactivos nuevos son `<button>`/`<input>` con etiqueta accesible y zona táctil ≥44×44 px; las hojas se cierran con Escape en escritorio
- [X] T040 Revisar en `index.html` el diseño a 360 px y 430 px: sin desplazamiento horizontal, zonas seguras respetadas en cabecera, barra de pestañas, repaso y hojas
- [X] T041 Comprobar que no hay errores en consola con almacenamiento vacío y en navegación privada, y que la app es interactiva en <1 s (principio III / restricciones técnicas)
- [ ] T042 Ejecutar los 10 pasos de `specs/001-recordatorio-habitos-tareas/quickstart.md` en escritorio (ancho móvil) y en un iPhone real; si el paso 6 falla por el *push* sin contenido, aplicar el plan B de research D3 en `notificaciones/worker.js` y `sw.js`
- [ ] T043 Publicar en GitHub Pages (`master` → `https://saulperezz.github.io/habitos/`) tras fusionar la rama, y fijar `URL_AVISOS` en `index.html` con la URL definitiva del worker

---

## Dependencias y orden de ejecución

### Dependencias entre fases

- **Preparación (fase 1)**: sin dependencias.
- **Base (fase 2)**: depende de la fase 1; **bloquea todas las historias**.
- **Historias (fases 3–7)**: dependen de la fase 2.
- **Pulido (fase 8)**: depende de las historias que se quieran entregar.

### Dependencias entre historias

- **US1 (P1)**: tras la fase 2; sin dependencias de otras historias. Dentro de US1, T011–T017 (repaso
  en la app) se pueden entregar antes que T018–T028 (notificación).
- **US2 (P1)**: tras la fase 2; independiente de US1.
- **US3 (P2)**: tras la fase 2; independiente.
- **US4 (P2)**: depende de US3 (T031–T034) y de T029 (US2).
- **US5 (P3)**: al final, revisa los textos de todas las historias.

### Dentro de cada historia

- Lógica (datos) → interfaz → integración.
- T020 y T021 dependen de T019; T024–T028 dependen de T018, T023 y del worker desplegado (T019–T022).

### Oportunidades de paralelismo

- Fase 1: T002, T003 y T004 en paralelo.
- US1: T018 (`sw.js`), T019 → T020 → T021 (`notificaciones/worker.js`) y T022 (`LEEME.md`) en
  paralelo con T011–T017 (`index.html`).
- US5: T038 (documentación) en paralelo con T037.
- Las tareas de `index.html` son secuenciales entre sí (mismo archivo).

---

## Ejemplo de paralelismo: historia 1

```text
# Mientras una persona/agente hace el repaso en index.html (T011 → T017):
Tarea: "T018 Crear sw.js según contracts/service-worker.md"
Tarea: "T019 Crear notificaciones/worker.js con la API de contracts/api-notificaciones.md"
Tarea: "T022 Crear notificaciones/LEEME.md con la guía de despliegue"
```

---

## Estrategia de implementación

### Primero el MVP (solo historia 1)

1. Fase 1: Preparación.
2. Fase 2: Base (crítica).
3. Fase 3, parte «Repaso dentro de la app» (T011–T017) → validar quickstart 3 y 4.
4. Fase 3, parte «Notificación del sistema» (T018–T028) → desplegar el worker y validar quickstart 5–7
   en un iPhone.
5. **PARAR y VALIDAR**; publicar si está listo.

### Entrega incremental

1. Preparación + Base → datos antiguos intactos y pestañas.
2. + US1 → repaso y avisos (MVP).
3. + US2 → detalle por día.
4. + US3 → pestaña Tareas.
5. + US4 → tareas en el calendario.
6. + US5 y pulido → revisión de idioma y validación completa.

---

## Notas

- [P] = archivo distinto y sin dependencias pendientes.
- La etiqueta [USn] enlaza cada tarea con su historia.
- Hacer commit tras cada tarea o grupo lógico; `master` siempre con un `index.html` funcional.
- Parar en cada punto de control para validar la historia por separado.
- Nunca enviar al worker nada más que `endpoint`, `hora`, `zonaHoraria` y `fecha` (FR-003b).
