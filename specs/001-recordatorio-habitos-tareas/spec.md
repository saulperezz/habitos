# Especificación de la funcionalidad: Recordatorio diario de hábitos, lista de tareas y agenda en el calendario

**Rama de la funcionalidad**: `001-recordatorio-habitos-tareas`

**Creada**: 2026-11-04

**Estado**: Borrador

**Entrada**: Descripción del usuario: "quiero mejorar esta aplicacion, haciendo que interactue directamente con mi dispositivo movil, de forma que me pregunte de algun modo, a tal hora del dia, que habitos, uno por uno, he cumplido, y que lo demuestre asi en la aplicacion, de forma que aparezcan los habitos que he cumplido cada dia. tambien quiero que en la aplicacion, haya una ventana donde pueda trackear que cosas tengo que cumplir proximamente, como una lista de tareas, asi como que pueda gastar el calendario que ya tiene la aplicacion, para poner tareas o eventos pendientes. otra cosa que quiero es que todos los archivos esten en español"

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 - Repaso diario de hábitos, uno por uno (Prioridad: P1)

Cada día, a la hora que el usuario ha elegido, la aplicación le pregunta por cada uno de sus hábitos,
de uno en uno, si lo ha cumplido ese día. El usuario responde «Sí» o «No» (o lo salta) y, al terminar,
los hábitos marcados como cumplidos aparecen completados en la lista del día y en el calendario.

**Por qué esta prioridad**: es el núcleo de la petición: que la aplicación tome la iniciativa y
pregunte, en lugar de depender de que el usuario se acuerde de marcar cada hábito.

**Prueba independiente**: configurar una hora de repaso, tener al menos 3 hábitos, esperar a esa hora
(o adelantarla) y comprobar que se pregunta por cada hábito en orden y que las respuestas «Sí» quedan
reflejadas como completadas ese día.

**Escenarios de aceptación**:

1. **Dado** que el usuario tiene 3 hábitos y una hora de repaso a las 22:00, **cuando** llegan las
   22:00, **entonces** recibe un aviso en el móvil (según el mecanismo de FR-003) que le invita a
   hacer el repaso del día.
2. **Dado** que el usuario abre el repaso, **cuando** responde «Sí» al primer hábito, **entonces** el
   hábito queda marcado como cumplido hoy y se muestra el siguiente hábito.
3. **Dado** que el usuario responde «No» o «Saltar» a un hábito, **cuando** pasa al siguiente,
   **entonces** ese hábito queda como no cumplido hoy (o sin cambios si ya estaba marcado).
4. **Dado** que el usuario ha respondido a todos los hábitos, **cuando** termina el repaso,
   **entonces** ve un resumen «X de Y cumplidos» y vuelve a la pantalla principal con la lista
   actualizada.
5. **Dado** que el usuario no ha hecho el repaso de hoy y ya pasó la hora configurada, **cuando** abre
   la aplicación, **entonces** se le ofrece hacer el repaso pendiente.
6. **Dado** que el usuario ya completó el repaso de hoy, **cuando** vuelve a abrir la aplicación ese
   mismo día, **entonces** no se le vuelve a ofrecer el repaso automáticamente.

---

### Historia de usuario 2 - Ver qué hábitos se cumplieron cada día (Prioridad: P1)

En el calendario existente, el usuario toca un día pasado y ve la lista de hábitos que cumplió (y los
que no) ese día.

**Por qué esta prioridad**: el usuario pide explícitamente «que aparezcan los hábitos que he cumplido
cada día»; hoy el calendario solo muestra un contador «X/Y».

**Prueba independiente**: con datos de varios días, abrir el calendario, tocar un día y comprobar que
aparece el detalle correcto de hábitos cumplidos y no cumplidos.

**Escenarios de aceptación**:

1. **Dado** que el día 3 el usuario cumplió 2 de 4 hábitos, **cuando** toca el día 3 en el calendario,
   **entonces** ve los 2 hábitos cumplidos marcados como hechos y los otros 2 como no cumplidos.
2. **Dado** un día sin ningún hábito cumplido, **cuando** el usuario lo toca, **entonces** ve todos
   los hábitos como no cumplidos y un mensaje indicándolo.

---

### Historia de usuario 3 - Lista de tareas pendientes (Prioridad: P2)

El usuario dispone de una nueva sección «Tareas» donde apunta cosas que tiene que hacer próximamente,
con fecha opcional, y las marca como hechas cuando las termina.

**Por qué esta prioridad**: aporta valor por sí sola, pero no es el núcleo de la app de hábitos.

**Prueba independiente**: abrir la sección «Tareas», crear varias tareas (con y sin fecha), marcar una
como hecha y eliminar otra; cerrar y reabrir la app y comprobar que todo se conserva.

**Escenarios de aceptación**:

1. **Dado** que el usuario está en la pantalla principal, **cuando** cambia a la sección «Tareas»,
   **entonces** ve sus tareas pendientes ordenadas por fecha (las que no tienen fecha al final).
2. **Dado** que el usuario crea una tarea con título y fecha, **cuando** la guarda, **entonces**
   aparece en la lista en la posición que le corresponde por fecha.
3. **Dado** una tarea pendiente, **cuando** el usuario la marca como hecha, **entonces** pasa a un
   apartado de completadas y deja de contar como pendiente.
4. **Dado** una tarea con fecha anterior a hoy y no hecha, **cuando** se muestra la lista,
   **entonces** aparece destacada como vencida.

---

### Historia de usuario 4 - Tareas y eventos en el calendario (Prioridad: P2)

Desde el calendario existente, el usuario toca cualquier día (pasado, hoy o futuro) y puede añadir una
tarea o un evento para ese día. Los días con tareas o eventos pendientes se distinguen visualmente.

**Por qué esta prioridad**: amplía el calendario con planificación futura; depende del modelo de
tareas de la historia 3.

**Prueba independiente**: tocar un día futuro, añadir un evento con hora, comprobar que el día se
marca en el calendario y que el evento aparece también en la sección «Tareas».

**Escenarios de aceptación**:

1. **Dado** que el usuario abre el calendario, **cuando** toca un día futuro, **entonces** ve las
   tareas/eventos de ese día y una opción para añadir uno nuevo.
2. **Dado** que el usuario añade un evento con hora a un día, **cuando** cierra el detalle,
   **entonces** ese día muestra un indicador de pendientes en la cuadrícula del calendario.
3. **Dado** una tarea creada desde la sección «Tareas» con fecha, **cuando** el usuario abre el
   calendario, **entonces** la tarea aparece en ese día.

---

### Historia de usuario 5 - Aplicación y documentación íntegramente en español (Prioridad: P3)

Todos los textos visibles de la aplicación y todos los documentos del proyecto están en español.

**Por qué esta prioridad**: requisito transversal de idioma; la interfaz ya está mayoritariamente en
español.

**Prueba independiente**: revisar cada pantalla y cada documento del proyecto y comprobar que no
queda texto en otro idioma (salvo nombres propios o términos técnicos sin traducción habitual).

**Escenarios de aceptación**:

1. **Dado** cualquier pantalla, aviso o mensaje de la app, **cuando** el usuario lo ve, **entonces**
   está en español con ortografía correcta (tildes incluidas, p. ej. «hábito», «descripción»).
2. **Dado** cualquier documento del proyecto (especificaciones, planes, constitución),
   **cuando** se revisa, **entonces** está redactado en español.

---

### Casos límite

- El usuario no tiene ningún hábito cuando llega la hora del repaso: no se muestra repaso; como mucho
  un mensaje invitando a crear hábitos.
- El usuario no ha concedido permiso para avisos en el dispositivo: la app sigue funcionando y ofrece el
  repaso al abrirla tras la hora configurada; se le explica cómo activar los avisos.
- El móvil está sin conexión a la hora del aviso: la notificación puede llegar tarde o no llegar; el
  repaso se ofrece igualmente al abrir la app.
- El usuario ya hizo el repaso antes de la hora configurada: ese día no se envía la notificación
  o, si llega, al abrirla se indica que el repaso ya está hecho.
- El usuario viaja a otra zona horaria: el aviso sigue la hora local configurada del usuario
  (Europe/Madrid por defecto).
- El usuario abandona el repaso a mitad: las respuestas ya dadas se conservan y al reabrir se puede
  continuar con los hábitos que faltan.
- El repaso se hace después de medianoche: se registra para el día al que corresponde el repaso
  (el día anterior), no para el nuevo día, si se hace antes de las 04:00. *(Supuesto razonable.)*
- Se añade o elimina un hábito el mismo día después del repaso: el repaso no se vuelve a lanzar solo,
  pero el usuario puede iniciarlo manualmente.
- Se elimina un hábito: su historial deja de mostrarse en el detalle de días pasados.
- Datos existentes de la versión actual: se conservan íntegros los hábitos y su historial.
- Una tarea sin título: no se puede guardar y se muestra un mensaje de error.
- Muchas tareas el mismo día: el calendario muestra un único indicador y el detalle del día las lista
  todas.

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Repaso diario**

- **FR-001**: El sistema DEBE permitir al usuario configurar una hora diaria de repaso y activarlo o
  desactivarlo.
- **FR-002**: El repaso DEBE presentar los hábitos de uno en uno, en el orden de la lista, con las
  opciones «Sí, cumplido», «No» y «Saltar», y un indicador de progreso (p. ej. «2 de 5»).
- **FR-003**: A la hora configurada, el sistema DEBE enviar una notificación del sistema al móvil del
  usuario aunque la aplicación esté cerrada; se acepta un servicio externo para programar y enviar
  ese aviso. Al tocar la notificación DEBE abrirse la app directamente en el repaso.
- **FR-003a**: El usuario DEBE dar su permiso explícito para recibir notificaciones antes de activarlas,
  y DEBE poder desactivarlas o cambiar la hora en cualquier momento; el cambio DEBE aplicarse al
  siguiente aviso.
- **FR-003b**: Al servicio externo solo se le DEBE enviar lo imprescindible para el aviso (hora,
  zona horaria y la dirección de entrega del dispositivo); nunca nombres de hábitos, historial ni
  tareas.
- **FR-003c**: Si el servicio externo no está disponible o falla el aviso, la app DEBE seguir
  funcionando sin conexión y ofrecer el repaso al abrirla (FR-004).
- **FR-004**: Si ha pasado la hora del repaso y no se ha completado ese día, el sistema DEBE ofrecer el
  repaso al abrir la aplicación.
- **FR-005**: Las respuestas del repaso DEBEN reflejarse de inmediato en la lista del día, la barra de
  progreso, las rachas y el calendario, igual que si el hábito se hubiera marcado a mano.
- **FR-006**: El usuario DEBE poder iniciar el repaso manualmente en cualquier momento.
- **FR-007**: El sistema DEBE recordar qué hábitos se han respondido en un repaso interrumpido y
  permitir continuarlo ese mismo día.

**Historial por día**

- **FR-008**: Al tocar un día pasado o el actual en el calendario, el sistema DEBE mostrar qué hábitos
  se cumplieron y cuáles no ese día.

**Tareas y eventos**

- **FR-009**: El sistema DEBE ofrecer una sección «Tareas» accesible desde la pantalla principal en un
  toque.
- **FR-010**: El usuario DEBE poder crear una tarea con título obligatorio (máx. 80 caracteres), nota
  opcional, fecha opcional y hora opcional.
- **FR-011**: El usuario DEBE poder marcar una tarea como hecha, desmarcarla, editarla y eliminarla.
- **FR-012**: La lista de tareas DEBE mostrar primero las pendientes ordenadas por fecha y hora (sin
  fecha al final), destacar las vencidas y mostrar aparte las completadas.
- **FR-013**: Al tocar cualquier día en el calendario, el usuario DEBE ver las tareas/eventos de ese
  día y poder añadir uno nuevo con la fecha ya rellenada.
- **FR-014**: La cuadrícula del calendario DEBE indicar visualmente los días con tareas/eventos
  pendientes, además del estado de hábitos ya existente, y DEBE permitir navegar a meses futuros
  mostrando esos indicadores.
- **FR-015**: Un «evento» es una tarea con hora; tareas y eventos comparten la misma lista y los mismos
  datos.

**Idioma y datos**

- **FR-016**: Todos los textos de la interfaz, avisos y mensajes DEBEN estar en español con ortografía
  correcta.
- **FR-017**: Todos los documentos del proyecto (constitución, especificaciones, planes, tareas y
  guías) DEBEN estar en español. El código fuente conserva sus nombres actuales; no se exige renombrar
  funciones ni variables.
- **FR-018**: Los hábitos y el historial existentes DEBEN conservarse sin pérdida tras la
  actualización.
- **FR-019**: Todos los datos (hábitos, respuestas, tareas, configuración) DEBEN guardarse solo en el
  dispositivo del usuario; la única excepción es la información mínima del aviso descrita en FR-003b.

### Entidades clave

- **Hábito** (existente): nombre, descripción opcional, historial de días cumplidos.
- **Configuración del repaso**: hora diaria, activado/desactivado, permiso de avisos concedido o no.
- **Estado del repaso del día**: fecha, hábitos ya respondidos, completado o no.
- **Tarea**: título, nota opcional, fecha opcional, hora opcional, hecha o no, fecha de creación. Con
  hora se muestra como «evento».

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: El usuario completa el repaso diario de 5 hábitos en menos de 30 segundos.
- **SC-002a**: Con permiso concedido y el móvil conectado, la notificación llega como máximo 5 minutos
  después de la hora configurada en al menos el 95 % de los días, aunque la app esté cerrada.
- **SC-002**: En el 100 % de los días en que el usuario abre la app tras la hora configurada sin haber
  hecho el repaso, se le ofrece hacerlo.
- **SC-003**: El usuario puede consultar qué hábitos cumplió cualquier día pasado en 2 toques o menos
  desde la pantalla principal.
- **SC-004**: El usuario crea una tarea con fecha en menos de 15 segundos, desde la sección «Tareas» o
  desde el calendario.
- **SC-005**: El 100 % de los hábitos e historial existentes antes de la actualización siguen visibles
  después.
- **SC-006**: Ningún texto visible de la app ni ningún documento del proyecto queda en un idioma
  distinto del español.

## Supuestos

- Hay un único usuario y un único dispositivo (su móvil); no hay cuentas ni sincronización entre
  dispositivos.
- La hora de repaso es una sola para todos los hábitos (no una por hábito); por defecto las 22:00.
- Todos los hábitos son diarios; no se introducen frecuencias semanales ni días concretos.
- El repaso hecho entre las 00:00 y las 04:00 se registra para el día anterior.
- El repaso no permite editar días anteriores al actual (salvo el caso de madrugada anterior); la
  edición de días pasados queda fuera de alcance.
- Las tareas no son recurrentes y no generan avisos propios en esta versión.
- La app se usa principalmente añadida a la pantalla de inicio del móvil; esto es requisito para
  recibir notificaciones del sistema en iPhone.
- Se acepta depender de un servicio externo (gratuito o de coste mínimo) solo para enviar el aviso
  diario. Esto choca con los principios I y II de la constitución (v1.0.0), que habrá que modificar
  antes de que el plan supere la Comprobación de Constitución.
- Las notificaciones se piden solo para el repaso de hábitos; las tareas no generan avisos.
