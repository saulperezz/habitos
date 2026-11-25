# Especificación de la funcionalidad: Usar la app sin conexión

**Rama de la funcionalidad**: `005-sin-conexion`

**Creada**: 2026-11-25

**Estado**: Borrador

**Entrada**: descripción del usuario: «Que la app de saas/ funcione sin conexión. Si la abro instalada
en el móvil sin conexión, veo los últimos datos cargados de Hoy, Tareas y Diario, con un aviso claro
“Sin conexión” y, si hay cambios por enviar, cuántos (“3 cambios pendientes”). Al recuperar la
conexión, un indicador discreto “Sincronizando…” y después nada. Sin conexión puedo hacer todo lo
habitual con hábitos, tareas y diario; los cambios se ven al instante, se guardan en el dispositivo
y se envían solos y en orden al volver la conexión, sin duplicar ni perder nada. Conflictos: gana el
último cambio enviado; lo borrado en otro dispositivo descarta mi cambio con aviso; el diario
mantiene la fusión de la 002; los rechazos del servidor se avisan y descartan sin bloquear el
resto. Los cambios pendientes pertenecen a mi cuenta. Fuera de alcance: repaso diario, calendario,
ajustes, importar y exportar sin conexión, y pantallas nunca abiertas con conexión.»

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 - Abrir la app sin conexión y ver mis datos (Prioridad: P1)

El usuario abre la app instalada en el móvil sin conexión (modo avión, metro, zona sin cobertura).
En lugar de un error, ve Hoy, Tareas y Diario con los últimos datos que se cargaron en ese
dispositivo y un aviso claro «Sin conexión». Si tiene cambios aún sin enviar, el aviso indica
cuántos («3 cambios pendientes»).

**Por qué esta prioridad**: sin esto la app no arranca sin conexión y nada más de esta funcionalidad
es posible; ya por sí solo permite consultar hábitos, tareas y notas en cualquier sitio.

**Prueba independiente**: abrir Hoy, Tareas y Diario con conexión; cerrar la app; activar el modo
avión y abrirla desde la pantalla de inicio: se ven los mismos datos y el aviso «Sin conexión».

**Escenarios de aceptación**:

1. **Dado** que el usuario abrió antes Hoy, Tareas y Diario con conexión en ese dispositivo,
   **cuando** abre la app sin conexión, **entonces** la app arranca y muestra en cada pantalla los
   últimos datos cargados.
2. **Dado** que no hay conexión, **cuando** se muestra cualquier pantalla, **entonces** se ve el
   aviso «Sin conexión» de forma clara y permanente mientras dure la desconexión.
3. **Dado** que hay 3 cambios sin enviar, **cuando** se muestra el aviso, **entonces** indica «3
   cambios pendientes» (en singular, «1 cambio pendiente»); si no hay ninguno, no se muestra el
   número.
4. **Dado** que el usuario navega entre Hoy, Tareas y Diario sin conexión, **cuando** cambia de
   pestaña, **entonces** cada pantalla se muestra sin errores ni pantallas en blanco.
5. **Dado** que el usuario abre sin conexión el repaso diario, el calendario o los ajustes,
   **cuando** se muestra la pantalla, **entonces** ve una explicación de que esa sección necesita
   conexión, en lugar de un error.
6. **Dado** que se pierde la conexión con la app abierta, **cuando** ocurre, **entonces** aparece
   el aviso «Sin conexión» sin que el usuario tenga que recargar.

---

### Historia de usuario 2 - Marcar hábitos y gestionar tareas sin conexión (Prioridad: P1)

Sin conexión, el usuario marca y desmarca los hábitos de hoy, completa y descompleta tareas, y las
crea, edita y borra igual que con conexión. Cada cambio se ve al instante, se guarda en el
dispositivo y se envía solo, en el mismo orden en que lo hizo, en cuanto vuelve la conexión, aunque
entretanto haya cerrado la app.

**Por qué esta prioridad**: marcar el hábito o la tarea en el momento es el uso diario principal;
perder un marcado es el peor fallo posible (principio IV de la constitución).

**Prueba independiente**: en modo avión, marcar dos hábitos, crear una tarea, completarla y editar
otra; cerrar la app; desactivar el modo avión y abrirla: todos los cambios aparecen, una sola vez,
en otro dispositivo.

**Escenarios de aceptación**:

1. **Dado** que no hay conexión, **cuando** el usuario marca o desmarca un hábito de hoy,
   **entonces** el cambio se ve al instante y el contador de cambios pendientes aumenta.
2. **Dado** que no hay conexión, **cuando** el usuario crea, edita (título, nota, fecha y hora),
   completa, descompleta o borra una tarea, **entonces** el cambio se ve al instante en la lista.
3. **Dado** que hay cambios pendientes, **cuando** vuelve la conexión, **entonces** se envían solos
   en el orden en que se hicieron, se muestra un indicador discreto «Sincronizando…» y, al terminar,
   el indicador y el aviso desaparecen.
4. **Dado** que el usuario hizo cambios sin conexión y cerró la app, **cuando** la abre más tarde
   con conexión, **entonces** los cambios se envían solos sin que tenga que hacer nada.
5. **Dado** que el usuario crea una tarea sin conexión, **cuando** antes de sincronizar la edita, la
   completa o la borra, **entonces** cada acción funciona igual que con una tarea ya guardada y, al
   sincronizar, el resultado final es el que el usuario ve (si la borró, no llega a existir).
6. **Dado** que un envío se corta a mitad (p. ej. se pierde la cobertura), **cuando** se reintenta,
   **entonces** ningún cambio se aplica dos veces: no aparecen tareas ni hábitos duplicados.
7. **Dado** que el usuario marca y desmarca el mismo hábito varias veces sin conexión, **cuando**
   se sincroniza, **entonces** el estado final en el servidor es el último que vio el usuario.

---

### Historia de usuario 3 - Escribir el diario sin conexión (Prioridad: P1)

El usuario escribe en el diario sin conexión como ya puede hacerlo (feature 002). Ahora además la
pestaña se abre sin conexión con lo último cargado, y lo pendiente del diario cuenta en el aviso de
cambios pendientes.

**Por qué esta prioridad**: el diario ya conserva lo escrito sin conexión; esta historia garantiza
que siga funcionando cuando la app entera arranca sin conexión y que se integre con el aviso común.

**Prueba independiente**: en modo avión, abrir la app desde la pantalla de inicio, escribir en el
día de hoy, cerrar la app; volver a abrirla con conexión: el texto está guardado y se ve en otro
dispositivo.

**Escenarios de aceptación**:

1. **Dado** que no hay conexión, **cuando** el usuario abre el Diario, **entonces** ve la semana
   actual con los textos cargados por última vez y puede escribir en el día de hoy.
2. **Dado** que hay texto del diario sin guardar, **cuando** se muestra el aviso «Sin conexión»,
   **entonces** ese texto cuenta como un cambio pendiente por cada día con texto sin guardar.
3. **Dado** que la nota de ese día cambió en otro dispositivo mientras tanto, **cuando** se
   sincroniza, **entonces** se aplica la fusión de la feature 002 (ambos textos unidos con aviso);
   nunca se pierde texto.

---

### Historia de usuario 4 - Organizar hábitos sin conexión (Prioridad: P2)

Sin conexión, el usuario crea hábitos, edita su nombre y descripción, los archiva o recupera, los
reordena y los borra. Lo que crea sin conexión puede marcarlo, editarlo o borrarlo antes de que se
sincronice.

**Por qué esta prioridad**: es menos frecuente que marcar hábitos, pero el usuario espera que «todo
lo habitual» funcione igual sin conexión.

**Prueba independiente**: en modo avión, crear un hábito, marcarlo hoy, renombrarlo, moverlo al
primer puesto y archivar otro; recuperar la conexión: otro dispositivo muestra el hábito nuevo
marcado, con su nombre final, en primer lugar, y el otro archivado.

**Escenarios de aceptación**:

1. **Dado** que no hay conexión, **cuando** el usuario crea un hábito, **entonces** aparece al
   instante en Hoy y puede marcarlo, editarlo, reordenarlo, archivarlo o borrarlo.
2. **Dado** que no hay conexión, **cuando** edita el nombre o la descripción, archiva, recupera,
   reordena o borra un hábito, **entonces** el cambio se ve al instante.
3. **Dado** que el usuario crea y borra un hábito antes de sincronizar, **cuando** se sincroniza,
   **entonces** ese hábito no llega a existir en el servidor ni en otros dispositivos.
4. **Dado** que el usuario reordena hábitos sin conexión, **cuando** se sincroniza, **entonces** el
   orden en el servidor es el último que vio el usuario.

---

### Historia de usuario 5 - Conflictos y rechazos explicados (Prioridad: P2)

Si el usuario usa varios dispositivos, o el servidor no acepta un cambio, la app resuelve la
situación sola, sin bloquear el resto de cambios, y le avisa con un mensaje breve cuando algo suyo
no se ha aplicado.

**Por qué esta prioridad**: es menos frecuente, pero sin reglas claras se perderían o duplicarían
datos de forma silenciosa, o la cola se quedaría atascada para siempre.

**Prueba independiente**: con dos dispositivos, borrar una tarea en uno y editarla sin conexión en
el otro; al reconectar el segundo, la edición se descarta con un aviso breve y el resto de cambios
pendientes sí se aplican.

**Escenarios de aceptación**:

1. **Dado** que el mismo hábito o tarea se cambió en dos dispositivos, **cuando** ambos se
   sincronizan, **entonces** queda el último cambio que llegó al servidor.
2. **Dado** que el usuario edita, marca, completa o borra sin conexión algo que se borró en otro
   dispositivo, **cuando** se sincroniza, **entonces** su cambio se descarta y ve un mensaje breve
   que lo indica (p. ej. «La tarea “Comprar pan” se borró en otro dispositivo; tu cambio no se ha
   aplicado»).
3. **Dado** que el servidor rechaza un cambio (p. ej. se superaría el límite de 100 hábitos o un
   dato no es válido), **cuando** se sincroniza, **entonces** se avisa de qué cambio se rechazó y
   por qué, se descarta, la pantalla vuelve a mostrar el estado real y los demás cambios siguen
   enviándose.
4. **Dado** que un cambio rechazado era la creación de un hábito o tarea, **cuando** se descarta,
   **entonces** también se descartan los cambios pendientes posteriores sobre ese mismo elemento,
   con un único aviso.
5. **Dado** que el envío falla por falta de conexión o por un error temporal del servidor,
   **cuando** ocurre, **entonces** el cambio NO se descarta: se reintenta automáticamente más tarde.

---

### Historia de usuario 6 - Los cambios pendientes son de mi cuenta (Prioridad: P2)

Los cambios pendientes quedan ligados a la cuenta con la que se hicieron. Si el usuario intenta
cerrar sesión con cambios sin enviar, se le avisa antes; y nunca se envían con otra cuenta.

**Por qué esta prioridad**: protege la privacidad y evita mezclar datos entre cuentas en un
dispositivo compartido (principio II de la constitución).

**Prueba independiente**: sin conexión, marcar un hábito y cerrar sesión (aceptando el aviso);
entrar con otra cuenta con conexión: no ve ni recibe el cambio. Volver a entrar con la primera
cuenta: el cambio se envía.

**Escenarios de aceptación**:

1. **Dado** que hay cambios pendientes, **cuando** el usuario pulsa «Cerrar sesión», **entonces** se
   le avisa de cuántos cambios hay sin enviar y puede cancelar o cerrar sesión igualmente.
2. **Dado** que cierra sesión igualmente, **cuando** entra otra cuenta en ese dispositivo,
   **entonces** esa cuenta no ve los datos ni los cambios pendientes de la anterior, y estos nunca
   se envían con ella.
3. **Dado** que vuelve a entrar la cuenta original en ese dispositivo, **cuando** hay conexión,
   **entonces** sus cambios pendientes se envían como en la historia 2.

---

### Casos límite

- **Pantalla nunca abierta con conexión en ese dispositivo**: sin conexión se muestra un mensaje que
  explica que hace falta conectarse al menos una vez para verla; no una pantalla en blanco.
- **Primera vez sin conexión tras instalar o entrar**: si el dispositivo aún no tiene datos
  guardados, se explica que hace falta conexión para la primera carga.
- **Cambio de día sin conexión**: si pasa la medianoche sin conexión, Hoy muestra el nuevo día con
  los hábitos conocidos sin marcar; los marcados quedan en el día en que el usuario los hizo.
- **Sesión caducada mientras estaba sin conexión**: los cambios pendientes se conservan; si al
  reconectar hace falta volver a entrar, se envían después de que entre la misma cuenta.
- **Conexión intermitente o «conectado» sin acceso real** (wifi sin internet): la app trata los
  envíos fallidos como falta de conexión, los reintenta y nunca los descarta por ello.
- **Dos pestañas o ventanas abiertas a la vez en el mismo dispositivo**: los cambios se envían una
  sola vez y en orden.
- **Límite de 100 hábitos**: sin conexión el usuario puede intentar crear hábitos según los datos
  que conoce; si al sincronizar se supera el límite (p. ej. por hábitos creados en otro
  dispositivo), los que sobran se rechazan con aviso (historia 5).
- **Datos que cambiaron en otro dispositivo**: al recuperar la conexión, tras enviar los cambios
  pendientes, las pantallas se actualizan con los datos del servidor.
- **Hábito archivado en otro dispositivo y marcado sin conexión en este**: el marcado se aplica (el
  hábito sigue existiendo); solo se descartan los cambios sobre elementos borrados.
- **Muchos cambios acumulados** (p. ej. una semana sin conexión): todos se conservan y se envían; el
  contador refleja el número real.
- **Sin conexión, acciones fuera de alcance** (exportar, importar, ajustes): los botones aparecen
  desactivados con una explicación breve de que necesitan conexión.
- **El dispositivo se queda sin espacio para guardar cambios**: se avisa al usuario de que el
  cambio no se ha podido guardar en el dispositivo; nunca se finge que se ha guardado.

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Abrir y consultar sin conexión**

- **FR-001**: La app instalada DEBE arrancar sin conexión y mostrar Hoy, Tareas y Diario con los
  últimos datos cargados en ese dispositivo para la cuenta con sesión iniciada.
- **FR-002**: Los datos mostrados sin conexión DEBEN incluir los cambios pendientes del usuario
  aplicados encima de los últimos datos cargados.
- **FR-003**: Mientras no haya conexión, DEBE mostrarse un aviso claro «Sin conexión» en todas las
  pantallas; si hay cambios pendientes, DEBE indicar cuántos («1 cambio pendiente», «3 cambios
  pendientes»).
- **FR-004**: Al recuperar la conexión con cambios pendientes, DEBE mostrarse un indicador discreto
  «Sincronizando…» mientras se envían; al terminar sin cambios pendientes, no DEBE quedar ningún
  aviso ni indicador.
- **FR-005**: El estado de conexión DEBE detectarse solo, sin que el usuario recargue, tanto al
  perderla como al recuperarla.
- **FR-006**: Una pantalla de Hoy, Tareas o Diario que nunca se haya cargado con conexión en ese
  dispositivo DEBE mostrar, sin conexión, un mensaje que explique que necesita conexión la primera
  vez.
- **FR-007**: Sin conexión, el repaso diario, el calendario, los ajustes, importar y exportar DEBEN
  mostrarse desactivados con una explicación breve de que necesitan conexión.

**Cambios sin conexión**

- **FR-008**: Sin conexión, el usuario DEBE poder marcar y desmarcar los hábitos de hoy, y crear,
  editar (nombre y descripción), archivar, recuperar, reordenar y borrar hábitos.
- **FR-009**: Sin conexión, el usuario DEBE poder crear tareas, editarlas (título, nota, fecha y
  hora), completarlas, descompletarlas y borrarlas.
- **FR-010**: Sin conexión, el diario DEBE funcionar como en la feature 002 (FR-009 a FR-015,
  FR-030 y FR-033 de esa especificación).
- **FR-011**: Cada cambio DEBE verse en pantalla al instante (menos de 100 ms), con o sin conexión.
- **FR-012**: Cada cambio DEBE guardarse en el dispositivo antes de darse por hecho y DEBE
  sobrevivir al cierre de la app y al reinicio del móvil, incluso en iPhone como app de pantalla de
  inicio.
- **FR-013**: Los elementos creados sin conexión DEBEN poder marcarse, editarse, reordenarse,
  archivarse o borrarse antes de sincronizarse, con el mismo comportamiento que los ya guardados.
- **FR-014**: Las validaciones que la app ya hace con conexión (campos obligatorios, longitudes)
  DEBEN aplicarse también sin conexión, antes de aceptar el cambio.

**Sincronización**

- **FR-015**: Los cambios pendientes DEBEN enviarse automáticamente, sin acción del usuario, en
  cuanto haya conexión: al recuperarla con la app abierta, al abrir o volver a la app, y mediante
  reintentos periódicos mientras queden pendientes.
- **FR-016**: Los cambios DEBEN aplicarse en el servidor en el mismo orden en que el usuario los
  hizo.
- **FR-017**: Cada cambio DEBE aplicarse en el servidor exactamente una vez, aunque su envío se
  repita por cortes o reintentos: nunca DEBEN aparecer duplicados ni perderse cambios.
- **FR-018**: Un cambio solo DEBE eliminarse del dispositivo cuando el servidor lo haya confirmado o
  se haya descartado según FR-020 a FR-022.
- **FR-019**: Tras sincronizar, las pantallas DEBEN actualizarse con los datos del servidor,
  incluidos los cambios hechos en otros dispositivos.

**Conflictos y rechazos**

- **FR-020**: Si el mismo hábito o tarea se cambia en varios dispositivos, DEBE prevalecer el
  último cambio que llegue al servidor.
- **FR-021**: Si un cambio pendiente afecta a un hábito o tarea que se borró en otro dispositivo,
  DEBE descartarse y avisarse al usuario con un mensaje breve que nombre el elemento.
- **FR-022**: Si el servidor rechaza un cambio por una regla de negocio o un dato no válido (p. ej.
  el límite de 100 hábitos), DEBE avisarse al usuario de qué cambio fue y por qué, descartarse sin
  reintentarlo y continuar con los siguientes; los cambios pendientes posteriores sobre un elemento
  cuya creación se rechazó DEBEN descartarse con el mismo aviso.
- **FR-023**: Los fallos por falta de conexión o errores temporales del servidor NO DEBEN descartar
  cambios; DEBEN reintentarse.
- **FR-024**: Al descartar un cambio, la pantalla DEBE volver a mostrar el estado real del servidor
  para ese elemento.
- **FR-025**: En el diario, ningún conflicto DEBE perder texto; se mantiene la fusión de la feature
  002 (FR-030 de esa especificación).

**Cuenta y privacidad**

- **FR-026**: Los cambios pendientes y los datos guardados en el dispositivo DEBEN quedar ligados a
  la cuenta con la que se hicieron o cargaron, y solo enviarse o mostrarse con esa misma cuenta.
- **FR-027**: Al pulsar «Cerrar sesión» con cambios pendientes, DEBE avisarse antes al usuario de
  cuántos hay sin enviar, permitiéndole cancelar o cerrar sesión igualmente.
- **FR-028**: Cerrar sesión NO DEBE borrar los cambios pendientes de esa cuenta; DEBEN enviarse
  cuando vuelva a entrar esa misma cuenta en el dispositivo.
- **FR-029**: Otra cuenta que entre en el mismo dispositivo NO DEBE ver los datos guardados ni los
  cambios pendientes de la anterior.

**Generales**

- **FR-030**: Los avisos, indicadores y mensajes DEBEN estar en español, verse sin desplazamiento
  horizontal entre 360 y 430 px de ancho, en modo claro y oscuro, y no tapar las acciones
  principales; sus botones DEBEN tener una zona táctil de al menos 44×44 px.
- **FR-031**: El cambio NO DEBE modificar el formato de los datos exportados ni la importación de
  copias de seguridad.

### Entidades clave

- **Copia local de datos**: los últimos hábitos, marcados, tareas y notas cargados en el
  dispositivo para una cuenta; permite mostrar las pantallas sin conexión.
- **Cambio pendiente**: una acción del usuario (marcar, crear, editar, reordenar, archivar,
  completar, borrar…) guardada en el dispositivo y aún no confirmada por el servidor. Pertenece a
  una cuenta, tiene un orden, un identificador único para no aplicarse dos veces y el elemento al
  que afecta.
- **Aviso de sincronización**: mensaje breve al usuario sobre un cambio descartado (borrado en otro
  dispositivo o rechazado por el servidor), con el elemento afectado y el motivo.
- **Estado de conexión**: «Sin conexión», «Sincronizando…» o normal (sin indicador), junto con el
  número de cambios pendientes.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: Con el móvil en modo avión, la app instalada muestra Hoy con los datos de la última
  carga en menos de 3 s desde que se toca su icono.
- **SC-002**: En 20 pruebas de hacer cambios sin conexión, cerrar la app y reabrirla con conexión
  (incluido iPhone como app de pantalla de inicio), el 100 % de los cambios llegan al servidor, una
  sola vez y con el resultado final que vio el usuario.
- **SC-003**: Con 50 cambios pendientes de hábitos, tareas y diario, todos quedan sincronizados en
  menos de 30 s tras recuperar una conexión normal.
- **SC-004**: Cada acción sin conexión (marcar, completar, crear, editar, borrar) se refleja en
  pantalla sin retraso perceptible (menos de 100 ms).
- **SC-005**: En pruebas de cortes de conexión a mitad de sincronización, no aparece ningún
  elemento duplicado ni se pierde ningún cambio.
- **SC-006**: Un cambio rechazado o descartado nunca deja la sincronización bloqueada: los demás
  cambios se aplican y el contador de pendientes llega a 0.
- **SC-007**: En ninguna prueba con dos cuentas en el mismo dispositivo los datos o cambios de una
  cuenta se muestran o se envían con la otra.

## Supuestos

- «Sin conexión» incluye tanto no tener red como tenerla sin acceso real al servidor; ambos casos se
  tratan igual.
- El aviso «Sin conexión» es permanente mientras dura la desconexión pero compacto, para no tapar
  el contenido; los mensajes de cambios descartados son breves y desaparecen solos o al tocarlos.
- El número de cambios pendientes cuenta cada acción del usuario aún no confirmada; si el usuario
  hace varias acciones sobre el mismo elemento, puede contarse cada una (no se exige agruparlas).
  En el diario cuenta un cambio por día con texto sin guardar.
- «Gana el último cambio enviado» se aplica por elemento completo (hábito o tarea), no campo a
  campo, salvo en el diario, que conserva la fusión de texto de la 002.
- Marcar un hábito archivado en otro dispositivo se aplica (no está borrado); solo los elementos
  borrados descartan cambios.
- Hoy sin conexión usa el día natural en la zona horaria del usuario, como con conexión
  (constitución, principio IV).
- Los datos guardados en el dispositivo se limitan a lo necesario para Hoy, Tareas y Diario; no se
  guardan sin conexión el historial completo, el calendario ni el repaso.
- Los datos del dispositivo de una cuenta pueden borrarse si el usuario borra los datos del
  navegador; eso queda fuera del control de la app.
- Las reglas del servidor (límite de 100 hábitos, longitudes, RLS) no cambian y siguen siendo la
  referencia final al sincronizar.
- Fuera de alcance: repaso diario, calendario, ajustes, importar y exportar sin conexión; pantallas
  nunca abiertas con conexión en ese dispositivo; elegir manualmente qué versión conservar en un
  conflicto; historial de cambios descartados.
