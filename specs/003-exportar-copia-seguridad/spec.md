# Especificación de la funcionalidad: Exportar copia de seguridad

**Rama de la funcionalidad**: `003-exportar-copia`

**Creada**: 2026-11-10

**Estado**: Borrador

**Entrada**: descripción del usuario: «Añadir en Ajustes de saas/ la opción “Exportar copia de
seguridad”, que descarga un archivo JSON con todos mis datos: hábitos (con nombre, descripción,
orden y si están archivados), historial de días cumplidos, tareas, notas del diario, estado de los
repasos y la configuración del repaso (activo y hora). El archivo se llama
mis-habitos-AAAA-MM-DD.json y debe poder volver a importarse con la opción “Traer datos” que ya
existe en Ajustes sin perder nada (ida y vuelta completa), y en la medida de lo posible también en
la app original de index.html (mismo formato: app, version, exportado, datos.habits,
datos.habitos_tareas, datos.habitos_notas, datos.habitos_repaso, datos.habitos_config). Importar
una copia en una cuenta que ya tiene esos datos no debe duplicar hábitos, tareas ni historial:
ahora mismo import_legacy_backup añade siempre hábitos y tareas nuevos, así que hay que decidir
cómo se reconocen los que ya existen. Mostrar en Ajustes la fecha de la última copia exportada y un
aviso suave si han pasado más de 30 días. Fuera de alcance: copias automáticas o en la nube.»

## Clarifications

### Session 2026-11-10

- Q: ¿Cómo se reconoce al importar un hábito que ya existe en la cuenta? → A: Por el identificador
  interno que lleva la copia; si no lo trae (copias de la app original), por nombre sin distinguir
  mayúsculas ni espacios sobrantes.
- Q: Si la cuenta ya tiene una nota para un día de la copia con un texto distinto, ¿qué se hace? →
  A: Se unen ambos textos con un separador y se avisa; pero si el texto de la copia es igual al de
  la cuenta o ya está contenido en él, no se toca nada (reimportar la misma copia no duplica
  texto). El resumen final indica cuántas notas se han unido para revisarlas.

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 - Descargar una copia con todos mis datos (Prioridad: P1)

El usuario entra en Ajustes y pulsa «Exportar copia de seguridad». Con un solo toque obtiene un
archivo `mis-habitos-AAAA-MM-DD.json` (con la fecha de hoy en su zona horaria) que contiene todos
sus hábitos (activos y archivados, con nombre, descripción y orden), los días cumplidos de cada
uno, todas sus tareas (pendientes y hechas), todas las notas del diario, el estado de sus repasos y
su configuración del repaso (activo y hora). En iPhone puede guardarlo en Archivos o enviarlo con
la hoja de compartir; en el resto de dispositivos se descarga. Al terminar ve un aviso de éxito.

**Por qué esta prioridad**: es el núcleo de la funcionalidad; sin copia exportable no hay nada que
reimportar ni fecha que mostrar, y protege los datos del usuario frente a pérdidas (principio IV).

**Prueba independiente**: con una cuenta que tenga hábitos activos y archivados, historial, tareas,
notas y repasos, exportar la copia y comprobar que el archivo tiene el nombre esperado y contiene
cada uno de esos elementos con sus datos.

**Escenarios de aceptación**:

1. **Dado** un usuario con 5 hábitos activos, 2 archivados, historial, tareas, notas y repasos,
   **cuando** pulsa «Exportar copia de seguridad», **entonces** obtiene un archivo
   `mis-habitos-AAAA-MM-DD.json` con la fecha de hoy que contiene los 7 hábitos (indicando cuáles
   están archivados y en qué orden van), todos los días cumplidos, todas las tareas, todas las
   notas, los repasos y la configuración del repaso.
2. **Dado** un usuario recién registrado sin datos, **cuando** exporta, **entonces** obtiene un
   archivo válido con listas vacías y su configuración del repaso.
3. **Dado** que la exportación falla (p. ej. sin conexión), **cuando** el usuario pulsa el botón,
   **entonces** ve un mensaje en español indicando que no se pudo exportar y que lo intente de
   nuevo, y la fecha de la última copia no cambia.
4. **Dado** un usuario en iPhone que cancela la hoja de compartir, **cuando** la cierra sin guardar,
   **entonces** no se muestra error ni se actualiza la fecha de la última copia.

---

### Historia de usuario 2 - Restaurar la copia sin perder ni duplicar nada (Prioridad: P1)

El usuario elige en «Traer datos» un archivo exportado desde `saas/`. Si la cuenta está vacía (p.
ej. una cuenta nueva), queda exactamente igual que cuando se exportó. Si la cuenta ya tiene esos
datos (por ejemplo, reimporta la misma copia por error, o importa una copia antigua), no aparecen
hábitos, tareas ni días cumplidos repetidos: lo que ya existe se reconoce y solo se añade lo que
falta. Al terminar ve cuántos elementos se han añadido.

**Por qué esta prioridad**: una copia que no se puede restaurar sin pérdidas o que duplica datos al
reimportarla no sirve como copia de seguridad.

**Prueba independiente**: exportar una cuenta, importar el archivo en una cuenta nueva y comparar
ambas; después importar el mismo archivo otra vez en la cuenta original y comprobar que nada se
duplica.

**Escenarios de aceptación**:

1. **Dada** una copia exportada desde `saas/`, **cuando** se importa en una cuenta vacía,
   **entonces** la cuenta tiene los mismos hábitos (mismo nombre, descripción, orden y estado de
   archivado), los mismos días cumplidos, las mismas tareas (con su nota, fecha, hora, estado y
   fecha de creación y de realización), las mismas notas, los mismos repasos y la misma
   configuración del repaso.
2. **Dada** una cuenta de la que se acaba de exportar una copia, **cuando** se importa esa misma
   copia en ella, **entonces** no se crea ningún hábito, tarea, día cumplido ni nota nueva y el
   mensaje indica que no había nada nuevo que añadir.
3. **Dada** una copia antigua y una cuenta en la que, después de exportarla, se han creado hábitos,
   marcado días y añadido tareas, **cuando** se importa la copia, **entonces** se conservan todos
   los datos actuales y solo se añaden los elementos de la copia que no existían.
4. **Dado** un hábito de la copia que en la cuenta se ha renombrado o archivado después de
   exportar, **cuando** se importa la copia, **entonces** se reconoce como el mismo hábito
   (por su identificador), se le añaden los días cumplidos que falten y no se crea un hábito nuevo;
   su nombre y su estado de archivado actuales no cambian.
5. **Dada** una nota del diario de un día que existe en la cuenta con un texto distinto al de la
   copia (y que no lo contiene), **cuando** se importa la copia, **entonces** la nota queda con el
   texto de la cuenta, un separador y el texto de la copia, y el resumen final indica cuántas notas
   se han unido para que el usuario las revise.
6. **Dada** una nota de la cuenta cuyo texto es igual al de la copia o ya lo contiene (p. ej.
   porque se unió en una importación anterior), **cuando** se importa la copia, **entonces** la nota
   no cambia y no cuenta como unida ni como añadida.
7. **Dada** una copia de la app original con un hábito «Leer» y una cuenta con un hábito «leer »,
   **cuando** se importa, **entonces** se reconocen como el mismo hábito y solo se añaden los días
   que falten.

---

### Historia de usuario 3 - Saber cuándo hice la última copia (Prioridad: P2)

En Ajustes, junto al botón de exportar, el usuario ve la fecha de su última copia exportada (p. ej.
«Última copia: 3 de noviembre de 2026»). Si han pasado más de 30 días, o nunca ha exportado y ya
tiene datos, ve un aviso suave que le recomienda hacer una copia, sin bloquear nada.

**Por qué esta prioridad**: ayuda a mantener el hábito de hacer copias, pero la copia funciona sin
ello.

**Prueba independiente**: exportar y comprobar la fecha mostrada; simular una última copia de hace
31 días y comprobar que aparece el aviso; con 30 días o menos, que no aparece.

**Escenarios de aceptación**:

1. **Dado** un usuario que exportó hoy, **cuando** abre Ajustes, **entonces** ve «Última copia:» con
   la fecha de hoy y ningún aviso.
2. **Dado** un usuario cuya última copia fue hace 31 días, **cuando** abre Ajustes, **entonces** ve
   la fecha y un aviso suave del tipo «Hace más de un mes de tu última copia. Te recomendamos hacer
   una nueva.».
3. **Dado** un usuario con datos que nunca ha exportado, **cuando** abre Ajustes, **entonces** ve
   «Aún no has hecho ninguna copia» con el mismo aviso suave.
4. **Dado** un usuario que exportó desde el móvil, **cuando** abre Ajustes en el ordenador,
   **entonces** ve la misma fecha de última copia.

---

### Historia de usuario 4 - Llevar la copia a la app original (Prioridad: P3)

El usuario importa en la app original (`index.html`) un archivo exportado desde `saas/` con su
opción de importar copia. La app original lo acepta y muestra sus hábitos activos con su historial,
sus tareas, sus notas, el repaso más reciente y la configuración del repaso.

**Por qué esta prioridad**: el usuario lo pide «en la medida de lo posible»; es una vía de escape,
no el uso principal, y la app original está congelada.

**Prueba independiente**: exportar desde `saas/`, importar el archivo en `index.html` y comprobar que
los datos aparecen.

**Escenarios de aceptación**:

1. **Dada** una copia exportada desde `saas/`, **cuando** se importa en `index.html`, **entonces** la
   app original la acepta como copia válida, sin error de versión ni de formato.
2. **Tras** importarla, **entonces** se ven los hábitos activos en su orden con sus días cumplidos,
   las tareas (pendientes y hechas con su fecha, hora y nota), las notas del diario, la
   configuración del repaso y, si el repaso más reciente es el de hoy, su estado.
3. **Dado** que la copia contiene hábitos archivados, **cuando** se importa en `index.html`,
   **entonces** esos hábitos no aparecen como activos en la app original (que no tiene archivo).

---

### Casos límite

- **Copia de la app original importada en `saas/`**: sigue funcionando como hoy (constitución, «App
  antigua congelada»); al no tener identificadores de `saas/`, sus hábitos y tareas se reconocen por
  sus datos visibles (nombre en los hábitos, FR-012; título y momento de creación en las tareas,
  FR-013), de modo que importar dos veces la misma copia antigua
  tampoco duplica nada.
- **Hábitos con el mismo nombre**: si la cuenta o la copia tienen varios hábitos con el mismo
  nombre, cada hábito de la copia se empareja como mucho con uno de la cuenta, y nunca dos de la
  copia con el mismo de la cuenta.
- **Archivo que no es una copia, dañado o de una versión más nueva**: se rechaza entero con un
  mensaje en español y no se cambia nada en la cuenta.
- **Importación que falla a mitad**: no se aplica nada (todo o nada).
- **Datos de la copia que no cumplen las reglas actuales** (nombre de más de 40 caracteres, fecha
  imposible…): se ajustan o se omiten igual que hoy, sin abortar el resto.
- **Límites por usuario**: si importar superaría el número máximo de hábitos o tareas permitido, se
  avisa con un mensaje claro y no se importa nada.
- **Exportar con cambios pendientes de guardar** (p. ej. una nota escrita sin conexión que aún no
  ha llegado al servidor): antes de exportar se intenta enviar; si no se puede, esos cambios se
  omiten de la copia, la exportación sigue adelante y se avisa al usuario de que hay notas sin
  guardar en ese dispositivo que no están en la copia.
- **Repaso de hoy a medias**: se exporta tal cual (respuestas dadas y sin completar) y se restaura
  igual.
- **Respuestas del repaso que apuntan a un hábito que ya no existe**: se conservan en la copia; al
  importar se mantienen si el hábito se reconoce y se descartan si no.
- **Fecha del nombre del archivo**: se usa la fecha de hoy en la zona horaria del usuario (día
  natural, no la regla de las 04:00).
- **Cuenta con muchos datos** (p. ej. 3 años de historial y cientos de notas): la exportación y la
  importación terminan sin errores.

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Exportar**

- **FR-001**: Ajustes DEBE ofrecer el botón «Exportar copia de seguridad», con una zona táctil de al
  menos 44×44 px, que genera la copia con un toque.
- **FR-002**: El archivo DEBE llamarse `mis-habitos-AAAA-MM-DD.json`, con la fecha de hoy en la zona
  horaria del usuario.
- **FR-003**: La copia DEBE usar el formato de la app original: `app` = `"mis-habitos"`, `version`
  (número), `exportado` (fecha y hora de la exportación) y `datos` con `habits`, `habitos_tareas`,
  `habitos_notas`, `habitos_repaso` y `habitos_config`.
- **FR-004**: La copia DEBE contener todos los hábitos del usuario, activos y archivados, con
  nombre, descripción, orden, si está archivado, y su historial de días cumplidos con la misma
  forma que la app original (un día → cumplido).
- **FR-005**: La copia DEBE contener todas las tareas, pendientes y hechas, con título, nota, fecha,
  hora, si está hecha, cuándo se hizo y cuándo se creó, con los nombres de campo de la app original.
- **FR-006**: La copia DEBE contener todas las notas del diario con su día, su texto y cuándo se
  editaron por última vez.
- **FR-007**: La copia DEBE contener el estado de todos los repasos guardados (día, respuestas y si
  se completó) y, en `habitos_repaso`, el más reciente con la forma de la app original.
- **FR-008**: La copia DEBE contener la configuración del repaso en `habitos_config` (activo y hora).
- **FR-009**: Todo lo que la app original no conoce (hábitos archivados, repasos anteriores, datos
  necesarios para reconocer elementos al reimportar) DEBE añadirse de forma que la app original lo
  ignore sin error y sin mostrarlo como activo; la copia NO DEBE incluir datos de otros usuarios,
  suscripciones push ni secretos.
- **FR-010**: Tras una exportación correcta, el sistema DEBE registrar la fecha de la última copia
  en la cuenta del usuario (no solo en el dispositivo) y mostrar un aviso de éxito; si la
  exportación falla o el usuario la cancela, NO DEBE cambiar esa fecha.

**Importar sin perder ni duplicar**

- **FR-011**: «Traer datos» DEBE aceptar tanto las copias de la app original (como hoy) como las
  exportadas desde `saas/`, y restaurar de estas todo lo listado en FR-004 a FR-008, incluidos el
  estado de archivado, el orden, los repasos y la configuración del repaso.
- **FR-012**: Al importar, cada hábito de la copia que ya exista en la cuenta DEBE reconocerse y no
  crearse de nuevo; solo se le añaden los días cumplidos que falten, sin cambiar su nombre,
  descripción, orden ni estado de archivado. Se reconoce por el identificador interno que lleva la
  copia exportada desde `saas/` si pertenece a un hábito de la cuenta; si la copia no lo trae (copias
  de la app original) o no corresponde a ninguno, por nombre sin distinguir mayúsculas ni espacios
  sobrantes al principio o al final. Cada hábito de la cuenta se empareja como mucho con uno de la
  copia.
- **FR-013**: Al importar, cada tarea de la copia que ya exista en la cuenta DEBE reconocerse y no
  crearse de nuevo: por su identificador interno si la copia lo trae; si no, por coincidir título y
  momento de creación.
- **FR-014**: Un día cumplido que ya está marcado NO DEBE duplicarse ni contarse como añadido.
- **FR-015**: Si la cuenta no tiene nota para un día de la copia, se añade. Si la tiene y su texto
  es igual al de la copia o ya contiene íntegro el texto de la copia, NO DEBE cambiarse. En otro
  caso, la nota DEBE quedar con el texto de la cuenta, un separador visible y el texto de la copia
  (el mismo criterio de unión que los conflictos del diario de la 002), sin superar el límite de
  longitud de una nota; si la unión lo superase, se conserva el texto de la cuenta y la nota cuenta
  igualmente como pendiente de revisar en el resumen.
- **FR-016**: Un repaso de un día que ya existe en la cuenta NO DEBE sobrescribirse; solo se añaden
  repasos de días que no existen.
- **FR-017**: La configuración del repaso de la copia (activo y hora) DEBE aplicarse a la cuenta al
  importar, igual que hace la app original.
- **FR-018**: Los datos que la cuenta ya tiene NO DEBEN borrarse ni modificarse; la importación
  solo añade, salvo la unión de notas (FR-015) y la configuración del repaso (FR-017).
- **FR-019**: La importación DEBE ser todo o nada y DEBE validar la copia (aplicación, versión,
  estructura) antes de cambiar nada; si es de una versión más nueva que la que la app entiende, se
  rechaza con un mensaje en español.
- **FR-020**: Al terminar, el sistema DEBE mostrar cuántos hábitos, días cumplidos, tareas, notas y
  repasos se han añadido y, aparte, cuántas notas se han unido con un texto existente (indicando que
  conviene revisarlas en el Diario); si no había nada nuevo, un mensaje específico.
- **FR-021**: Las reglas de los datos (longitudes, fechas válidas, límites por usuario, propiedad de
  las filas) DEBEN seguir comprobándose en la base de datos durante la importación.
- **FR-022**: El texto de la sección «Traer datos» DEBE explicar que sirve tanto para copias de la
  app original como para las exportadas desde aquí y que no duplica lo que ya existe.

**Compatibilidad con la app original**

- **FR-023**: La copia exportada DEBE pasar la validación de la importación de `index.html` sin
  modificarla (misma `app`, una `version` que esa app acepte, `habits` y `habitos_tareas` como
  listas con los campos que exige).
- **FR-024**: En `index.html` solo DEBEN aparecer como hábitos los activos; los archivados viajan en
  la copia sin que la app original los muestre.

**Última copia**

- **FR-025**: Ajustes DEBE mostrar la fecha de la última copia exportada en español (p. ej. «3 de
  noviembre de 2026»), o «Aún no has hecho ninguna copia» si no hay ninguna.
- **FR-026**: Si han pasado más de 30 días desde la última copia, o nunca se ha hecho y el usuario
  tiene datos, Ajustes DEBE mostrar un aviso suave (informativo, no de error, sin bloquear nada ni
  enviar notificaciones) recomendando exportar una copia.
- **FR-027**: Todos los textos DEBEN estar en español, funcionar en 360–430 px de ancho sin
  desplazamiento horizontal y verse bien en modo claro y oscuro.

### Entidades clave

- **Copia de seguridad**: archivo JSON con `app`, `version`, `exportado` y `datos`. Representa una
  foto completa de los datos de un usuario en un momento dado.
- **Hábito exportado**: nombre, descripción, orden, si está archivado, historial (día → cumplido) e
  identificador para reconocerlo al reimportar.
- **Tarea exportada**: título, nota, fecha, hora, hecha, hecha en, creada en e identificador.
- **Nota exportada**: día, texto y fecha de última edición.
- **Repaso exportado**: día, respuestas por hábito y si se completó.
- **Configuración del repaso**: activo (sí/no) y hora.
- **Última copia**: fecha y hora de la última exportación correcta, asociada a la cuenta.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: Ida y vuelta completa: exportar una cuenta e importar la copia en una cuenta vacía
  deja el 100 % de los hábitos (con orden y archivado), días cumplidos, tareas, notas, repasos y
  configuración del repaso iguales a los originales.
- **SC-002**: Importar la misma copia dos veces seguidas en la misma cuenta añade 0 hábitos, 0
  tareas, 0 días cumplidos, 0 notas y 0 repasos y une 0 notas la segunda vez; ninguna nota queda
  con texto repetido.
- **SC-003**: Importar una copia antigua en una cuenta con datos posteriores no borra ni modifica
  ningún dato posterior y no pierde ningún texto escrito.
- **SC-004**: El usuario obtiene el archivo en menos de 5 segundos desde que pulsa el botón con una
  cuenta de 3 años de uso diario (10 hábitos, 500 tareas, 1000 notas).
- **SC-005**: El 100 % de las copias exportadas desde `saas/` se aceptan en `index.html` sin error.
- **SC-006**: El aviso de copia aparece siempre que han pasado más de 30 días y nunca con 30 días o
  menos.

## Supuestos

- La «versión» de la copia seguirá siendo una que la app original acepte (hoy, 2 como máximo); lo
  nuevo de `saas/` se añade como campos extra que la app original ignora, sin cambiar el significado
  de los existentes.
- Los hábitos archivados y los repasos anteriores al más reciente viajan en campos adicionales de
  `datos` que la app original no lee; por tanto, al importar en `index.html` se pierden (no tiene
  dónde guardarlos), lo que es aceptable «en la medida de lo posible».
- `index.html` no se modifica para esta funcionalidad (está congelada).
- La fecha de la última copia se guarda en la cuenta, de modo que se ve igual en todos los
  dispositivos; solo la cambia una exportación correcta (no la importación). La pone la base de
  datos con su propio reloj, no el del servidor de la aplicación ni el del dispositivo.
- Los tiempos de la copia (creación y realización de tareas, edición de notas, archivado de
  hábitos, finalización de repasos y momento de la exportación) se conservan al milisegundo: la
  ida y vuelta compara esos tiempos truncados a milisegundos, no con la precisión de microsegundos
  de la base de datos.
- No se incluyen en la copia el nombre visible, la zona horaria ni las suscripciones push: no están
  en la lista pedida y la zona horaria y los avisos son propios de cada dispositivo o cuenta.
- La exportación también podrá ofrecerse por la API versionada si el plan lo considera necesario
  para cumplir el principio I; la interfaz pedida es solo la de Ajustes.
- Fuera de alcance: copias automáticas, programadas o en la nube, cifrado del archivo y elegir qué
  datos exportar.
