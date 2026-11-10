# Especificación de la funcionalidad: Diario semanal como en la app original

**Rama de la funcionalidad**: `002-diario-semanal`

**Creada**: 2026-11-10

**Estado**: Borrador

**Entrada**: descripción del usuario: «Rehacer la pestaña “Diario” de saas/ para que funcione como el
apartado de notas de la app original (index.html, commit 31882d5), manteniendo solo una novedad de
la versión actual: las flechas ‹ › para pasar de una semana a otra.»

## Clarifications

### Session 2026-11-10

- Q: Si se escribe sin conexión en un dispositivo y entretanto la nota de ese día cambia desde otro,
  ¿qué pasa al guardar el texto pendiente? → A: No se sobrescribe; se conservan ambos textos unidos
  con un separador y se avisa al usuario para que lo revise.
- Q: Si se escribe de madrugada (p. ej. a la 01:30), ¿en qué día se guarda el texto? → A: En el día
  natural (cambia a medianoche); la regla de las 04:00 es solo del repaso de hábitos.
- Q: Al volver a la pestaña «Diario» (o reabrir la app) tras dejarla en una semana pasada o en la
  lista, ¿qué se muestra? → A: Siempre la semana actual con hoy arriba del todo.

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 - Escribir el diario de hoy sin perder nada (Prioridad: P1)

El usuario abre la pestaña «Diario» y encuentra el día de hoy arriba del todo, con un campo grande
que ocupa al menos el resto de la pantalla y el texto de ayuda «Escribe aquí…». Escribe con
libertad; el texto se guarda solo mientras escribe y también cuando cambia de pestaña, pasa la app
a segundo plano o la cierra. Si no hay conexión, lo escrito se conserva en el dispositivo y se
guarda en cuanto se pueda.

**Por qué esta prioridad**: escribir el día y no perderlo es el propósito de la pestaña; perder lo
escrito es el peor fallo posible (principio IV de la constitución).

**Prueba independiente**: abrir el diario, escribir un texto, cerrar la app a los pocos segundos
y volver a abrirla (también sin conexión y en iPhone como app de pantalla de inicio): el texto
completo sigue ahí.

**Escenarios de aceptación**:

1. **Dado** que el usuario abre la pestaña «Diario», **cuando** se muestra, **entonces** el día de
   hoy aparece arriba del todo, su campo ocupa al menos el resto de la pantalla y, si está vacío,
   muestra «Escribe aquí…».
2. **Dado** que el usuario escribe en el campo de hoy, **cuando** deja de teclear unos 400 ms,
   **entonces** el texto se guarda y el indicador pasa de «Guardando…» a «Guardado».
3. **Dado** que el usuario acaba de escribir (sin esperar los 400 ms), **cuando** cambia de
   pestaña, pasa la app a segundo plano o la cierra, **entonces** el texto queda guardado y aparece
   al volver.
4. **Dado** que no hay conexión o el servidor falla, **cuando** el usuario escribe, **entonces** el
   texto se conserva en el dispositivo, el indicador muestra «Sin guardar» y el guardado se
   reintenta solo hasta conseguirlo, sin que el usuario tenga que volver a escribir.
5. **Dado** un texto largo, **cuando** el usuario escribe, **entonces** el campo crece con el
   texto, sin barra de desplazamiento interna.
6. **Dado** que el usuario borra todo el texto de un día, **cuando** se guarda, **entonces** la
   nota de ese día deja de existir.

---

### Historia de usuario 2 - Ver la semana actual como en la app original (Prioridad: P1)

El usuario ve la semana en curso con el título «SEMANA dd/mm/aaaa» (fecha del lunes) y los días
desde el lunes hasta hoy. Los días anteriores a hoy sin texto no se muestran. Desplazándose hacia
arriba desde hoy ve lo que escribió los días anteriores de la semana, y puede seguir editándolo.

**Por qué esta prioridad**: es la vista principal del diario y la que reproduce el comportamiento
original que el usuario quiere recuperar.

**Prueba independiente**: con notas el lunes y el miércoles y hoy jueves, abrir el diario: se ven el
título, el lunes sin subtítulo, el miércoles con subtítulo «dd/mm/aaaa» y hoy con subtítulo; el
martes no aparece, ni tampoco viernes, sábado o domingo.

**Escenarios de aceptación**:

1. **Dada** una semana en curso, **cuando** se abre el diario, **entonces** el título es «SEMANA»
   seguido de la fecha del lunes en formato dd/mm/aaaa.
2. **Dado** que hoy no es lunes, **cuando** se muestra la semana actual, **entonces** solo aparecen
   los días de lunes a hoy que tienen texto, más hoy siempre; nunca aparecen días posteriores a hoy.
3. **Dado** que el lunes aparece, **cuando** se muestra, **entonces** va directamente bajo el título
   sin subtítulo; cada uno de los demás días visibles lleva un subtítulo con su fecha dd/mm/aaaa.
4. **Dado** que hoy es lunes, **cuando** se abre el diario, **entonces** solo aparece el lunes (hoy),
   bajo el título y sin subtítulo.
5. **Dado** un día anterior de esta semana con texto, **cuando** el usuario lo edita, **entonces** se
   guarda igual que el de hoy (historia 1).
6. **Dada** la app abierta en el diario de la semana actual sin que el usuario esté escribiendo,
   **cuando** pasa la medianoche, **entonces** la vista se actualiza sola al nuevo día (y a la
   nueva semana si era domingo), sin perder nada pendiente de guardar.

---

### Historia de usuario 3 - Consultar y editar semanas anteriores (Prioridad: P2)

El usuario pulsa «Ver notas anteriores» y ve la lista de las semanas pasadas que tienen algo
escrito, de la más reciente a la más antigua. Al elegir una, la ve en modo lectura y puede pulsar
«Editar» para corregirla.

**Por qué esta prioridad**: releer lo escrito tiene valor, pero depende de que primero se pueda
escribir y guardar sin pérdidas.

**Prueba independiente**: con notas en tres semanas anteriores, abrir la lista, entrar en una
semana, editar un día, pulsar «Hecho», volver a la lista y a «Esta semana»; el cambio está guardado.

**Escenarios de aceptación**:

1. **Dado** que hay semanas anteriores con notas, **cuando** el usuario pulsa «Ver notas
   anteriores», **entonces** ve una lista ordenada de la más reciente a la más antigua donde cada
   elemento muestra «SEMANA dd/mm/aaaa», cuántos días tienen texto y los primeros ~80 caracteres
   del texto de esa semana.
2. **Dado** que no hay semanas anteriores con notas, **cuando** abre la lista, **entonces** ve «Aún
   no hay semanas anteriores con notas.».
3. **Dada** la lista, **cuando** el usuario pulsa «← Esta semana», **entonces** vuelve a la semana
   actual con hoy arriba del todo.
4. **Dado** que el usuario elige una semana de la lista, **cuando** se abre, **entonces** ve el
   título «SEMANA dd/mm/aaaa», solo los días con texto, en modo lectura, con los botones «Editar» y
   «← Notas anteriores».
5. **Dada** una semana pasada en modo lectura, **cuando** pulsa «Editar», **entonces** los textos se
   convierten en campos editables con el mismo guardado automático y el botón pasa a llamarse
   «Hecho»; al pulsar «Hecho» vuelve al modo lectura con los cambios guardados.
6. **Dada** una semana pasada en edición, **cuando** el usuario vacía por completo un día y pulsa
   «Hecho», **entonces** ese día desaparece de la semana; si la semana se queda sin días con texto,
   deja de aparecer en la lista.
7. **Dada** una semana pasada o la lista abierta, **cuando** el usuario cambia a otra pestaña y
   vuelve al «Diario» (o cierra y reabre la app), **entonces** ve la semana actual con hoy arriba.

---

### Historia de usuario 4 - Pasar de semana con las flechas ‹ › (Prioridad: P3)

A los lados del título hay flechas ‹ › para ir a la semana anterior o a la siguiente.

**Por qué esta prioridad**: es la única novedad que se conserva de la versión actual; es un atajo,
no imprescindible teniendo la lista de notas anteriores.

**Prueba independiente**: desde la semana actual pulsar ‹ dos veces y › una vez, comprobando cada
semana mostrada; volver a la actual y comprobar que › está desactivada.

**Escenarios de aceptación**:

1. **Dada** la semana actual, **cuando** se muestra, **entonces** la flecha › está desactivada.
2. **Dada** cualquier semana, **cuando** el usuario pulsa ‹, **entonces** ve la semana anterior en
   modo lectura, con su botón «Editar», como en la historia 3.
3. **Dada** una semana pasada, **cuando** el usuario pulsa ›, **entonces** ve la semana siguiente;
   si la siguiente es la actual, la ve como en la historia 2 (editable, con hoy arriba).
4. **Dada** una semana pasada sin ninguna nota, **cuando** se llega a ella con las flechas,
   **entonces** se muestra un mensaje indicando que esa semana no tiene notas.

---

### Historia de usuario 5 - Abrir el diario de un día desde el calendario (Prioridad: P3)

Desde el calendario el usuario puede ir al diario de un día concreto.

**Por qué esta prioridad**: enlace existente que debe seguir funcionando con la nueva vista.

**Prueba independiente**: desde el calendario abrir un día de esta semana y un día de hace un mes.

**Escenarios de aceptación**:

1. **Dado** un día de la semana actual, **cuando** el usuario lo abre desde el calendario,
   **entonces** ve la semana actual con ese día visible en pantalla.
2. **Dado** un día de una semana pasada, **cuando** lo abre desde el calendario, **entonces** ve esa
   semana en modo lectura, como en la historia 3.

---

### Casos límite

- **Escribir en dos dispositivos**: si al guardar resulta que la nota de ese día cambió en el
  servidor después de que el dispositivo la cargara (p. ej. se editó desde otro dispositivo
  mientras este estaba sin conexión), no se sobrescribe: se guardan ambos textos unidos (primero el
  del servidor, luego un separador y después el del dispositivo) y se muestra un aviso para que el
  usuario lo revise (FR-030).
- **Conflicto con texto vacío o idéntico**: si el usuario vació la nota sin conexión (o escribió
  exactamente lo mismo) y entretanto cambió en otro dispositivo, se conserva la versión del otro
  dispositivo y se avisa «La nota cambió en otro dispositivo; se ha conservado esa versión».
- **Cerrar sesión con texto pendiente**: lo pendiente se conserva en el dispositivo ligado a la
  cuenta y se envía al volver a entrar con ella; si entra otra cuenta, no lo ve ni se envía.
- **Conflicto cuya unión supera 10 000 caracteres**: no se guarda la unión; la nota del servidor se
  mantiene, el texto del dispositivo se sigue conservando como pendiente, el indicador muestra «Sin
  guardar» y el aviso pide al usuario recortar el texto.
- **Texto de más de 10 000 caracteres**: el campo no permite superar el límite; el usuario no puede
  escribir más allá ni perder lo ya escrito por ello.
- **Medianoche mientras se escribe**: la vista no se reorganiza mientras el usuario está
  escribiendo; se actualiza cuando deja de hacerlo, y el texto se guarda en el día en que se empezó
  a escribir.
- **Semana que cambia de mes o de año**: el título usa siempre la fecha del lunes (p. ej. «SEMANA
  29/12/2025» para la semana que termina el 04/01/2026).
- **Cierre brusco de la app sin conexión**: lo escrito se conserva en el dispositivo y se guarda al
  volver a abrir la app con conexión.
- **Texto pendiente en el dispositivo y servidor sin cambios**: al volver a abrir la app, si la
  nota del servidor no ha cambiado desde que el dispositivo la cargó, lo pendiente se guarda sin
  más.
- **Salir de una semana pasada en edición** (con «← Notas anteriores», las flechas o cambiando de
  pestaña) sin pulsar «Hecho»: lo escrito se guarda igualmente.
- **Enlace del calendario a un día futuro**: se abre la semana actual con hoy arriba (no se muestran
  días futuros).
- **Texto solo con espacios o saltos de línea**: cuenta como vacío y borra la nota del día.

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Semana actual**

- **FR-001**: La vista de la semana actual DEBE mostrar el título «SEMANA dd/mm/aaaa» con la fecha
  del lunes de la semana (semanas de lunes a domingo).
- **FR-002**: DEBE mostrar solo días entre el lunes y hoy, ambos incluidos; nunca días futuros.
- **FR-003**: Los días anteriores a hoy sin texto NO DEBEN mostrarse al cargar la vista; hoy DEBE
  mostrarse siempre. Un día que se vacía mientras se edita sigue visible hasta salir de la vista.
- **FR-004**: El lunes DEBE ir directamente bajo el título, sin subtítulo; cada otro día visible
  DEBE llevar un subtítulo con su fecha en formato dd/mm/aaaa.
- **FR-005**: Al abrir la pestaña, el día de hoy DEBE quedar arriba del todo de la pantalla; los días
  anteriores visibles quedan por encima y se ven desplazándose hacia arriba.
- **FR-006**: El campo de hoy DEBE ocupar al menos el alto restante de la pantalla y mostrar el texto
  de ayuda «Escribe aquí…» cuando esté vacío.
- **FR-007**: Todos los campos de texto DEBEN crecer con su contenido, sin desplazamiento interno.
- **FR-008**: Si cambia el día con la vista de la semana actual abierta y el usuario no está
  escribiendo, la vista DEBE actualizarse sola al nuevo día.
- **FR-031**: «Hoy» en el diario DEBE ser el día natural en la zona horaria del usuario: cambia a
  las 00:00, no a las 04:00 (p. ej. lo escrito a las 01:30 del martes pertenece al martes).
- **FR-032**: Al entrar en la pestaña «Diario» desde otra pestaña o al abrir la app, DEBE mostrarse
  siempre la semana actual con hoy arriba del todo, sin importar la vista que se dejó abierta
  (salvo al llegar desde el calendario, FR-027).

**Guardado**

- **FR-009**: El texto DEBE guardarse automáticamente unos 400 ms después de la última pulsación.
- **FR-010**: El texto pendiente DEBE guardarse también al cambiar de pestaña o de vista, al pasar la
  app a segundo plano y al cerrarla; el guardado NO DEBE depender solo de que el campo pierda el
  foco.
- **FR-011**: Todo texto aún no confirmado por el servidor DEBE conservarse en el dispositivo y
  sobrevivir al cierre de la app, incluso en iPhone como app de pantalla de inicio.
- **FR-012**: Si no hay conexión o el guardado falla, el sistema DEBE reintentarlo automáticamente
  (al recuperar la conexión, al volver a la app y periódicamente) hasta confirmarlo.
- **FR-013**: El usuario DEBE ver un indicador discreto con el estado del guardado: «Guardando…»,
  «Guardado» o «Sin guardar».
- **FR-014**: Un texto vacío (o solo con espacios y saltos de línea) DEBE borrar la nota de ese día.
- **FR-015**: Cada nota DEBE limitarse a 10 000 caracteres.
- **FR-030**: Un guardado NO DEBE sobrescribir una nota que haya cambiado en el servidor después de
  que el dispositivo la cargara. En ese caso DEBE guardarse la unión de ambos textos (servidor,
  separador, dispositivo), mostrar al usuario un aviso para revisarla y, si la unión superara
  10 000 caracteres, no guardar y conservar el texto del dispositivo como pendiente. Si el texto
  del dispositivo está vacío o es igual al del servidor, DEBE conservarse la versión del servidor
  y avisar: «La nota cambió en otro dispositivo; se ha conservado esa versión».
- **FR-033**: Los textos pendientes de guardar NO DEBEN borrarse al cerrar sesión; DEBEN quedar
  ligados a su cuenta y solo enviarse cuando vuelva a entrar esa misma cuenta, nunca con otra.

**Notas anteriores**

- **FR-016**: La semana actual DEBE ofrecer un botón «Ver notas anteriores» que abra la lista de las
  semanas anteriores a la actual con al menos un día con texto, de la más reciente a la más antigua.
- **FR-017**: Cada elemento de la lista DEBE mostrar «SEMANA dd/mm/aaaa», el número de días con
  texto y los primeros ~80 caracteres del texto de la semana (empezando por su primer día con
  texto).
- **FR-018**: Si no hay semanas anteriores con notas, la lista DEBE mostrar «Aún no hay semanas
  anteriores con notas.».
- **FR-019**: La lista DEBE tener un botón «← Esta semana» que vuelva a la semana actual.
- **FR-020**: Una semana pasada DEBE mostrarse en modo lectura con el título «SEMANA dd/mm/aaaa» y
  solo los días con texto, con el mismo criterio de subtítulos que FR-004.
- **FR-021**: Una semana pasada DEBE ofrecer un botón «Editar» que convierta los textos en campos
  editables con el mismo guardado (FR-009 a FR-015); el botón DEBE pasar a llamarse «Hecho» y, al
  pulsarlo, volver al modo lectura.
- **FR-022**: Una semana pasada (abierta desde la lista, con las flechas o desde el calendario) DEBE
  ofrecer el botón «← Notas anteriores»
  para volver a la lista.

**Flechas ‹ ›**

- **FR-023**: El título de cualquier semana DEBE tener a los lados flechas ‹ › para ir a la semana
  anterior y a la siguiente.
- **FR-024**: En la semana actual, la flecha › DEBE estar desactivada.
- **FR-025**: Las semanas pasadas a las que se llega con las flechas DEBEN mostrarse como en FR-020 y
  FR-021; si no tienen notas, DEBE mostrarse un mensaje que lo indique.
- **FR-026**: Al llegar con › a la semana actual, DEBE mostrarse como en FR-001 a FR-007.

**Calendario**

- **FR-027**: Abrir el diario de un día desde el calendario DEBE mostrar la semana actual con ese
  día visible si el día pertenece a la semana actual, o esa semana pasada en modo lectura si no.
  Un día futuro DEBE abrir la semana actual.

**Generales**

- **FR-028**: Todos los botones y flechas DEBEN tener una zona táctil de al menos 44×44 px y la
  vista DEBE verse sin desplazamiento horizontal entre 360 y 430 px de ancho, en modo claro y
  oscuro.
- **FR-029**: El cambio NO DEBE modificar el formato de los datos guardados ni la importación de
  copias de seguridad.

### Entidades clave

- **Nota de un día**: texto libre que el usuario escribe para un día concreto. Una por usuario y
  día, de hasta 10 000 caracteres; si no tiene texto, no existe.
- **Semana**: de lunes a domingo, identificada por la fecha de su lunes. No se guarda; se deduce de
  las notas.
- **Texto pendiente**: texto escrito en el dispositivo que aún no se ha confirmado como guardado;
  vive solo en el dispositivo hasta que se guarda. Recuerda qué versión de la nota del servidor
  había cuando se empezó a escribir, para detectar conflictos (FR-030).

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: En 20 pruebas de escribir y cerrar la app inmediatamente (con y sin conexión, incluido
  iPhone como app de pantalla de inicio), el 100 % del texto escrito aparece al volver a abrirla.
- **SC-002**: Al abrir la pestaña «Diario», el usuario puede empezar a escribir en el día de hoy con
  un solo toque y sin desplazarse.
- **SC-003**: Escribir se percibe instantáneo: cada pulsación aparece en pantalla sin retraso
  perceptible (menos de 100 ms) y nunca se bloquea el campo mientras se guarda.
- **SC-004**: En condiciones normales, el indicador muestra «Guardado» en menos de 2 s tras dejar de
  escribir.
- **SC-005**: El usuario llega a cualquier semana anterior con notas en 2 toques o menos desde la
  semana actual (lista y elemento), o con las flechas.
- **SC-006**: Comparada lado a lado con la app original, la vista de la semana actual, la lista de
  notas anteriores y una semana pasada coinciden en contenido, textos y orden (salvo las flechas).

## Supuestos

- La regla de las 04:00 es exclusiva del repaso de hábitos; el diario usa el día natural (FR-031).
- Las semanas van de lunes a domingo, como en la app original.
- En las semanas pasadas abiertas con las flechas también se ofrece «← Notas anteriores» para ir a
  la lista, igual que al abrirlas desde ella.
- El «principio del texto» de la lista se toma del primer día con texto de la semana (lunes a
  domingo), recortado a unos 80 caracteres con puntos suspensivos si es más largo.
- El indicador de guardado no requiere acción del usuario; los reintentos son automáticos.
- La tabla de notas, su límite de 10 000 caracteres, el borrado con texto vacío y la importación ya
  existen y no cambian. Para detectar conflictos (FR-030) de forma segura hace falta una migración
  que solo añade elementos compatibles (ver `plan.md`); el formato de las notas no cambia.
- La pestaña conserva su nombre actual («Diario») en la navegación.
- Fuera de alcance: cambiar el formato de los datos, buscador de notas y adjuntos.
