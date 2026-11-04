# Contrato: service worker (`sw.js`) y manifiesto

## `sw.js` (raíz, ámbito `./`)

| Evento | Comportamiento |
|--------|----------------|
| `install` / `activate` | `skipWaiting()` y `clients.claim()`. No cachea nada (fuera de alcance). |
| `push` | Siempre muestra una notificación (obligatorio en iOS/Chrome): título «Mis Hábitos», cuerpo «¿Qué tal hoy? Haz el repaso de tus hábitos», `tag: "repaso-diario"` (sustituye a la anterior), icono `iconos/icono-192.png`. Ignora `event.data` (puede ser `null`). |
| `notificationclick` | Cierra la notificación; si hay una ventana de la app abierta, la enfoca y le envía `{ tipo: "abrir-repaso" }` por `postMessage`; si no, abre `./?repaso=1`. |
| `pushsubscriptionchange` | No hace nada: el SW no puede leer `localStorage` (hora y zona). La app detecta el cambio de `endpoint` al abrirse y vuelve a registrarlo (ver abajo). |

El texto de la notificación es fijo y genérico (principio II): nunca incluye nombres de hábitos.

## `index.html` ↔ `sw.js`

- Registro: `navigator.serviceWorker.register('./sw.js')` al cargar, si existe la API.
- Al cargar con `?repaso=1` o al recibir `{ tipo: "abrir-repaso" }`: abrir el repaso del día, o el
  mensaje «El repaso de hoy ya está hecho» si `completado` (research D5); después se limpia el
  parámetro de la URL con `history.replaceState`.
- Al arrancar con `avisos = concedido`: si `pushManager.getSubscription()` es `null` o su `endpoint`
  ≠ `endpointRegistrado`, volver a suscribirse y llamar a `PUT /suscripcion` (research R2).

## `manifest.webmanifest`

```json
{
  "name": "Mis Hábitos",
  "short_name": "Hábitos",
  "lang": "es",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#0f0f13",
  "theme_color": "#0f0f13",
  "icons": [
    { "src": "iconos/icono-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "iconos/icono-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

`index.html` añade `<link rel="manifest">` y `<link rel="apple-touch-icon" href="iconos/apple-touch-icon.png">`.
