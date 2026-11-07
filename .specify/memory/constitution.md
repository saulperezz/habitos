# Constitución de Habitos

> **Ámbito**: esta constitución rige la app personal de la raíz (`index.html`, `sw.js`,
> `notificaciones/`). La versión multiusuario en `saas/` es un producto aparte con su propia
> arquitectura (cuentas, servidor y compilación); ver `saas/README.md`.

## Principios fundamentales

### I. Cliente de un solo archivo y sin compilación

- La aplicación cliente DEBE seguir siendo un único `index.html` autocontenido (HTML, CSS y
  JavaScript en línea).
- Solo se permiten archivos adicionales cuando la plataforma los exige para instalar la app o
  recibir notificaciones (p. ej. un service worker, un manifiesto y sus iconos); DEBEN ser
  mínimos y estar justificados en el plan.
- No se permite ningún paso de compilación, empaquetador, transpilador ni gestor de paquetes en el
  cliente; abrirlo o servirlo como archivos estáticos DEBE bastar para ejecutarlo.
- El cliente no DEBE depender de scripts, hojas de estilo, fuentes ni CDN externos en tiempo de
  ejecución; todas sus funciones, salvo recibir el aviso diario, DEBEN funcionar sin conexión.
- Se permite un único componente externo cuyo único fin es programar y enviar la notificación
  diaria del repaso de hábitos (ver principio II). Ninguna otra funcionalidad PUEDE depender de él.

**Justificación**: la app es una herramienta personal instalada en la pantalla de inicio del móvil;
no tener herramientas la mantiene fácil de alojar, duradera y editable a mano. La excepción existe
porque una notificación con la app cerrada no es posible sin un emisor externo.

### II. Datos locales y privados

- Todos los datos del usuario (hábitos, historial, tareas, configuración) DEBEN guardarse en el
  dispositivo; no se permiten analíticas, cuentas, sincronización ni otros servicios de terceros.
- Única excepción: el servicio de notificaciones. A él solo se le PUEDE enviar la hora del aviso,
  la zona horaria y la dirección de entrega del dispositivo. Nunca nombres de hábitos, historial,
  tareas ni ningún otro dato del usuario. El contenido de la notificación DEBE ser genérico.
- Si el servicio de notificaciones falla o no hay conexión, la app DEBE seguir funcionando con
  normalidad y ofrecer el repaso al abrirla.
- Cualquier credencial o clave del servicio que no deba ser pública NO DEBE incluirse en el cliente.
- Toda lectura o escritura del almacenamiento DEBE ir dentro de `try/catch`, y la interfaz DEBE
  mostrarse correctamente si el almacenamiento está vacío o no disponible.
- Cualquier exportación o importación DEBE usar archivos que el usuario elija explícitamente.

**Justificación**: los datos de hábitos son personales; guardarlos en el dispositivo garantiza la
privacidad, y limitar lo enviado al aviso reduce la exposición al mínimo imprescindible.

### III. Experiencia pensada primero para el móvil

- Los diseños DEBEN pensarse primero para ancho de móvil (≈360–430 px), sin desplazamiento
  horizontal, y DEBEN respetar las zonas seguras al usarse como app de pantalla de inicio en iOS.
- Las acciones principales (marcar un hábito, responder al repaso) DEBEN poder hacerse con un toque
  y con zonas táctiles de al menos 44×44 px.
- Los colores DEBEN definirse como propiedades personalizadas CSS en `:root`.

**Justificación**: el uso principal es un registro diario rápido desde el móvil.

### IV. Integridad de datos y compatibilidad hacia atrás

- Los cambios en la forma de los datos guardados DEBEN ser compatibles hacia atrás: los datos
  existentes DEBEN cargarse sin pérdida tras cualquier actualización.
- Si un cambio de esquema es inevitable, el código DEBE incluir una migración que actualice los
  datos antiguos al cargar, y los datos guardados DEBEN llevar o implicar una versión.
- Las fechas DEBEN manejarse en la zona horaria local del usuario con un único formato de clave de
  fecha coherente.

**Justificación**: perder el historial de hábitos es el peor fallo posible de esta app.

### V. Simplicidad (YAGNI)

- Implementar solo lo que exige una especificación vigente; sin abstracciones especulativas,
  frameworks ni opciones de configuración innecesarias.
- Preferir las API nativas del navegador y funciones pequeñas antes que patrones que el tamaño o
  las funciones de la app no justifiquen.
- El componente externo de notificaciones DEBE ser lo más pequeño posible y preferir opciones
  gratuitas o de coste mínimo que no requieran mantenimiento de servidores propios.
- Toda complejidad añadida DEBE justificarse en la sección «Seguimiento de complejidad» del plan.

**Justificación**: una base de código pequeña sigue siendo comprensible y mantenible por una persona.

## Restricciones técnicas

- Tecnología del cliente: HTML5, CSS3 y JavaScript ES2020+ nativos, compatibles con Safari (iOS)
  y navegadores Chromium actuales.
- Alojamiento: cualquier alojamiento estático con HTTPS (p. ej. GitHub Pages); el punto de entrada
  DEBE seguir siendo `index.html` en la raíz del repositorio.
- Rendimiento: la app DEBE ser interactiva en menos de 1 s en un móvil de gama media, y cada acción
  del usuario DEBE actualizar la interfaz sin retraso perceptible (<100 ms).
- Accesibilidad: los elementos interactivos DEBEN ser botones o campos reales, o tener roles y
  etiquetas accesibles equivalentes.
- Idioma del proyecto: todos los textos de la interfaz, avisos y mensajes DEBEN estar en español con
  ortografía correcta. Toda la documentación del proyecto (constitución, especificaciones, planes,
  tareas y guías) DEBE estar en español. El código fuente conserva sus nombres actuales; no se
  exige renombrar funciones ni variables.

## Flujo de desarrollo y controles de calidad

- Cada funcionalidad sigue el flujo de Spec Kit: `/speckit-specify` → (`/speckit-clarify`) →
  `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.
- Antes de confirmar un cambio, DEBE verificarse manualmente en un ancho de móvil: primer arranque
  con almacenamiento vacío, carga de datos de una versión anterior y los escenarios de aceptación de
  la nueva funcionalidad. Si afecta a las notificaciones, también DEBE comprobarse el caso sin
  conexión o con el servicio caído.
- Los commits DEBEN ser pequeños y descriptivos; la rama `master` DEBE contener siempre un
  `index.html` funcional.

## Gobernanza

- Esta constitución prevalece sobre cualquier otra práctica del proyecto; todo plan DEBE superar su
  «Comprobación de Constitución», y las infracciones DEBEN justificarse en «Seguimiento de
  complejidad» o cambiar el diseño.
- Las enmiendas se hacen con `/speckit-constitution`, se documentan en el informe de impacto y se
  confirman junto con los cambios que dependan de ellas.
- El versionado sigue versionado semántico: MAJOR al eliminar o redefinir un principio, MINOR al
  añadir un principio o sección o ampliar sustancialmente una guía, PATCH para aclaraciones.
- El cumplimiento se revisa al planificar («Comprobación de Constitución») y otra vez antes de dar
  por terminada la implementación.

**Versión**: 2.0.0 | **Ratificada**: 2026-11-04 | **Última enmienda**: 2026-11-04
