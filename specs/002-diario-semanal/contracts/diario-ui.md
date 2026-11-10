# Contrato: rutas y vistas del Diario (`/notes`)

| URL | Vista | Contenido |
|---|---|---|
| `/notes` | Semana actual | ‹ «SEMANA dd/mm/aaaa» › (› desactivada), botón «Ver notas anteriores», días visibles de lunes a hoy, hoy arriba con campo grande «Escribe aquí…», indicador de guardado. |
| `/notes?d=AAAA-MM-DD` | Desde el calendario | Día de la semana actual → semana actual con ese día arriba. Día de una semana pasada → esa semana en lectura. Día futuro o inválido → semana actual. |
| `/notes?w=AAAA-MM-DD` | Semana pasada (flechas) | `w` se normaliza a su lunes. ‹ «SEMANA dd/mm/aaaa» ›, «← Notas anteriores», «Editar»/«Hecho», días con texto en lectura o «Esta semana no tiene notas.». Si `w` es la semana actual o futura → semana actual. |
| `/notes?vista=anteriores` | Lista | «← Esta semana», elementos «SEMANA dd/mm/aaaa» + «N día(s) con notas» + extracto; vacío: «Aún no hay semanas anteriores con notas.». Cada elemento enlaza a `/notes?w=<lunes>`. |

Reglas comunes:

- Flecha ‹ → `/notes?w=<lunes − 7>`; flecha › → `/notes?w=<lunes + 7>` o `/notes` si es la actual.
- Todos los botones, enlaces y flechas: zona táctil ≥ 44×44 px, `aria-label` en las flechas
  («Semana anterior», «Semana siguiente»).
- Subtítulos: ninguno para el lunes, `dd/mm/aaaa` para los demás días.
- Indicador (`aria-live="polite"`): «Guardando…», «Guardado», «Sin guardar».
- Aviso de conflicto (`role="status"`), según el resultado:
  - `merged`: «Esta nota se cambió en otro dispositivo; se han juntado los dos textos. Revísala.»
  - `kept`: «La nota cambió en otro dispositivo; se ha conservado esa versión.»
  - `too_long`: «La nota cambió en otro dispositivo y juntar los dos textos supera 10.000
    caracteres. Recorta el texto para poder guardarlo.»
- La barra inferior enlaza a `/notes` (sin parámetros), por lo que entrar en la pestaña siempre
  abre la semana actual (FR-032).
