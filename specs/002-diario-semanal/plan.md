# Plan de implementación: Diario semanal como en la app original

**Rama**: `002-diario-semanal` | **Fecha**: 2026-11-10 | **Especificación**: [spec.md](spec.md)

**Entrada**: especificación de `specs/002-diario-semanal/spec.md`

## Resumen

Rehacer la pestaña «Diario» (`/notes`) de `saas/` para que se comporte como el diario semanal de
la app original. La vista de la semana actual muestra de lunes a hoy (con hoy arriba del todo y su
campo hasta el final de la pantalla). Hay una lista de semanas anteriores y las semanas pasadas se
ven en modo lectura con Editar/Hecho. Se conservan las flechas ‹ ›.

El guardado se rehace para no perder nunca texto:

- copia síncrona en `localStorage` en cada pulsación;
- guardado a los 400 ms con Server Action;
- envío `keepalive` al ocultar o cerrar la app;
- reintentos automáticos e indicador de estado;
- detección de conflictos entre dispositivos en una función SQL atómica (`save_note`), que une
  los dos textos en lugar de sobrescribir.

## Contexto técnico

**Lenguaje/versión**: TypeScript 6 (estricto), React 19, SQL (PostgreSQL de Supabase)

**Dependencias principales**: Next.js 16 App Router, `@supabase/ssr`, `@supabase/supabase-js`,
Zod 4, Tailwind 4. **Sin dependencias nuevas.**

**Almacenamiento**: Supabase Postgres (`public.notes` con RLS) + `localStorage` solo para el texto
pendiente y el identificador de dispositivo.

**Pruebas**: Vitest (`tests/db.test.ts` con PGlite para la migración y `save_note`; pruebas
unitarias de agrupación por semanas y fechas) + prueba manual en la vista previa de Vercel
(`quickstart.md`).

**Plataforma objetivo**: navegadores móviles (Safari iOS como app de pantalla de inicio, Chromium
Android) y escritorio; despliegue en Vercel.

**Tipo de proyecto**: aplicación web (Next.js con servidor y cliente en `saas/`).

**Objetivos de rendimiento**: escritura sin retraso perceptible (< 100 ms por pulsación; el
guardado nunca bloquea el campo); «Guardado» en < 2 s con red normal; lista de semanas
anteriores en < 1 s.

**Restricciones**: cero pérdida de texto, incluido el cierre brusco en iOS y el modo sin
conexión; 360–430 px sin scroll horizontal; zonas seguras; objetivos táctiles de 44×44 px; modo
oscuro; día natural (cambio a medianoche).

**Escala/alcance**: una persona por cuenta, ≤ 1 nota por día (≈ 365 notas/año de ≤ 10 000
caracteres); 1 página, 1 migración, ~6 módulos tocados.

## Comprobación de Constitución

*Puerta: debe superarse antes de la fase 0 y volver a comprobarse tras la fase 1.*

| Principio / regla | Cumplimiento |
|---|---|
| **I. Arquitectura** | ✅ `notes/page.tsx` es Server Component; solo los editores y la vista de semana son cliente. La UI guarda con Server Action (`saveNoteAction`). La API v1 y la acción llaman a `saveNoteSafe` de `features/notes/queries.ts`. TypeScript estricto. Sin dependencias nuevas. ⚠️ El envío al cerrar la app usa `fetch keepalive` a `/api/v1` desde la UI: justificado en «Seguimiento de complejidad». |
| **II. Datos privados y seguros** | ✅ Datos en Supabase con RLS; `save_note` es `security invoker` y solo ejecutable por `authenticated`; sin service role. Longitud (≤ 10 000) y coherencia de conflictos comprobadas en SQL. `localStorage` guarda solo pendientes de la propia cuenta en el propio dispositivo; ningún tercero nuevo. |
| **III. Móvil primero** | ✅ Diseño 360–430 px, zonas seguras en la altura del campo de hoy, flechas y botones ≥ 44×44 px, colores con variables CSS existentes, modo oscuro. |
| **IV. Integridad de datos** | ✅ Migración nueva `20261110000000_notes_save_conflicts.sql` (no se edita ninguna aplicada): añade una columna nullable y `save_note`, y redefine `import_legacy_backup` con `create or replace` (misma firma) para que deje `last_device` nulo; compatible con los datos existentes y con la importación. Toda escritura que no sea de un dispositivo identificado pone `last_device = null`, por lo que ningún reintento sobrescribe texto ajeno. Los pendientes no se borran al cerrar sesión (FR-033). Se elimina el guardado solo con `onBlur` (guardado con retardo + cambio de vista + ocultar/cerrar). Día natural en la zona del usuario (constitución 3.0.1). Conflictos unidos, nunca sobrescritos. |
| **V. Simplicidad** | ✅ Sin bibliotecas de estado, colas ni service worker de sincronización; agrupación de semanas en TS puro. La columna `last_device` se justifica en `research.md` §4 (evita duplicar texto en reintentos). |
| Restricciones (español, < 100 ms) | ✅ Textos en español; actualizaciones optimistas (el texto vive en el estado local y se guarda en segundo plano). |
| Flujo de calidad | ✅ Rama `002-diario-semanal` con PR a `master`; `lint`, `typecheck`, `test` y `build` en `saas/`; prueba en la vista previa de Vercel (`quickstart.md`); prueba de BD en `tests/db.test.ts`. |

**Resultado**: superada con una excepción justificada (abajo). Revisión tras la fase 1: sin
cambios; el diseño de `data-model.md` y `contracts/` mantiene las mismas conclusiones.

## Estructura del proyecto

### Documentación (esta funcionalidad)

```text
specs/002-diario-semanal/
├── plan.md              # Este archivo
├── research.md          # Fase 0
├── data-model.md        # Fase 1
├── quickstart.md        # Fase 1
├── contracts/
│   ├── notes-api.md     # Lógica compartida, Server Action y PUT /api/v1/notes/{day}
│   └── diario-ui.md     # Rutas y vistas de /notes
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Código fuente (`saas/`)

```text
saas/
├── supabase/migrations/
│   └── 20261110000000_notes_save_conflicts.sql   # NUEVA: notes.last_device + save_note() + import_legacy_backup() redefinida + permisos
├── src/
│   ├── app/globals.css               # + --cabecera-h y --barra-h en :root
│   ├── components/bottom-nav.tsx     # usa --barra-h como altura
│   ├── app/(app)/layout.tsx          # la cabecera usa --cabecera-h como altura
│   ├── lib/
│   │   ├── dates.ts                  # + formatDayShort (dd/mm/aaaa)
│   │   ├── validation.ts             # noteUpsert + baseUpdatedAt/deviceId opcionales
│   │   └── db/types.ts               # Note.last_device, tipo de save_note
│   ├── features/notes/
│   │   ├── queries.ts                # + listNotesBefore, saveNoteSafe
│   │   ├── actions.ts                # saveNoteAction(day, body, base, deviceId)
│   │   ├── weeks.ts                  # NUEVO: groupWeeks, visibleDays, excerpt (puro)
│   │   └── pending-store.ts          # NUEVO: almacén local de pendientes y deviceId (sin React)
│   ├── app/(app)/notes/
│   │   ├── page.tsx                  # Server Component: resuelve vista por URL (d, w, vista)
│   │   ├── week-header.tsx           # ‹ SEMANA dd/mm/aaaa ›
│   │   ├── current-week.tsx          # Cliente: semana actual, hoy arriba, medianoche
│   │   ├── past-week.tsx             # Cliente: lectura / Editar-Hecho
│   │   ├── past-weeks-list.tsx       # Lista de semanas anteriores (servidor)
│   │   ├── note-field.tsx            # Cliente: textarea con altura automática
│   │   ├── use-note-saver.ts         # Cliente: retardo 400 ms, flush, keepalive, reintentos, estado
│   │   ├── save-status.tsx           # Indicador Guardando/Guardado/Sin guardar + aviso de conflicto
│   │   └── note-editor.tsx           # SE ELIMINA (sustituido)
│   └── app/api/v1/notes/[day]/route.ts  # PUT acepta baseUpdatedAt/deviceId
└── tests/
    ├── db.test.ts                    # + save_note
    ├── dates.test.ts                 # + formatDayShort, semanas a fin de año
    └── notes-weeks.test.ts           # NUEVO
```

**Decisión de estructura**: se mantiene la organización actual de `saas/` (rutas en
`src/app/(app)`, lógica de dominio en `src/features/<dominio>`, utilidades en `src/lib`,
pruebas en `tests/`). El calendario (`calendar/page.tsx`) ya enlaza a `/notes?d=<día>` y no
cambia.

## Seguimiento de complejidad

| Excepción | Por qué hace falta | Alternativa más simple descartada porque |
|---|---|---|
| La UI llama a `PUT /api/v1/notes/{day}` con `fetch(..., { keepalive: true })` al ocultar o cerrar la app (además de usar la Server Action para el resto) | FR-010 y SC-001: es el único mecanismo estándar que completa una petición mientras la página se descarga en iOS. Ambas rutas llaman a la misma `saveNoteSafe`. | Solo Server Action: el navegador puede cancelar la petición al cerrar la app. `sendBeacon`: solo POST y sin JSON tipado. Solo copia local: el texto no llegaría a otros dispositivos hasta reabrir la app. |
| Columna `notes.last_device` + migración (la especificación suponía que no hacía falta) | Sin ella, un reintento de una petición propia cuya respuesta se perdió se tomaría como conflicto y duplicaría el texto (FR-030 + principio IV). | Comparar solo `updated_at`: duplica texto en el caso más común de red inestable. Comprobar desde TS: no es atómico. |
