# Especificación de la funcionalidad: Avisos push del repaso diario

**Rama de la funcionalidad**: `claude/mvp-architecture-build-hbua5y` (carpeta de la spec: `004-avisos-push`)

**Creada**: 2026-11-23

**Estado**: Borrador

**Entrada**: descripción del usuario: «Avisos push del repaso diario en la versión SaaS (saas/). Cada
usuario puede activar en Ajustes una notificación del sistema que le recuerde hacer el repaso de
hábitos a la hora configurada en su perfil (review_time, en su zona horaria). Funciona en varios
dispositivos por usuario (tabla push_subscriptions ya existente). No se envía si el repaso del día ya
está completado o si review_enabled es falso. Al tocar la notificación se abre el repaso. Se puede
desactivar por dispositivo. Suscripciones caducadas (404/410) se eliminan. Envío desde Supabase
(pg_cron cada minuto + Edge Function con Web Push VAPID, reutilizando la lógica de
notificaciones/worker.js). Textos en español; en iOS requiere la PWA instalada en la pantalla de
inicio.»

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 - Recibir un aviso a la hora del repaso (Prioridad: P1) 🎯 MVP

El usuario entra en Ajustes y, en la sección del repaso, pulsa «Activar avisos». El dispositivo le
pide permiso para mostrar notificaciones y lo concede. Desde entonces, cada día, cuando llega la
hora del repaso configurada en su perfil (en su zona horaria), ese dispositivo muestra una
notificación del sistema con el texto «¿Qué tal hoy? Haz el repaso de tus hábitos», aunque la app
esté cerrada. Si ese día ya ha terminado el repaso antes de la hora, no recibe nada.

**Por qué esta prioridad**: es el valor central de la funcionalidad; sin aviso, el usuario tiene que
acordarse solo de abrir la app, y es la única función de la app original que aún falta en `saas/`.

**Prueba independiente**: con una cuenta con al menos un hábito, activar los avisos en un móvil,
poner la hora del repaso dos minutos después de la hora actual, cerrar la app y comprobar que llega
la notificación con el texto esperado; repetir otro día con el repaso ya completado y comprobar que
no llega.

**Escenarios de aceptación**:

1. **Dado** un usuario con 3 hábitos, repaso activo a las 22:00 y avisos activados en su móvil,
   **cuando** son las 22:00 en su zona horaria y no ha completado el repaso de hoy, **entonces** su
   móvil muestra una única notificación «¿Qué tal hoy? Haz el repaso de tus hábitos».
2. **Dado** el mismo usuario, **cuando** completa el repaso a las 21:30, **entonces** a las 22:00 no
   recibe ninguna notificación ese día.
3. **Dado** un usuario con avisos activados, **cuando** pasa la hora del repaso y ya se envió el
   aviso del día, **entonces** no recibe un segundo aviso ese mismo día.
4. **Dado** un usuario con el repaso desactivado en Ajustes, **cuando** llega su hora, **entonces**
   no recibe ningún aviso; al volver a activar el repaso, los avisos se reanudan sin tener que
   volver a dar permiso.
5. **Dado** un usuario sin ningún hábito activo, **cuando** llega su hora, **entonces** no recibe
   ningún aviso.
6. **Dado** un usuario que cambia la hora del repaso de 22:00 a 08:00 o su zona horaria, **cuando**
   llega la nueva hora en la nueva zona, **entonces** el aviso llega a esa hora, sin volver a
   activar nada.
7. **Dado** un usuario en un navegador que no admite avisos, o en iPhone sin la app añadida a la
   pantalla de inicio, **cuando** abre Ajustes, **entonces** ve «Para recibir avisos en iPhone,
   añade la app a la pantalla de inicio: Compartir › Añadir a pantalla de inicio.» (o «Este
   navegador no permite avisos.» fuera de iPhone) en lugar del botón.
8. **Dado** un usuario que rechaza el permiso, **cuando** vuelve a Ajustes, **entonces** ve «Has
   bloqueado los avisos. Actívalos en los ajustes del navegador o del móvil.» y la app sigue
   funcionando con normalidad.

---

### Historia de usuario 2 - Abrir el repaso desde el aviso (Prioridad: P1)

Al tocar la notificación, se abre la app (o se enfoca si ya estaba abierta) directamente en el
repaso del día, listo para responder hábito por hábito. Si para entonces el repaso ya está
completado (por ejemplo, lo terminó en otro dispositivo), ve el resumen del repaso con el mensaje
«El repaso de hoy ya está hecho».

**Por qué esta prioridad**: el aviso solo cumple su objetivo si lleva al repaso en un toque
(principio III: las acciones principales se hacen con un toque).

**Prueba independiente**: con un aviso recibido, tocarlo con la app cerrada y con la app abierta en
otra pestaña, y comprobar que en ambos casos se muestra el repaso del día.

**Escenarios de aceptación**:

1. **Dado** un aviso recibido con la app cerrada, **cuando** el usuario lo toca, **entonces** la app
   se abre en el repaso del día por el primer hábito sin responder.
2. **Dado** un aviso recibido con la app abierta en otra pantalla, **cuando** lo toca, **entonces**
   la app pasa al primer plano y muestra el repaso del día.
3. **Dado** que el usuario completó el repaso en otro dispositivo después de recibir el aviso,
   **cuando** toca el aviso, **entonces** ve «El repaso de hoy ya está hecho» y el resumen.
4. **Dado** que la sesión del usuario ha caducado, **cuando** toca el aviso, **entonces** se le pide
   iniciar sesión y, al entrar, llega al repaso.

---

### Historia de usuario 3 - Gestionar los avisos en varios dispositivos (Prioridad: P2)

El usuario puede activar los avisos en su móvil y en su ordenador; a la hora del repaso, ambos
reciben el aviso. En cada dispositivo, Ajustes muestra si los avisos están activados en **ese**
dispositivo y permite desactivarlos solo ahí, sin afectar a los demás. Al cerrar sesión en un
dispositivo, ese dispositivo deja de recibir avisos de la cuenta.

**Por qué esta prioridad**: la gracia de `saas/` es usarla en varios dispositivos; pero un solo
dispositivo ya da el valor principal, así que va después de las historias 1 y 2.

**Prueba independiente**: activar los avisos en dos dispositivos, comprobar que ambos reciben el
aviso, desactivarlos en uno y comprobar que solo el otro lo recibe al día siguiente.

**Escenarios de aceptación**:

1. **Dado** un usuario con avisos activados en el móvil y en el ordenador, **cuando** llega la hora
   del repaso, **entonces** ambos dispositivos muestran el aviso.
2. **Dado** el mismo usuario, **cuando** pulsa «Desactivar avisos» en el ordenador, **entonces** el
   ordenador deja de recibir avisos y el móvil los sigue recibiendo; Ajustes en el móvil sigue
   mostrando «Avisos activados en este dispositivo».
3. **Dado** un usuario con avisos activados en un dispositivo, **cuando** cierra sesión en él,
   **entonces** ese dispositivo no vuelve a recibir avisos de esa cuenta.
4. **Dado** un dispositivo compartido donde otra persona inicia sesión con su cuenta y activa los
   avisos, **cuando** llega la hora de cada uno, **entonces** el dispositivo solo recibe los avisos
   de la última cuenta que los activó en él.
5. **Dado** un usuario que ya tiene avisos activados en 10 dispositivos, **cuando** intenta
   activarlos en un undécimo, **entonces** ve «Ya tienes avisos en 10 dispositivos. Desactívalos en
   alguno para añadir este.» y no se activa nada.
6. **Dado** que un dispositivo ha desinstalado la app o retirado el permiso, **cuando** el servicio
   de avisos indica que ese destino ya no existe, **entonces** se deja de intentar enviar a ese
   dispositivo y el resto sigue recibiendo avisos.

---

### Historia de usuario 4 - Comprobar que los avisos funcionan (Prioridad: P3)

Tras activar los avisos, el usuario puede pulsar «Enviar aviso de prueba» en Ajustes y recibe en
ese dispositivo, en unos segundos, una notificación «Los avisos funcionan ✓». Así sabe que todo está
bien sin esperar a la hora del repaso.

**Por qué esta prioridad**: los avisos dependen del sistema operativo y fallan de forma silenciosa
(sobre todo en iPhone); una prueba inmediata ahorra un día de espera para descubrirlo, pero no es
imprescindible para recibir el aviso diario.

**Prueba independiente**: con los avisos activados, pulsar el botón y comprobar que la notificación
llega solo a ese dispositivo.

**Escenarios de aceptación**:

1. **Dado** un dispositivo con avisos activados, **cuando** el usuario pulsa «Enviar aviso de
   prueba», **entonces** ese dispositivo (y solo ese) muestra «Los avisos funcionan ✓» en menos de
   30 segundos.
2. **Dado** que el envío de prueba falla, **cuando** el usuario pulsa el botón, **entonces** ve «No
   se pudo enviar el aviso de prueba. Inténtalo de nuevo.» y los avisos siguen activados.
3. **Dado** que el usuario pulsa el botón varias veces seguidas, **cuando** supera 5 pruebas en un
   minuto, **entonces** ve un mensaje para esperar un poco y no se envían más.

---

### Casos límite

- **Hora de madrugada y regla de las 04:00**: con la hora del repaso a las 02:00, el aviso de la
  madrugada del martes corresponde al repaso del lunes (regla de las 04:00); si el repaso del lunes
  ya está completado, no se envía. Se envía como máximo un aviso por día natural del usuario.
- **Envío con retraso**: si en el momento exacto no se pudo enviar (servicio caído, fallo
  temporal), se reintenta hasta conseguirlo, siempre que siga siendo el mismo día natural del
  usuario y el repaso siga sin completar; pasado ese día, ese aviso ya no se envía.
- **Cambio de hora o zona después del aviso**: si ya se envió el aviso de hoy y el usuario cambia la
  hora a una posterior, no recibe un segundo aviso ese día.
- **Cambio de horario de verano**: el aviso sigue llegando a la hora local configurada; el día que
  esa hora no existe (salto de 02:00 a 03:00) se envía en cuanto la hora local la supera.
- **Dispositivo sin conexión a la hora del aviso**: el aviso puede llegar con retraso cuando el
  dispositivo recupere la conexión, pero no después de una hora; si para entonces sigue sin
  conexión, ese aviso se pierde.
- **Permiso retirado desde el sistema**: si el usuario quita el permiso en los ajustes del móvil,
  Ajustes de la app muestra «Has bloqueado los avisos…» la próxima vez que se abra.
- **El dispositivo cambia de destino de avisos** (lo hacen algunos navegadores): al abrir la app con
  el permiso concedido, el dispositivo se vuelve a registrar sin que el usuario haga nada.
- **Borrar la cuenta**: todos los dispositivos de la cuenta dejan de recibir avisos.
- **Repaso empezado pero no terminado**: si hay respuestas pero quedan hábitos sin responder, se
  envía el aviso (el repaso no está completado).
- **Error al activar o desactivar** (sin conexión, servidor caído): se muestra «No se pudieron
  cambiar los avisos. Inténtalo de nuevo.» y el estado mostrado no cambia.

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Activar y desactivar**

- **FR-001**: Ajustes DEBE mostrar, junto a la configuración del repaso, el estado de los avisos en
  el dispositivo actual: «no activados» (botón «Activar avisos»), «activados» («Avisos activados en
  este dispositivo» con los botones «Desactivar avisos» y «Enviar aviso de prueba»), «bloqueados» o
  «no disponibles», con los textos de la historia 1.
- **FR-002**: El permiso del sistema para notificaciones SOLO DEBE pedirse cuando el usuario pulsa
  «Activar avisos», nunca al abrir la app.
- **FR-003**: Al conceder el permiso, el sistema DEBE registrar el dispositivo para la cuenta del
  usuario y mostrar el estado «activados» en menos de 3 segundos con buena conexión.
- **FR-004**: «Desactivar avisos» DEBE dejar de enviar avisos a ese dispositivo y solo a ese.
- **FR-005**: Cerrar sesión en un dispositivo DEBE dejar de enviarle avisos de esa cuenta.
- **FR-006**: Un mismo dispositivo DEBE recibir avisos de una sola cuenta: la última que los activó
  en él.
- **FR-007**: Cada cuenta PUEDE tener avisos activados en un máximo de 10 dispositivos; al intentar
  superar el límite DEBE mostrarse el mensaje de la historia 3, escenario 5.
- **FR-008**: Al abrir la app con el permiso ya concedido, el sistema DEBE comprobar que el
  dispositivo sigue registrado con su destino actual y volver a registrarlo si cambió o se perdió,
  sin intervención del usuario.
- **FR-009**: Los errores al activar, desactivar o volver a registrar NO DEBEN bloquear el uso de la
  app y DEBEN mostrarse con un mensaje en español.

**Cuándo se envía**

- **FR-010**: El sistema DEBE enviar el aviso a todos los dispositivos registrados de un usuario
  cuando, en la zona horaria del perfil, la hora local alcanza o supera la hora del repaso, si se
  cumplen todas estas condiciones: el repaso está activo en el perfil, el usuario tiene al menos un
  hábito activo, el repaso del día (con la regla de las 04:00) no está completado y aún no se ha
  enviado el aviso de ese día natural.
- **FR-011**: El aviso DEBE llegar al servicio de notificaciones como máximo 2 minutos después de la
  hora configurada, salvo fallo del propio servicio.
- **FR-012**: Se DEBE enviar como máximo un aviso por usuario y día natural del usuario (contando
  todos los dispositivos como un único aviso), aunque cambie la hora o la zona después del envío.
- **FR-013**: Si un envío falla de forma temporal, el sistema DEBE reintentarlo mientras siga siendo
  el mismo día natural del usuario y el repaso siga sin completar; si el servicio indica que el
  destino ya no existe, el sistema DEBE eliminar ese dispositivo y no volver a intentarlo.
- **FR-014**: Un aviso que no pueda entregarse al dispositivo en una hora DEBE descartarse (no debe
  aparecer horas más tarde).

**Contenido y apertura**

- **FR-015**: El aviso diario DEBE mostrar el título «Habitos» y el texto «¿Qué tal hoy? Haz el
  repaso de tus hábitos», con el icono de la app; el de prueba, «Los avisos funcionan ✓».
- **FR-016**: Lo que se envía al servicio de notificaciones NO DEBE contener nombres de hábitos,
  tareas, notas, historial ni ningún otro dato del usuario (constitución, principio II).
- **FR-017**: Varios avisos del repaso en el mismo dispositivo DEBEN sustituirse entre sí en lugar
  de acumularse.
- **FR-018**: Tocar el aviso DEBE abrir la app en el repaso del día, o enfocar una ventana ya
  abierta y llevarla al repaso; si el repaso está completado, DEBE mostrar «El repaso de hoy ya
  está hecho» con el resumen; si no hay sesión, DEBE pedir iniciar sesión y llevar después al
  repaso.

**Aviso de prueba**

- **FR-019**: «Enviar aviso de prueba» DEBE enviar el aviso de prueba solo al dispositivo actual,
  con un máximo de 5 pruebas por minuto y usuario, y DEBE mostrar un error en español si falla.

**Privacidad y datos**

- **FR-020**: Cada usuario SOLO DEBE poder ver, crear y borrar los registros de sus propios
  dispositivos.
- **FR-021**: Borrar la cuenta DEBE borrar todos sus dispositivos registrados.
- **FR-022**: Las claves privadas para firmar los avisos NO DEBEN llegar nunca al navegador.

**Idioma y accesibilidad**

- **FR-023**: Todos los textos nuevos (Ajustes, avisos, errores) DEBEN estar en español con
  ortografía correcta; los botones nuevos DEBEN tener zona táctil de al menos 44×44 px y etiqueta
  accesible.

### Entidades clave

- **Dispositivo de avisos** (suscripción): un navegador o app instalada donde el usuario activó los
  avisos. Pertenece a un usuario; tiene un destino único al que se envían los avisos y las claves
  públicas que ese destino exige; fecha de alta. Ya existe en la base de datos.
- **Registro de envío del día**: para cada usuario, el último día natural en que se le envió el
  aviso del repaso; impide enviar dos veces el mismo día.
- **Perfil** (existente): zona horaria, hora del repaso y si el repaso está activo; decide cuándo
  se envía.
- **Repaso del día** (existente): si está completado, ese día no se envía el aviso.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: En las pruebas a mano, el aviso aparece en el dispositivo como máximo 2 minutos
  después de la hora configurada en el 100 % de los días probados con el dispositivo conectado.
- **SC-002**: En 7 días seguidos de prueba, ningún usuario recibe más de un aviso de repaso al día
  por dispositivo, y ninguno lo recibe un día en que ya había completado el repaso antes de la hora.
- **SC-003**: Desde el aviso, el usuario llega a la primera pregunta del repaso con un solo toque y
  en menos de 3 segundos.
- **SC-004**: Activar los avisos cuesta como máximo 2 toques desde Ajustes (botón + permiso del
  sistema).
- **SC-005**: El envío sigue cumpliendo SC-001 con 10 000 usuarios cuya hora de repaso coincide en
  el mismo minuto.
- **SC-006**: Un dispositivo que deja de existir para el servicio de avisos se deja de intentar en
  el primer envío fallido que lo indique.

## Supuestos

- La hora del repaso, su activación y la zona horaria son las del perfil (una por cuenta, no por
  dispositivo); esta funcionalidad no añade horas distintas por dispositivo.
- «Día natural del usuario» es la fecha local en la zona horaria del perfil; el repaso del día se
  calcula con la regla de las 04:00 de la constitución.
- En iPhone y iPad solo se admiten avisos con la app añadida a la pantalla de inicio (iOS/iPadOS
  16.4 o posterior); en Android y escritorio, en los navegadores que admiten avisos web.
- El aviso usa el mismo texto genérico que la app original para no enviar datos personales al
  servicio de notificaciones.
- La app antigua de la raíz (`index.html`, `notificaciones/`) no se modifica; puede seguir enviando
  sus propios avisos a quien la use.
- Fuera de alcance: avisos de tareas o eventos del calendario, varios avisos al día, textos
  personalizados, avisos por correo y el modo sin conexión de la app.
