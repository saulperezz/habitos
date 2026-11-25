# Contrato: interfaz y service worker sin conexión

**Funcionalidad**: `005-sin-conexion`

## 1. Service worker (`saas/public/sw.js`)

| Petición | Estrategia |
|---|---|
| Que no es `GET`, de otro origen, o `/api/*`, `/auth/*`, `/login` | No se intercepta |
| `/_next/static/*` | Primero la caché (`habitos-estaticos-v1`) y después la red |
| Navegación a `/today`, `/tasks`, `/notes` | Red primero (tiempo límite de 4 s) y guardado en `habitos-paginas-v1`. Si falla, la copia guardada. Si no hay copia, `/sin-conexion.html?motivo=primera-vez` |
| Navegación a `/` | Red. Si falla, la copia de `/today` |
| Otras navegaciones (`/review`, `/calendar`, `/settings`, …) | Red. Si falla, `/sin-conexion.html?motivo=seccion` |
| RSC (`RSC: 1`) sin conexión | `Response.error()`, y Next hace una navegación completa |

**Mensajes del cliente al SW**: `{ t: 'calentar' }` y `{ t: 'olvidar-paginas' }`.

**Eventos de la 004** (`push` y `notificationclick`): no cambian.

**Al activar**: borra las cachés `habitos-*` de otras versiones.

## 2. `/sin-conexion.html`

| `motivo` | Título | Texto |
|---|---|---|
| `primera-vez` | Sin conexión | «Esta pantalla aún no se ha abierto con conexión en este dispositivo. Conéctate una vez para poder verla sin conexión.» |
| `seccion` (por defecto) | Esta sección necesita conexión | «El repaso, el calendario y los ajustes solo funcionan con conexión. Hoy, Tareas y Diario sí funcionan sin conexión.» |

Botones: [Reintentar] (recarga) y [Ir a Hoy] (`/today`). Ambos miden al menos 44×44 px. La página
funciona en modo claro y oscuro, sin desplazamiento horizontal entre 360 y 430 px.

## 3. Indicador de estado (`OfflineBanner`, en el layout de la app)

Es una franja compacta, fija bajo la cabecera, con `role="status"` y `aria-live="polite"`. No tapa
la barra inferior ni las acciones principales.

| Estado | Texto |
|---|---|
| Sin conexión y sin pendientes | «Sin conexión» |
| Sin conexión con 1 pendiente | «Sin conexión · 1 cambio pendiente» |
| Sin conexión con N pendientes | «Sin conexión · N cambios pendientes» |
| Con conexión y enviando | «Sincronizando…» (discreto) |
| Con conexión, en pausa por sesión | «Inicia sesión para enviar N cambios» con el enlace [Entrar] |
| Con conexión, sin pendientes | (nada) |

## 4. Avisos de cambios descartados (`role="alert"`)

Se apilan encima de la barra inferior, se cierran a los 6 s o al tocarlos, y el botón de cerrar mide
44×44 px.

- «La tarea “{título}” se borró en otro dispositivo; tu cambio no se ha aplicado.»
- «El hábito “{nombre}” se borró en otro dispositivo; tu cambio no se ha aplicado.»
- «No se ha guardado “{etiqueta}”: {mensaje del servidor}.» Si había más cambios posteriores sobre
  ese elemento, se añade «(y N cambios más sobre él)».
- «No se ha podido guardar en este dispositivo. Libera espacio e inténtalo de nuevo.»

## 5. Acciones que necesitan conexión (FR-007)

Sin conexión se muestran desactivadas (`aria-disabled="true"`, sin navegar) con el texto «Necesita
conexión» al lado o debajo:

- el enlace «Hacer el repaso ahora» y la tarjeta «Es hora del repaso» de Hoy;
- la pestaña Calendario de la barra inferior;
- el botón de Ajustes de la cabecera;
- dentro de Ajustes, si se pierde la conexión con la página abierta: «Exportar copia de seguridad»,
  «Elegir archivo» (importar), guardar perfil, avisos y borrar cuenta;
- dentro del repaso, si se pierde la conexión con la página abierta: los botones de respuesta, con el
  texto «El repaso necesita conexión».

## 6. Cerrar sesión con pendientes

Si hay pendientes (cola más días del diario), se muestra un `<dialog>` modal antes de hacer nada.

**Texto**:

> **¿Cerrar sesión?** Tienes N cambios sin enviar. Se enviarán cuando vuelvas a entrar con esta
> cuenta en este dispositivo.

**Botones**: [Cancelar] [Cerrar sesión].

**Al confirmar**:

1. Se dan de baja los avisos de este dispositivo (como en la 004).
2. Se borran las `copias` de la cuenta.
3. Se envía `olvidar-paginas` al SW.
4. Se ejecuta `signOutAction()`.

**La cola se conserva.**

## 7. Interfaz nueva (con y sin conexión)

- **Tarea**: el botón «Editar» abre la edición en línea con título, nota, fecha y hora (mismos
  límites que al crear: 80 y 200 caracteres, y la hora necesita una fecha). Botones: [Guardar]
  [Cancelar].
- **Hábito** (modo edición de Hoy): [Guardar] para nombre y descripción, [Archivar], [Eliminar] y
  mover arriba o abajo.
- **«Archivados (N)»**: sección plegada (`<details>`) al final de la lista de hábitos, con
  [Recuperar] y [Eliminar] en cada uno.
