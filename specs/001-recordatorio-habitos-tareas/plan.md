# Plan de implementación: Recordatorio diario de hábitos, lista de tareas y agenda en el calendario

**Rama**: `001-recordatorio-habitos-tareas` | **Fecha**: 2026-11-04 | **Especificación**: [spec.md](./spec.md)

**Entrada**: Especificación de la funcionalidad en `specs/001-recordatorio-habitos-tareas/spec.md`

## Resumen

Ampliar la app de hábitos (un único `index.html`) con cuatro piezas:

1. **Repaso diario**: una pantalla que pregunta hábito por hábito («Sí, cumplido» / «No» /
   «Saltar») y marca los cumplidos; se ofrece al abrir la app tras la hora configurada y se puede
   continuar si se interrumpe.
2. **Notificación del sistema** a la hora elegida aunque la app esté cerrada, mediante Web Push
   estándar: un service worker mínimo en el cliente y un Cloudflare Worker gratuito con un disparador
   cron que envía un *push* sin contenido. El worker solo guarda el `endpoint` de entrega, la hora y
   la zona horaria (FR-003b).
3. **Detalle por día** en el calendario existente: hábitos cumplidos/no cumplidos y tareas del día.
4. **Tareas y eventos**: nueva pestaña «Tareas» y alta de tareas desde cualquier día del calendario,
   con indicador en la cuadrícula.

Todo el estado sigue en `localStorage`, con migración de esquema y sin pérdida de los datos
actuales. Interfaz y documentación en español; el código conserva sus nombres actuales.

## Contexto técnico

**Lenguaje/Versión**: HTML5, CSS3 y JavaScript ES2020+ nativo (cliente); JavaScript módulo ES en
Cloudflare Workers (componente de notificaciones).

**Dependencias principales**: ninguna en el cliente. Worker: solo API de la plataforma (Web Crypto
para firmar VAPID, `fetch`, KV, Cron Triggers); sin paquetes npm.

**Almacenamiento**: `localStorage` en el dispositivo (claves en [data-model.md](./data-model.md));
Workers KV para las suscripciones (solo `endpoint`, hora, zona horaria y último envío).

**Pruebas**: verificación manual guiada por [quickstart.md](./quickstart.md) en ancho de móvil y en
un iPhone real con la app instalada; `curl` para el contrato del worker. Sin frameworks de pruebas
(la constitución prohíbe gestores de paquetes en el cliente).

**Plataforma objetivo**: Safari iOS 16.4+ con la app añadida a la pantalla de inicio (requisito de
Apple para Web Push) y Chrome Android actual. Alojamiento: GitHub Pages
(`https://saulperezz.github.io/habitos/`), HTTPS.

**Tipo de proyecto**: aplicación web móvil instalable (PWA de un solo archivo) + función *serverless*
mínima.

**Objetivos de rendimiento**: interactiva en <1 s; cada respuesta del repaso actualiza la interfaz en
<100 ms; repaso de 5 hábitos en <30 s (SC-001); aviso ≤5 min tras la hora (SC-002a).

**Restricciones**: funciona sin conexión salvo la recepción del aviso; nada de datos personales fuera
del dispositivo; coste 0 € (plan gratuito de Cloudflare); clave privada VAPID solo como *secret* del
worker.

**Escala/Alcance**: 1 usuario, 1–3 dispositivos, ~10 hábitos, ~200 tareas. 4 vistas: Hábitos,
Tareas, Calendario (con detalle de día) y Repaso, más un panel de Ajustes del recordatorio.

## Comprobación de Constitución

*Control: debe superarse antes de la fase 0 y volver a comprobarse tras la fase 1.*

| Principio | Comprobación | Estado |
|-----------|--------------|--------|
| I. Cliente de un solo archivo | Toda la lógica y la interfaz siguen en `index.html`. Archivos extra solo los que exige la plataforma: `sw.js` (push), `manifest.webmanifest` e iconos (instalación en iOS). Un único componente externo (`notificaciones/worker.js`) dedicado solo al aviso. Sin compilación ni CDN. | ✅ Cumple |
| II. Datos locales y privados | Al worker solo llegan `endpoint`, `hora` y `zonaHoraria`; el *push* va sin contenido y el texto de la notificación es genérico y lo pone `sw.js`. Clave privada VAPID como *secret*. Si el worker falla, el repaso se ofrece al abrir (FR-004). Almacenamiento con `try/catch`. | ✅ Cumple |
| III. Primero el móvil | Repaso a pantalla completa con botones ≥44 px; pestañas inferiores; zonas seguras con `env(safe-area-inset-*)`; colores en `:root`. | ✅ Cumple |
| IV. Integridad de datos | La clave `habits` y su forma no cambian; claves nuevas con `version`; migración v1→v2 al cargar; se corrige la mezcla actual de fecha UTC/local con una única función de clave de fecha en Europe/Madrid. | ✅ Cumple |
| V. Simplicidad | Sin frameworks; worker de un solo archivo sin npm; KV con una sola clave; *push* sin contenido (evita implementar cifrado de carga útil). | ✅ Cumple |
| Restricciones / Idioma | Textos en español con tildes (se corrigen «Habitos», «Descripcion», «habito»); documentación en español. | ✅ Cumple |
| Flujo de calidad | `quickstart.md` cubre almacenamiento vacío, datos de versión anterior y el caso sin conexión / worker caído. | ✅ Cumple |

**Resultado previo a la fase 0**: superado, sin infracciones.
**Resultado tras la fase 1** (diseño, contratos y modelo de datos): superado, sin infracciones nuevas.
Ver la nota de riesgo R1 en [research.md](./research.md) (compatibilidad del *push* sin contenido en
iOS) y su alternativa, que tampoco infringe la constitución.

## Estructura del proyecto

### Documentación (esta funcionalidad)

```text
specs/001-recordatorio-habitos-tareas/
├── plan.md              # Este archivo
├── research.md          # Fase 0
├── data-model.md        # Fase 1
├── quickstart.md        # Fase 1
├── contracts/           # Fase 1
│   ├── api-notificaciones.md
│   ├── service-worker.md
│   └── interfaz.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks; no lo crea /speckit-plan)
```

### Código fuente (raíz del repositorio)

```text
index.html                 # App completa: hábitos, repaso, tareas, calendario, ajustes (modificado)
sw.js                      # Service worker mínimo: evento push → notificación; clic → ./?repaso=1 (nuevo)
manifest.webmanifest       # Manifiesto para instalar la app y habilitar Web Push en iOS (nuevo)
iconos/
├── icono-192.png          # (nuevo)
├── icono-512.png          # (nuevo)
└── apple-touch-icon.png   # 180×180 (nuevo)
notificaciones/
├── worker.js              # Cloudflare Worker: API de suscripción + cron de envío (nuevo)
├── wrangler.toml          # Configuración del worker: KV, cron, variables (nuevo)
└── LEEME.md               # Cómo desplegarlo y crear las claves VAPID (nuevo)
```

**Decisión de estructura**: se mantiene el cliente en la raíz (GitHub Pages sirve la raíz) y se
aísla el único componente externo en `notificaciones/`, que no se publica como parte del cliente
y se despliega aparte en Cloudflare. `sw.js` debe estar en la raíz para controlar todo el ámbito
`/habitos/`.

## Seguimiento de complejidad

No hay infracciones de la constitución que justificar. Los archivos `sw.js`, `manifest.webmanifest`,
`iconos/` y `notificaciones/` están amparados de forma explícita por el principio I (v2.0.0).
