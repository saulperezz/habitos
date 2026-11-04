# Guía rápida de validación

Pasos para comprobar de extremo a extremo que la funcionalidad cumple la especificación.
Detalles de datos en [data-model.md](./data-model.md); contratos en [contracts/](./contracts/).

## Requisitos previos

- Repositorio publicado en GitHub Pages: `https://saulperezz.github.io/habitos/`.
- Cuenta gratuita de Cloudflare y el worker de `notificaciones/` desplegado según
  `notificaciones/LEEME.md` (claves VAPID creadas, KV `SUSCRIPCIONES` enlazado, cron activo).
- iPhone con iOS 16.4+ (o Android con Chrome) y la app añadida a la pantalla de inicio.
- Para pruebas en escritorio: servidor estático local, p. ej. `python -m http.server 8000` en la raíz
  del repo, y DevTools en ancho de móvil (390 px).

## 1. Datos de la versión anterior (FR-018, SC-005)

1. Con la versión actual (`master`), crea 3 hábitos y márcalos algunos días.
2. Despliega la nueva versión y abre la app.
3. **Esperado**: mismos hábitos, rachas e historial en el calendario; `localStorage` contiene
   `habitos_esquema = 2`, `habitos_config` y `habitos_tareas = []`; `habits` no ha cambiado.

## 2. Primer arranque con almacenamiento vacío

1. Borra los datos del sitio y abre la app.
2. **Esperado**: mensaje de lista vacía, sin errores en consola; las pestañas y el calendario abren.
   Repetir en navegación privada (almacenamiento no disponible): la app funciona en memoria.

## 3. Repaso manual y continuación (historia 1, FR-002, FR-005–FR-007)

1. Con 3 hábitos, pulsa «Hacer repaso».
2. Responde «Sí» al primero, «Saltar» al segundo y sal con «✕ Salir».
3. **Esperado**: el primero aparece completado en la lista, barra y calendario; el botón dice
   «Continuar repaso» y al pulsarlo pregunta solo por los que faltan.
4. Termina el repaso. **Esperado**: resumen «X de 3 cumplidos»; al reabrir la app no se ofrece de
   nuevo.

## 4. Oferta al abrir tras la hora (FR-004, SC-002)

1. En Ajustes, fija la hora 2 minutos antes de la actual; borra `habitos_repaso`.
2. Recarga. **Esperado**: hoja «Es hora del repaso de hoy». Con hora posterior a la actual: no
   aparece.
3. Simula las 01:30 (cambia la hora del sistema). **Esperado**: el repaso se registra en el día
   anterior.

## 5. Contrato del worker

```bash
BASE=https://habitos-avisos.<subdominio>.workers.dev
curl -s $BASE/clave-publica
curl -s -X PUT $BASE/suscripcion -H 'Content-Type: application/json' \
  -H 'Origin: https://saulperezz.github.io' \
  -d '{"endpoint":"https://ejemplo.com/x","hora":"22:00","zonaHoraria":"Europe/Madrid"}'
```

**Esperado**: la primera devuelve `clavePublica`; la segunda `400` (dominio no permitido). Un cuerpo
con un campo extra (p. ej. `"habitos": []`) también devuelve `400`.

## 6. Notificación real con la app cerrada (FR-003, SC-002a, riesgo R1)

1. En el iPhone, abre la app instalada › Ajustes › «Activar avisos» y acepta el permiso.
2. Fija la hora 3 minutos después de la actual y cierra la app por completo.
3. **Esperado**: llega «¿Qué tal hoy? Haz el repaso de tus hábitos» en ≤5 min tras la hora; al
   tocarla se abre directamente el repaso.
4. Comprueba en KV que la suscripción solo tiene `endpoint`, `hora`, `zonaHoraria`, `ultimoEnvio` y
   `creadaEn` (FR-003b).
5. Si no llega la notificación pero el worker registra `201`, aplica el plan B de research D3.

## 7. Repaso hecho antes de la hora y fallo del worker (FR-003c, D5)

1. Completa el repaso antes de la hora configurada. **Esperado**: ese día no llega aviso
   (`ultimoEnvio` = hoy).
2. Pon el móvil en modo avión (o apunta el cliente a una URL inexistente) y cambia la hora.
   **Esperado**: mensaje «No se pudo programar el aviso…» y la app sigue funcionando; al abrirla
   tras la hora se ofrece el repaso.
3. Desactiva los avisos. **Esperado**: la suscripción desaparece del KV.

## 8. Detalle por día en el calendario (historia 2, FR-008, SC-003)

1. Toca la fecha de la cabecera y luego un día pasado con 2 de 3 hábitos cumplidos.
2. **Esperado**: 2 con ✓ y 1 con ○ (2 toques). Un día sin cumplidos muestra «Ningún hábito cumplido
   este día».

## 9. Tareas y eventos (historias 3 y 4, FR-009–FR-015, SC-004)

1. Pestaña «Tareas»: crea «Entregar práctica» para mañana a las 18:30, «Comprar libro» sin fecha y
   una tarea con fecha de ayer.
2. **Esperado**: orden Vencidas → Próximas → Sin fecha; la de ayer resaltada; el evento muestra
   icono de hora. Guardar sin título muestra «Escribe un título para la tarea».
3. Abre el calendario: mañana tiene punto indicador. Toca un día del mes siguiente › «Añadir tarea»
   (fecha rellenada) y guarda en <15 s.
4. Marca una tarea como hecha: pasa a «Completadas» y desaparece el indicador si era la única.
5. Recarga la app: todo se conserva.

## 10. Idioma (historia 5, FR-016, FR-017, SC-006)

- Recorre todas las pantallas y mensajes: todo en español con tildes («Hábitos», «Descripción»).
- Revisa `specs/`, `.specify/memory/constitution.md` y `notificaciones/LEEME.md`: en español.
