<!--
Informe de impacto de la sincronización (borrar antes de confirmar)
- Versión: 3.0.0 → 3.0.1 (PATCH: aclara que la regla de las 04:00 es solo del repaso diario; Hoy,
  Tareas, Calendario y Diario usan el día natural). Sin cambios en otros principios ni secciones.
  Afecta a: specs/002-diario-semanal (FR-031 queda alineado con la constitución).

Informe anterior (aún sin confirmar):
- Versión: 2.0.0 → 3.0.0 (MAJOR: cambia el producto regido y se redefinen los cinco principios)
- Ámbito: pasa de la app de la raíz a `saas/`; la app de la raíz queda congelada.
- Principios modificados:
  - I. Cliente de un solo archivo y sin compilación → I. Arquitectura Next.js con lógica compartida
  - II. Datos locales y privados → II. Datos privados y seguros
  - III. Experiencia pensada primero para el móvil → III. Móvil primero (añade modo oscuro)
  - IV. Integridad de datos y compatibilidad hacia atrás → IV. Integridad de datos (reforzado:
    migraciones SQL inmutables, nada de guardar solo con onBlur, regla de las 04:00)
  - V. Simplicidad (YAGNI) → V. Simplicidad (YAGNI) (sin la preferencia por API nativas sin
    dependencias; las dependencias se justifican en el plan, ver I)
- Secciones añadidas: «App antigua congelada (raíz)».
- Secciones eliminadas: ninguna; «Restricciones técnicas» y «Flujo de desarrollo y controles de
  calidad» se reescriben para `saas/`.
- Plantillas: no se modifican (leen la constitución en tiempo de ejecución).
- TODO pendientes: ninguno.
-->
# Constitución de Habitos

> **Ámbito**: esta constitución rige el producto principal, la app multiusuario de `saas/`
> (Next.js 16 + Supabase, desplegada en Vercel). La app personal de la raíz (`index.html`, `sw.js`,
> `notificaciones/`) queda congelada como versión antigua; ver «App antigua congelada (raíz)».

## Principios fundamentales

### I. Arquitectura Next.js con lógica compartida

- La app DEBE usar Next.js App Router con Server Components por defecto; un componente solo PUEDE
  ser de cliente (`"use client"`) cuando necesite interactividad o API del navegador.
- La interfaz DEBE escribir datos mediante Server Actions; los terceros DEBEN usar la API REST
  versionada bajo `/api/v1`.
- Las Server Actions y las rutas de `/api/v1` DEBEN llamar a la misma lógica de dominio en
  `saas/src/features/<dominio>/queries.ts`; ninguna de las dos PUEDE duplicar consultas ni reglas
  de negocio.
- El código DEBE estar en TypeScript con el modo estricto activado; no se PUEDE desactivar
  `strict` ni silenciar errores de tipos sin justificarlo en el plan.
- Se permiten la compilación y las dependencias npm, pero cada dependencia nueva DEBE justificarse
  en el plan de la funcionalidad que la introduce.

**Justificación**: una única capa de lógica evita que la interfaz y la API diverjan, y los Server
Components reducen el JavaScript enviado al móvil.

### II. Datos privados y seguros

- Los datos del usuario DEBEN vivir en Supabase con Row Level Security activada en todas las tablas
  y políticas que limiten cada fila a su propietario.
- La clave service role de Supabase NO DEBE usarse nunca en la app (ni en servidor ni en cliente);
  todo acceso DEBE hacerse con la sesión del usuario o la clave pública.
- Las restricciones de los datos (longitudes, límites, coherencia entre campos) DEBEN comprobarse
  también en SQL (restricciones, `check`, disparadores o funciones), no solo en TypeScript.
- No se permiten analíticas ni servicios de terceros que reciban datos del usuario, salvo los
  imprescindibles: Supabase, Vercel y el envío de notificaciones push. Al servicio push solo se le
  PUEDE enviar contenido genérico, nunca nombres de hábitos, tareas, notas ni historial.
- Ningún secreto que no deba ser público PUEDE llegar al cliente.

**Justificación**: los hábitos y notas son personales; RLS y las comprobaciones en SQL protegen
los datos aunque falle una capa de la aplicación.

### III. Móvil primero

- Los diseños DEBEN pensarse primero para 360–430 px de ancho, sin desplazamiento horizontal, y
  DEBEN respetar las zonas seguras de iOS al usarse como app de pantalla de inicio.
- Todo elemento interactivo DEBE tener una zona táctil de al menos 44×44 px; las acciones
  principales (marcar un hábito, responder al repaso) DEBEN hacerse con un toque.
- Los colores DEBEN definirse como variables CSS y la interfaz DEBE ofrecer modo oscuro.

**Justificación**: el uso principal es un registro diario rápido desde el móvil.

### IV. Integridad de datos

- Perder lo que el usuario escribe o marca es el peor fallo posible; ningún cambio PUEDE aceptar
  ese riesgo.
- Todo cambio de esquema DEBE ir en una migración SQL nueva en `saas/supabase/migrations`; una
  migración ya aplicada NO DEBE editarse nunca.
- Cada migración DEBE ser compatible con los datos existentes: los datos previos DEBEN conservarse
  o transformarse sin pérdida.
- Ninguna interfaz de escritura PUEDE depender solo de `onBlur` para guardar; DEBE guardar también
  por otro mecanismo (p. ej. guardado con retardo mientras se escribe, al enviar o al ocultar la
  página).
- Las fechas DEBEN calcularse en la zona horaria del usuario. El repaso diario DEBE aplicar la
  regla de las 04:00 (antes de esa hora, el día del repaso sigue siendo el anterior); el resto de
  la app (Hoy, Tareas, Calendario y Diario) DEBE usar el día natural, que cambia a medianoche.

**Justificación**: el historial de hábitos y lo escrito a mano no se pueden recuperar si se pierden.

### V. Simplicidad (YAGNI)

- Implementar solo lo que exige una especificación vigente; sin abstracciones especulativas ni
  opciones de configuración innecesarias.
- Toda complejidad añadida (dependencias, capas, servicios) DEBE justificarse en la sección
  «Seguimiento de complejidad» del plan.

**Justificación**: una base de código pequeña sigue siendo comprensible y mantenible por una persona.

## Restricciones técnicas

- Pila: Next.js 16 (App Router), TypeScript estricto y Supabase (Postgres, Auth, RLS), desplegado
  en Vercel.
- Rendimiento: cada interacción DEBE percibirse en menos de 100 ms, usando actualizaciones
  optimistas que se reviertan y avisen si el servidor falla.
- Accesibilidad: los elementos interactivos DEBEN ser botones o campos reales, o tener roles y
  etiquetas accesibles equivalentes.
- Idioma del proyecto: todos los textos de la interfaz, avisos y mensajes DEBEN estar en español
  con ortografía correcta. Toda la documentación del proyecto (constitución, especificaciones,
  planes, tareas y guías) DEBE estar en español. El código fuente conserva sus nombres actuales; no
  se exige renombrar funciones ni variables.

### App antigua congelada (raíz)

- `index.html`, `sw.js` y `notificaciones/` quedan congelados: solo PUEDEN modificarse para
  corregir fallos graves (pérdida de datos, la app no arranca, fallo de seguridad) o para que su
  copia de seguridad siga siendo importable en `saas/`.
- Cualquier cambio en ellos DEBE mantener sus reglas originales: un único `index.html` sin
  compilación ni dependencias externas, datos solo en el dispositivo y compatibilidad con los datos
  ya guardados.
- El formato de su copia de seguridad DEBE seguir siendo aceptado por la importación de `saas/`
  (`/api/v1/import`).

## Flujo de desarrollo y controles de calidad

- Cada funcionalidad sigue el flujo de Spec Kit: `/speckit-specify` → (`/speckit-clarify`) →
  `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.
- Cada funcionalidad nueva DEBE desarrollarse en su propia rama `00X-nombre` y fusionarse en
  `master` mediante un PR.
- Antes de fusionar, DEBE pasar en `saas/` lo mismo que la CI:
  `npm run lint && npm run typecheck && npm test && npm run build`.
- Antes de fusionar, la funcionalidad DEBE probarse en ancho de móvil en la URL de vista previa de
  Vercel de la rama, recorriendo sus escenarios de aceptación.
- Todo cambio que toque la base de datos (migraciones, políticas, funciones) DEBE llevar prueba en
  `saas/tests/db.test.ts`.
- Los commits DEBEN ser pequeños y descriptivos; `master` DEBE estar siempre desplegable.

## Gobernanza

- Esta constitución prevalece sobre cualquier otra práctica del proyecto; todo plan DEBE superar
  su «Comprobación de Constitución», y las infracciones DEBEN justificarse en «Seguimiento de
  complejidad» o cambiar el diseño.
- Las enmiendas se hacen con `/speckit-constitution`, se documentan en el informe de impacto y se
  confirman junto con los cambios que dependan de ellas.
- El versionado sigue versionado semántico: MAJOR al eliminar o redefinir un principio o el
  ámbito, MINOR al añadir un principio o sección o ampliar sustancialmente una guía, PATCH para
  aclaraciones.
- El cumplimiento se revisa al planificar («Comprobación de Constitución»), otra vez antes de dar
  por terminada la implementación y en la revisión del PR.

**Versión**: 3.0.1 | **Ratificada**: 2026-11-04 | **Última enmienda**: 2026-11-10
