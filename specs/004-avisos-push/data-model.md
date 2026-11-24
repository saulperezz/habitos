# Modelo de datos: Avisos push del repaso diario

Todo va en una migración nueva, `saas/supabase/migrations/20261123000000_push_reminders.sql`. No se
edita ninguna migración aplicada.

## Cambios de esquema

### `profiles` (existente) — columna nueva

| Columna | Tipo | Notas |
|---|---|---|
| `last_reminder_day` | `date null` | Último día natural del usuario (zona del perfil) en que se reclamó el aviso del repaso. `null` = nunca. Solo la escriben `claim_due_reminders`, `report_reminder_results` y `register_push_subscription`. |

La columna admite nulos, así que las filas existentes no cambian.

Hay un riesgo: la política `profiles_update` deja al usuario actualizar su propia fila, también
esta columna. Lo único que conseguiría es saltarse o recibir su propio aviso, sin efecto sobre
otros. Se acepta, para no añadir disparadores (principio V).

### `push_subscriptions` (existente) — cambios

| Cambio | Detalle |
|---|---|
| `check` nuevo `push_subscriptions_endpoint_host` (`not valid` + `validate`) | El host del `endpoint` debe estar en la lista de servicios push: `*.push.apple.com`, `fcm.googleapis.com`, `*.notify.windows.com`, `updates.push.services.mozilla.com`. Se comprueba con una expresión regular sobre `substring(endpoint from '^https://([^/:]+)')`. |
| `check` nuevo `push_subscriptions_keys_format` | `p256dh ~ '^[A-Za-z0-9_-]{86,88}$'` y `auth ~ '^[A-Za-z0-9_-]{21,24}$'` (base64url de 65 y 16 bytes, con o sin relleno quitado). |
| Columna nueva `updated_at timestamptz not null default now()` | Se renueva al volver a registrar (FR-008), solo para diagnóstico. |

Se mantienen los demás elementos:

- `id`, `user_id` (`default auth.uid()`, `on delete cascade` → FR-021), `endpoint unique`,
  `p256dh`, `auth` y `created_at`;
- el índice `push_subscriptions_user_idx`, el límite de 10 por usuario (FR-007) y la política
  `push_subscriptions_owner` (FR-020).

La tabla no tiene filas en producción porque hasta ahora no había interfaz para crearlas. Aun así,
las restricciones se añaden `not valid` y después se validan, y la migración primero borra las filas
que no las cumplan (no puede haber ninguna legítima).

## Rol nuevo: `reminder_sender`

```text
create role reminder_sender nologin noinherit;          -- si no existe
grant usage on schema public to reminder_sender;
grant execute on function public.claim_due_reminders(integer, timestamptz) to reminder_sender;
grant execute on function public.report_reminder_results(jsonb) to reminder_sender;
-- sin grants sobre tablas; anon/authenticated no reciben execute sobre estas dos funciones
```

En el despliegue se le da contraseña a mano: `alter role reminder_sender with login password '…'`
(`quickstart.md`). La contraseña no va en el repositorio.

## Funciones (RPC)

Todas llevan `set search_path = ''`, nombres calificados y `revoke execute … from anon, public`.

### `register_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void`

- `security definer`; `grant execute` solo a `authenticated`; `uid := auth.uid()` (error si es nulo).
- Pasos:
  1. Valida los formatos (los mismos `check` de la tabla; si fallan → `invalid_push_subscription`).
  2. `delete from push_subscriptions where endpoint = p_endpoint and user_id <> uid` (FR-006).
  3. `insert … on conflict (endpoint) do update set p256dh, auth, updated_at = now()` con
     `user_id = uid`. El disparador de límite (10) lanza `limit_exceeded` (FR-007).
  4. D4: si `(now() at time zone tz)::time >= review_time` y `last_reminder_day is distinct from`
     hoy local → `last_reminder_day = hoy local`.

### `claim_due_reminders(p_limit integer default 500, p_now timestamptz default now()) returns table (user_id uuid, day date, subscription_id uuid, endpoint text, p256dh text, auth text)`

- `security definer`; `grant execute` solo a `reminder_sender`.
- Pasos:
  1. Elige hasta `p_limit` **perfiles** que cumplan las condiciones de D3 (research):
     `for update of profiles skip locked`.
  2. Para esos perfiles fija `last_reminder_day = día local` y guarda el valor anterior en una
     tabla temporal de la transacción para devolverlo.
  3. Devuelve una fila por dispositivo de esos usuarios.
- El día que se devuelve es el día natural local que se ha reclamado; lo usa `report_reminder_results`.

### `report_reminder_results(p_results jsonb) returns void`

- `security definer`; `grant execute` solo a `reminder_sender`.
- `p_results` es un array, como mucho de 5 000 elementos:
  `[{ "subscription_id": uuid, "user_id": uuid, "day": "AAAA-MM-DD", "outcome": "sent" | "gone" | "retry" }]`.
- Pasos:
  1. `gone` → `delete from push_subscriptions where id = subscription_id and user_id = user_id`.
  2. Para cada `(user_id, day)` sin ningún `sent` →
     `update profiles set last_reminder_day = null where id = user_id and last_reminder_day = day`.
     Con eso se vuelve a intentar el minuto siguiente; D3 solo lo vuelve a elegir si sigue siendo
     el mismo día y el repaso sigue sin completar.
- Ignora los elementos mal formados, nunca lanza error por ellos.

Sobre el paso 2: poner `null` en lugar del valor anterior es equivalente para D3, porque solo
compara con el día de hoy. Así no hace falta transportar el valor anterior.

## Programación (solo si existen las extensiones)

```text
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron; create extension if not exists pg_net;
    perform cron.schedule('review-reminders', '* * * * *', $job$ … net.http_post(url, headers) … $job$);
  end if;
end $$;
```

El trabajo lee de `vault.decrypted_secrets` dos secretos, `reminders_function_url` y
`reminders_cron_secret`. Si falta alguno, no hace nada. Envía
`POST <url>` con `Authorization: Bearer <secreto>`, cuerpo `{}` y `timeout_milliseconds := 5000`.

## Entidades en TypeScript (`src/lib/db/types.ts`)

- `profiles.Row.last_reminder_day: string | null`.
- `push_subscriptions.Row.updated_at: string`.
- `Functions.register_push_subscription: { Args: { p_endpoint: string; p_p256dh: string; p_auth: string }; Returns: undefined }`.
- `claim_due_reminders` y `report_reminder_results` **no** se añaden: la app no puede llamarlas.

## Estado en el cliente (por dispositivo)

| Clave | Valor | Uso |
|---|---|---|
| `localStorage['habitos-avisos']` | `'1'` o ausente | El usuario activó los avisos en este dispositivo; `PushSync` resincroniza solo si está (research D8). |
| `sessionStorage['habitos-avisos-sync']` | `'1'` | Ya se resincronizó en esta pestaña. |

Toda lectura y escritura va en `try/catch`. Sin almacenamiento, los avisos siguen funcionando: lo
único que se pierde es la resincronización automática.

## Estados de los avisos en Ajustes

```text
no-disponible ─(nunca cambia en este navegador)
no-activados ──Activar + permiso concedido──▶ activados
no-activados ──Activar + permiso denegado──▶ bloqueados
activados ──Desactivar──▶ no-activados
activados ──permiso retirado en el sistema──▶ bloqueados (al volver a abrir)
bloqueados ──permiso concedido en el sistema──▶ no-activados (o activados si sigue la suscripción)
```

## Reglas de validación (resumen)

| Campo | Regla | Dónde |
|---|---|---|
| `endpoint` | `https://`, ≤ 1024, host en la lista de servicios push | Zod (`pushSubscription` en `validation.ts`), `check` en SQL, RPC y Edge Function |
| `p256dh` | base64url de 65 bytes (86–88 caracteres) | Zod + `check` |
| `auth` | base64url de 16 bytes (21–24 caracteres) | Zod + `check` |
| Dispositivos por usuario | ≤ 10 | Disparador existente (`limit_exceeded`) |
| Avisos de prueba | ≤ 5 por minuto y usuario | `rateLimit` en la Server Action |
