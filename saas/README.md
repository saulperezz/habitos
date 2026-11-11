# Habitos SaaS

Versión multiusuario de Habitos: cuentas, datos sincronizados entre dispositivos y un backend que escala
horizontalmente. Vive en `saas/` y **no toca la app original** (`index.html` en la raíz, servida por
GitHub Pages), que sigue funcionando igual.

- **Stack**: Next.js 16 (App Router, React 19, Server Components y Server Actions) · TypeScript estricto ·
  Tailwind CSS 4 · Supabase (Postgres 17, Auth, Row Level Security) · Zod · Vitest.
- **Despliegue**: Vercel (app) + Supabase (BD y auth). Ambos tienen plan gratuito.

---

## 1. Arquitectura del sistema

```
 Navegador / PWA instalable
        │ HTTPS (cookie de sesión httpOnly)       Apps móviles / integraciones
        │                                          │ Authorization: Bearer <JWT>
        ▼                                          ▼
 ┌──────────────────────── Vercel (CDN global + funciones sin estado) ───────────────────────┐
 │ proxy.ts ─ refresca la sesión y protege rutas                                              │
 │ Server Components ─ leen datos en el servidor (sin cascadas de peticiones en el cliente)   │
 │ Server Actions ─ mutaciones desde la UI          /api/v1/* ─ API REST pública versionada   │
 │                └──────────── features/*/queries.ts (una sola lógica de dominio) ──────────┘ │
 └───────────────────────────────────────────┬──────────────────────────────────────────────┘
                                             │ PostgREST + JWT del usuario
                                             ▼
 ┌──────────────────────────────── Supabase ────────────────────────────────┐
 │ Auth (correo+contraseña, enlace mágico; OAuth listo para activar)         │
 │ Postgres: RLS por usuario, restricciones, límites anti-abuso, RPC atómicas│
 │ Supavisor (pooling)  ·  réplicas de lectura  ·  pg_cron (fase 2: avisos)  │
 └───────────────────────────────────────────────────────────────────────────┘
```

### Decisiones clave (y por qué escalan)

| Decisión | Motivo |
|---|---|
| **Servidor sin estado** | Toda la información está en Postgres; Vercel replica funciones sin límite. |
| **Seguridad en la base de datos (RLS)** | Cada consulta va con el JWT del usuario y Postgres filtra por `user_id = auth.uid()`. Un fallo en una ruta no puede exponer datos de otro usuario. La clave *service role* no se usa nunca. |
| **Restricciones en SQL, no solo en la API** | Los clientes podrían hablar con PostgREST directamente; longitudes, coherencia (hora ⇒ fecha), zonas horarias válidas y límites por usuario se comprueban en la BD. |
| **Historial normalizado** (`habit_logs`) | El objeto `history` de la app original crece sin límite. Una fila por (hábito, día) con PK compuesta da lecturas por rango indexadas y escrituras idempotentes. |
| **Índices que empiezan por `user_id`** | Toda consulta filtra por usuario → coste constante con millones de usuarios; permite particionar por hash de `user_id` cuando haga falta. |
| **Fechas en la zona del usuario** | `timestamptz` en UTC + zona IANA en el perfil. El «día» se calcula con `Intl` en el servidor; el repaso conserva la regla de las 04:00. |
| **RPC atómicas** | Importar una copia o responder al repaso son una sola transacción (`import_legacy_backup`, `record_review_answer`). |
| **Paginación por cursor** (keyset) | Las tareas completadas se paginan por `(done_at, id)` sin `OFFSET`. |
| **Rate limiting** | 120 peticiones/min por usuario en `/api/v1` (5/min para importar y borrar cuenta). Redis de Upstash si se configura; si no, en memoria por instancia. |
| **Una lógica, dos entradas** | Server Actions (UI) y `/api/v1` (terceros) llaman a las mismas funciones de `features/*/queries.ts`. |

### Hoja de ruta de escalado

1. **0–100 k usuarios**: tal cual (plan Pro de Supabase + Vercel Pro).
2. **100 k–1 M**: réplicas de lectura de Supabase para las páginas de lectura; Upstash para rate limiting
   global; caché de perfil por petición (ya hecha con `React.cache`).
3. **1 M+**: particionar `habit_logs` por hash de `user_id`; mover el envío de avisos a una cola
   (pg_cron → `pgmq` → Edge Functions por lotes); separar analítica en un almacén aparte.

## 2. Estructura de archivos

```
saas/
├─ supabase/
│  ├─ config.toml                       # stack local (supabase start)
│  └─ migrations/20261107000000_init.sql # tablas, índices, RLS, triggers, RPC
├─ src/
│  ├─ proxy.ts                          # sesión + protección de rutas (antes «middleware»)
│  ├─ app/
│  │  ├─ page.tsx                       # landing
│  │  ├─ (auth)/login/                  # entrar, registrarse, enlace mágico
│  │  ├─ auth/confirm/route.ts          # destino de los enlaces de correo
│  │  ├─ (app)/layout.tsx               # shell móvil con pestañas inferiores
│  │  ├─ (app)/today/                   # hábitos de hoy, rachas, gestión de hábitos
│  │  ├─ (app)/review/                  # repaso diario a pantalla completa
│  │  ├─ (app)/tasks/                   # tareas y eventos
│  │  ├─ (app)/calendar/                # mes + detalle de día (editar días pasados)
│  │  ├─ (app)/notes/                   # diario por semanas
│  │  ├─ (app)/settings/                # repaso, zona horaria, importar copia, borrar cuenta
│  │  ├─ api/v1/…                       # API REST
│  │  ├─ api/health/route.ts
│  │  └─ manifest.ts                    # PWA instalable
│  ├─ features/<dominio>/
│  │  ├─ queries.ts                     # acceso a datos (recibe un cliente con el JWT del usuario)
│  │  └─ actions.ts                     # Server Actions: validan con Zod y llaman a queries
│  ├─ components/                       # piezas de UI compartidas
│  └─ lib/
│     ├─ dates.ts                       # día del usuario, rachas, calendario
│     ├─ validation.ts                  # esquemas Zod compartidos
│     ├─ errors.ts                      # AppError y traducción de errores de Postgres
│     ├─ db/types.ts                    # tipos de la BD
│     ├─ supabase/{server,client}.ts
│     └─ server/{api,action,session,rate-limit}.ts
└─ tests/                               # Vitest: migración real en Postgres (PGlite), fechas, validación
```

## 3. Esquema de base de datos

| Tabla | Clave | Columnas | Notas |
|---|---|---|---|
| `profiles` | `id` → `auth.users` | `timezone`, `review_time`, `review_enabled`, `display_name`, `last_exported_at` | Se crea por trigger al registrarse, con la zona horaria del navegador. `last_exported_at` = última copia exportada (la pone `mark_backup_exported()` con `now()` de Postgres). |
| `habits` | `id` | `user_id`, `name` (1–40), `description` (≤120), `position`, `archived_at` | Máx. 100 por usuario. |
| `habit_logs` | `(habit_id, day)` | `user_id`, `created_at` | FK compuesta `(habit_id, user_id)` → imposible marcar hábitos ajenos. |
| `tasks` | `id` | `title` (1–80), `note` (≤200), `due_date`, `due_time`, `done_at` | `due_time` exige `due_date`. Índices parciales para pendientes y completadas. Máx. 10 000. |
| `notes` | `(user_id, day)` | `body` (1–10 000), `last_device` | Una nota por día (diario). Texto vacío = se borra. `last_device` = dispositivo de la última escritura sin conflicto (para no sobrescribir cambios de otro dispositivo). |
| `review_sessions` | `(user_id, day)` | `answers` jsonb, `completed_at` | Estado del repaso para poder continuarlo. |
| `push_subscriptions` | `id` | `endpoint`, `p256dh`, `auth` | Preparada para la fase 2 (avisos push). |

RPC: `export_backup()`, `mark_backup_exported()`, `import_legacy_backup(payload)`, `record_review_answer(day, habit, answer)`, `save_note(day, body, base, device)`, `delete_account()`.
Borrar un usuario borra en cascada todos sus datos (RGPD).

## 4. API REST (`/api/v1`)

Autenticación: cookie de sesión (navegador) o `Authorization: Bearer <access_token de Supabase>`.
Respuestas `{ "data": … }`; errores `{ "error": { "code", "message" } }` con 400/401/404/409/413/422/429.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` / `PATCH` / `DELETE` | `/me` | Perfil (zona horaria, hora del repaso) · borrar cuenta |
| `GET` | `/habits?from=AAAA-MM-DD&to=AAAA-MM-DD` | Hábitos activos con los días cumplidos del rango (≤400 días) |
| `POST` | `/habits` | Crear `{ name, description? }` |
| `PATCH` / `DELETE` | `/habits/:id` | Editar `{ name?, description?, position?, archived? }` · borrar |
| `PUT` | `/habits/reorder` | `{ ids: [...] }` en el orden deseado |
| `PUT` / `DELETE` | `/habits/:id/logs/:day` | Marcar / desmarcar un día (idempotente) |
| `GET` | `/tasks?status=pending\|done&limit=50&cursor=…` | Pendientes ordenadas o completadas paginadas |
| `POST` | `/tasks` | Crear `{ title, note?, dueDate?, dueTime? }` |
| `PATCH` / `DELETE` | `/tasks/:id` | Editar o completar `{ done: true }` · borrar |
| `GET` / `PUT` | `/notes/:day` | Leer / guardar `{ body, baseUpdatedAt?, deviceId? }` (vacío borra). Sin `baseUpdatedAt` gana el último guardado. Con `baseUpdatedAt` (el `updated_at` que tenía el cliente, o `null`) nunca se sobrescribe una nota cambiada en otro dispositivo: entonces responde `{ data: { outcome, note } }` con `outcome` = `saved` · `merged` (se unieron los textos) · `kept` (se conserva la del servidor) · `deleted` · `too_long` (no se guardó nada: la unión superaría 10 000 caracteres). |
| `GET` / `POST` | `/review?day=…` · `/review` | Estado del repaso · responder `{ day, habitId, answer: yes\|no\|skip }` |
| `GET` | `/export` | Descarga la copia completa `mis-habitos-AAAA-MM-DD.json` (día de hoy en la zona del perfil). Responde el JSON sin envoltorio `{ data }`, con `Content-Disposition: attachment` y `Cache-Control: no-store`. 5/min. **No** cambia la fecha de la última copia (eso lo hace Ajustes solo si el archivo se guardó). |
| `POST` | `/import` | Importa una copia `mis-habitos-*.json` de la app original o exportada desde aquí (máx. 4 MB, 5/min). No duplica: reconoce hábitos por `uuid` o nombre y tareas por `uuid` o título + creación; une notas con otro texto. Devuelve `{ data: { habits, logs, tasks, notes, notes_merged, notes_too_long, reviews } }` con lo añadido de verdad. |
| `GET` | `/api/health` | Comprobación de salud (sin auth) |

Ejemplo:

```bash
curl -X POST https://TU-APP.vercel.app/api/v1/habits \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Leer 10 minutos"}'
```

## 5. Arquitectura de UI

- **Server Components por defecto**: cada pantalla pide sus datos en el servidor en paralelo
  (`Promise.all`) y envía HTML listo; el JavaScript del cliente se limita a las piezas interactivas.
- **Actualizaciones optimistas** (`useOptimistic`): marcar un hábito o una tarea responde al instante y
  se corrige si el servidor falla.
- **Móvil primero**: pestañas inferiores *Hoy · Tareas · Calendario · Diario*, ajustes en la cabecera,
  zonas seguras de iOS, objetivos táctiles ≥44 px, colores en variables CSS de `:root` con modo oscuro
  automático. Interfaz en español.
- **Accesibilidad**: `aria-pressed`, `aria-current`, `role="alert"` en errores, etiquetas en todos los campos.

---

## Ver la web (sin tocar la app actual)

La app original sigue en `https://saulperezz.github.io/habitos/` (GitHub Pages sirve `main`; esta rama
no la cambia, y aunque se fusione, `saas/` es una carpeta aparte).

### A. En la nube (recomendado)

1. **Supabase** → <https://supabase.com> › *New project* (región cercana, p. ej. Frankfurt).
2. Aplica el esquema: *SQL Editor* › pega el contenido de `supabase/migrations/20261107000000_init.sql`
   › *Run*. (O con la CLI: `npx supabase link --project-ref <ref> && npx supabase db push`.)
3. *Authentication › URL Configuration*: en **Site URL** pon la URL de Vercel (paso 5) y en **Redirect
   URLs** añade `https://*.vercel.app/auth/confirm` y `http://localhost:3000/auth/confirm`.
4. **Vercel** → <https://vercel.com/new> › importa el repo `saulperezz/habitos` ›
   **Root Directory: `saas`** › variables de entorno:
   - `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase › *Project Settings › API Keys*)
   - `NEXT_PUBLIC_SITE_URL` = la URL de Vercel
5. *Deploy*. Vercel crea además una **URL de vista previa por cada rama**, así que puedes abrir esta rama
   sin publicar nada en producción.

### B. En tu ordenador

```bash
cd saas
npm install
npx supabase start          # necesita Docker; aplica la migración automáticamente
cp .env.example .env.local  # pega la URL y la «Publishable key» que imprime el comando anterior
npm run dev                 # http://localhost:3000
```

### Copia de seguridad y traer tus datos

- **Exportar**: *Ajustes › Copia de seguridad › Exportar copia de seguridad* descarga
  `mis-habitos-AAAA-MM-DD.json` con hábitos (también archivados), historial, tareas, notas, repasos y
  configuración del repaso. El archivo también se puede importar en la app original.
- **Importar**: *Ajustes › Traer datos* acepta copias de la app original y de aquí; añade solo lo que
  falta. En la app original: *Ajustes › Copia de seguridad › Exportar*.

Formato y reglas: `specs/003-exportar-copia-seguridad/data-model.md` y
`specs/003-exportar-copia-seguridad/contracts/backup-api.md`.

## Calidad

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

`tests/db.test.ts` ejecuta la migración real en Postgres (PGlite) y comprueba RLS entre usuarios,
restricciones, límites, importación y borrado de cuenta. La CI (`.github/workflows/saas-ci.yml`) lo
ejecuta en cada cambio bajo `saas/`.

## Fase 2 (fuera del MVP)

- Avisos push del repaso: `push_subscriptions` + `pg_cron` cada minuto → Edge Function que envía Web
  Push (reutilizando la lógica VAPID de `notificaciones/worker.js`).
- Modo sin conexión con cola de sincronización (service worker + IndexedDB).
- OAuth (Google/Apple), suscripciones de pago (Stripe), analítica de producto y Sentry.
