# Contrato: interfaz de usuario

Todos los textos en español con tildes. Zonas táctiles ≥ 44×44 px. Colores con las variables de
`:root` existentes.

## Navegación

- **Barra de pestañas inferior** (fija, respeta `safe-area-inset-bottom`): «Hábitos» | «Tareas».
  El botón «+» crea un hábito o una tarea según la pestaña activa.
- **Cabecera**: título de la pestaña, fecha (abre el calendario, como ahora) y botón de campana
  (abre Ajustes del recordatorio). En la pestaña Hábitos, botón «Hacer repaso» / «Continuar repaso».

## Vista Repaso (pantalla completa)

| Elemento | Contenido |
|----------|-----------|
| Progreso | «2 de 5» y barra |
| Tarjeta | Nombre del hábito y descripción si la tiene; si ya estaba marcado hoy, etiqueta «Ya marcado» |
| Botones | «Sí, cumplido» (primario), «No», «Saltar» |
| Salir | «✕ Salir» conserva las respuestas (FR-007) |
| Final | «X de Y cumplidos», lista de cumplidos y botón «Volver» |

- Oferta al abrir (FR-004): hoja con «Es hora del repaso de hoy» y botones «Empezar» / «Ahora no».
  «Ahora no» no vuelve a preguntar hasta la próxima apertura.
- Sin hábitos: «Aún no tienes hábitos. Crea uno para empezar a repasar.»
- Repaso ya hecho al abrir desde la notificación: «El repaso de hoy ya está hecho» + resumen.

## Ajustes del recordatorio (hoja inferior)

- Interruptor «Repaso diario», selector de hora (`input type="time"`).
- Estado de avisos y acción según `avisos`:
  - `no-solicitado`: botón «Activar avisos».
  - `concedido`: «Avisos activados ✓» y «Desactivar avisos».
  - `denegado`: «Has bloqueado los avisos. Actívalos en Ajustes del móvil › Notificaciones › Hábitos.»
  - `no-soportado`: «Para recibir avisos en iPhone, añade la app a la pantalla de inicio:
    Compartir › Añadir a pantalla de inicio.»
- Error del worker: «No se pudo programar el aviso. Te preguntaremos al abrir la app.»

## Pestaña Tareas

- Secciones: «Vencidas» (resaltadas), «Próximas», «Sin fecha» y «Completadas» (plegable).
- Fila: casilla para marcar como hecha, título, fecha/hora en formato corto («mar 5 nov, 18:30»),
  icono de evento si tiene hora; tocar la fila abre la edición; botón eliminar.
- Formulario (alta/edición): «Título» (obligatorio, 80), «Nota» (opcional, 200), «Fecha»
  (opcional), «Hora» (opcional, activa solo con fecha). Error: «Escribe un título para la tarea».
- Vacío: «No tienes tareas pendientes».

## Calendario

- Cuadrícula actual + punto indicador en días con tareas pendientes (también en días futuros);
  navegación a meses futuros permitida.
- Tocar un día abre el **detalle del día** (hoja inferior):
  - Días ≤ hoy: «Hábitos» con ✓ cumplidos / ○ no cumplidos; si ninguno: «Ningún hábito cumplido
    este día».
  - Todos los días: «Tareas y eventos» del día y botón «Añadir tarea» con la fecha ya rellenada
    (FR-013).
