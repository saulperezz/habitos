# Guía de validación: Exportar copia de seguridad

## Requisitos

- Rama `003-exportar-copia` con la migración `20261110120000_backup_export.sql`.
- Dependencias instaladas en `saas/`.
- Una cuenta de pruebas en la vista previa de Vercel.

## 1. Pruebas automáticas (`saas/`)

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

`tests/db.test.ts` debe incluir y superar estas pruebas:

| Prueba | Resultado esperado |
|---|---|
| Exportar (ALICE con hábitos activos y archivados, historial, tareas pendientes y hechas, notas, repasos y configuración) → importar en un usuario nuevo | Las mismas filas comparadas por contenido: hábitos (nombre, descripción, orden, archivado), días, tareas (con `created_at`/`done_at` al milisegundo), notas, repasos (respuestas traducidas a los nuevos ids) y `review_enabled`/`review_time` |
| Exportar → importar dos veces en el mismo usuario | Segunda (y primera, si es el usuario original) importación con todos los contadores a 0; ninguna nota cambia ni repite texto |
| Exportar en el usuario A → importar en el usuario B dos veces | Ningún error (en particular, ninguno de clave primaria). La primera crea las filas con ids nuevos, distintos de los de A, y deja intactos los datos de A. La segunda devuelve todos los contadores a 0: los hábitos se reconocen por nombre y las tareas por título + momento de creación |
| Copia de la app original (sin `uuid`) importada dos veces | La segunda devuelve 0 hábitos, 0 días, 0 tareas, 0 notas y 0 repasos |
| Nota distinta en la cuenta | Se une con `— — —`, `notes_merged = 1`, `last_device` nulo; reimportar no la cambia |
| Unión que supera 10 000 caracteres | No cambia; `notes_too_long = 1` |
| Hábito renombrado en la cuenta tras exportar | Se reconoce por `uuid`, no se crea otro y conserva el nombre nuevo |
| «Leer» en la copia original frente a «leer » en la cuenta | Se reconoce por nombre |
| Exceder el límite de hábitos | `limit_exceeded` y nada importado |
| `export_backup` como anónimo / RLS | Anónimo rechazado; la copia de BOB no contiene nada de ALICE |
| `id` de la copia | Enteros únicos; hábitos archivados fuera de `habits` |

## 2. Ida y vuelta manual (vista previa de Vercel, 390 px de ancho)

1. Ajustes muestra «Aún no has hecho ninguna copia» con un aviso suave (la cuenta tiene datos).
2. Pulsar «Exportar copia de seguridad». Se descarga `mis-habitos-<hoy>.json` (en iPhone se abre la
   hoja de compartir y se elige «Guardar en Archivos»). Se ve el aviso de éxito y «Última copia:»
   con la fecha de hoy, sin aviso.
3. En iPhone, repetir y cancelar la hoja: no aparece error y la fecha no cambia.
4. Abrir Ajustes en otro dispositivo: se ve la misma fecha de la última copia.
5. Importar ese archivo en «Traer datos» de la misma cuenta: «No había nada nuevo que añadir.».
6. Crear otra cuenta e importar el archivo: los hábitos (incluidos los archivados), las tareas, el
   Diario, el Calendario y el repaso coinciden con la cuenta original.
7. En la cuenta original, cambiar el texto de una nota y reimportar: el resumen dice «1 notas tenían
   otro texto…» y en el Diario se ven ambos textos separados por `— — —`.
8. Modo oscuro: los textos y el aviso son legibles; no hay desplazamiento horizontal.

## 3. App original

1. Abrir `index.html` (en local o en su URL actual) → Ajustes › Copia de seguridad › Importar → elegir
   el archivo exportado desde `saas/` → Reemplazar.
2. Se ven los hábitos activos en su orden y con su historial (sin los archivados), las tareas, las
   notas, la hora del repaso y, si el repaso exportado es de hoy, su estado.
3. Marcar un hábito, una tarea y un día del calendario: no hay errores en la consola (los `id`
   numéricos funcionan en los `onclick`).

## 4. Aviso de los 30 días

En la base de datos de pruebas:

```sql
update profiles set last_exported_at = now() - interval '31 days';
```

Ajustes muestra el aviso. Con `interval '30 days'` no lo muestra.
