# Guía de validación: Diario semanal

## Requisitos previos

- Rama `002-diario-semanal` con la migración `20261110000000_notes_save_conflicts.sql`
  aplicada en el proyecto de Supabase de la vista previa.
- Una cuenta de prueba con notas en la semana actual (lunes y algún día anterior a hoy) y en al
  menos tres semanas anteriores (se pueden crear con la importación o con `PUT /api/v1/notes/{day}`).

## Comprobaciones automáticas (en `saas/`)

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Resultado esperado: todo pasa, incluidas las pruebas nuevas de `save_note` en `tests/db.test.ts`
y `tests/notes-weeks.test.ts`.

## Escenarios manuales (URL de vista previa de Vercel, ancho 360–430 px, claro y oscuro)

Ver contratos en [contracts/diario-ui.md](contracts/diario-ui.md) y
[contracts/notes-api.md](contracts/notes-api.md).

1. **Semana actual** (historias 1 y 2): abrir «Diario». Título «SEMANA dd/mm/aaaa» del lunes; › desactivada;
   días anteriores vacíos ocultos; ningún día futuro; lunes sin subtítulo; hoy arriba del todo con
   «Escribe aquí…» y el campo hasta el final de la pantalla; sin scroll horizontal.
2. **Guardado automático**: escribir y esperar ~1 s → «Guardando…» y luego «Guardado». Recargar:
   el texto sigue.
3. **Cierre inmediato** (SC-001, repetir en iPhone como app de pantalla de inicio): escribir y
   cerrar la app al instante desde el selector de apps. Reabrir → el texto está completo.
4. **Sin conexión**: modo avión, escribir → «Sin guardar». Cerrar la app, quitar el modo avión,
   reabrir → el texto aparece y pasa a «Guardado» sin volver a escribir.
5. **Altura automática**: pegar un texto largo → el campo crece, sin barra de desplazamiento interna.
6. **Borrar**: vaciar un día anterior de esta semana, cambiar de pestaña y volver → ese día ya no aparece.
7. **Notas anteriores** (historia 3): «Ver notas anteriores» → lista de más reciente a más antigua con
   número de días y extracto de ~80 caracteres. Entrar en una → lectura; «Editar» → campos y
   «Hecho»; cambiar un texto, «Hecho», «← Notas anteriores», «← Esta semana». El cambio se mantiene.
8. **Lista vacía**: con una cuenta sin notas anteriores → «Aún no hay semanas anteriores con notas.».
9. **Flechas** (historia 4): ‹ dos veces y › una; llegar a una semana sin notas → mensaje; volver a la
   actual con › → vista editable con hoy arriba.
10. **Volver a la pestaña** (FR-032): dejar abierta una semana pasada, ir a «Hoy» y volver → semana actual.
11. **Calendario** (historia 5): abrir el diario de un día de esta semana (queda visible) y de un
    día de hace un mes (esa semana en lectura).
12. **Conflicto** (FR-030): en el móvil sin conexión, escribir «A» en hoy; en otro navegador,
    escribir «B» en hoy y esperar «Guardado». Reconectar el móvil → el texto queda «B — — — A» y
    aparece el aviso de revisión. Repetir vaciando el texto en el móvil sin conexión en lugar de
    escribir «A» → se conserva «B» y aparece «La nota cambió en otro dispositivo; se ha conservado
    esa versión.».
13. **Medianoche** (FR-008): con la zona horaria del perfil ajustada para que falten 2 minutos para
    las 00:00, dejar el diario abierto sin tocar → al pasar la medianoche aparece el nuevo día arriba.
14. **Rendimiento** (SC-003, SC-004): en el móvil, con DevTools remotas (Safari → Desarrollo o
    `chrome://inspect`) grabar un perfil de rendimiento mientras se escriben 30 caracteres
    seguidos en hoy. Ningún evento `input` debe tardar ≥ 100 ms en pintar y el campo nunca se
    bloquea durante «Guardando…». Con red normal, medir 5 veces el tiempo entre la última
    pulsación y «Guardado»: todos < 2 s.
15. **Sesión cerrada con pendiente** (FR-033), en un navegador de escritorio con DevTools: activar
    «Offline», escribir en hoy (indicador «Sin guardar»), borrar las cookies del sitio en
    Application → Storage (cierra la sesión sin tocar `localStorage`), desactivar «Offline» y entrar
    con otra cuenta → no ve ese texto y no se guarda en ella. Cerrar sesión y entrar con la primera
    cuenta → el texto aparece y pasa a «Guardado».
16. **Copia antigua**: importar una copia de la app de la raíz con notas → aparecen en el diario y
    en la lista de semanas anteriores.
