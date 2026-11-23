-- Avisos push del repaso diario (spec 004).
-- Ver specs/004-avisos-push/data-model.md y research.md (D1–D4, D7, D11).

-- ───────────────────────────── esquema ─────────────────────────────

-- Último día natural del usuario (zona del perfil) en que se reclamó el aviso: un aviso al día.
alter table public.profiles add column last_reminder_day date;

alter table public.push_subscriptions add column updated_at timestamptz not null default now();

-- La tabla no tenía interfaz hasta ahora: no puede haber filas legítimas que no cumplan las reglas.
delete from public.push_subscriptions
where substring(endpoint from '^https://([^/:]+)') is null
   or substring(endpoint from '^https://([^/:]+)')
      !~ '(^|\.)push\.apple\.com$|^fcm\.googleapis\.com$|(^|\.)notify\.windows\.com$|^updates\.push\.services\.mozilla\.com$'
   or p256dh !~ '^[A-Za-z0-9_-]{86,88}$'
   or auth !~ '^[A-Za-z0-9_-]{21,24}$';

-- Solo servicios push conocidos: el servidor nunca hace peticiones a hosts arbitrarios (SSRF).
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_host check (
  substring(endpoint from '^https://([^/:]+)')
    ~ '(^|\.)push\.apple\.com$|^fcm\.googleapis\.com$|(^|\.)notify\.windows\.com$|^updates\.push\.services\.mozilla\.com$'
) not valid;
alter table public.push_subscriptions validate constraint push_subscriptions_endpoint_host;

-- Claves en base64url: p256dh = 65 bytes, auth = 16 bytes.
alter table public.push_subscriptions add constraint push_subscriptions_keys_format check (
  p256dh ~ '^[A-Za-z0-9_-]{86,88}$' and auth ~ '^[A-Za-z0-9_-]{21,24}$'
) not valid;
alter table public.push_subscriptions validate constraint push_subscriptions_keys_format;

-- ───────────────────────────── alta de dispositivos ─────────────────────────────

-- Registra (o renueva) el dispositivo del usuario. `security definer` porque `endpoint` es único en
-- toda la tabla y un dispositivo solo recibe avisos de la última cuenta que lo activa (FR-006):
-- hay que poder borrar la fila de otra cuenta con ese mismo endpoint, y solo esa.
create or replace function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  tz text;
  review_at time;
  local_now timestamp;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_endpoint is null or char_length(p_endpoint) > 1024
     or coalesce(substring(p_endpoint from '^https://([^/:]+)'), '')
        !~ '(^|\.)push\.apple\.com$|^fcm\.googleapis\.com$|(^|\.)notify\.windows\.com$|^updates\.push\.services\.mozilla\.com$'
     or coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{86,88}$'
     or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{21,24}$' then
    raise exception 'invalid_push_subscription' using errcode = 'P0001';
  end if;

  delete from public.push_subscriptions where endpoint = p_endpoint and user_id <> uid;

  -- Primero se actualiza: el disparador de límite (10) salta en todo INSERT, también en uno con
  -- ON CONFLICT que acabe actualizando, y volver a registrar un dispositivo no debe contar como nuevo.
  update public.push_subscriptions
    set p256dh = p_p256dh, auth = p_auth, updated_at = now()
    where endpoint = p_endpoint and user_id = uid;
  if not found then
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values (uid, p_endpoint, p_p256dh, p_auth);
  end if;

  -- Si ya pasó la hora de hoy, el primer aviso es mañana (research D4).
  select p.timezone, p.review_time into tz, review_at from public.profiles p where p.id = uid;
  local_now := now() at time zone tz;
  if local_now::time >= review_at then
    update public.profiles
      set last_reminder_day = local_now::date
      where id = uid and last_reminder_day is distinct from local_now::date;
  end if;
end;
$$;

revoke execute on function public.register_push_subscription(text, text, text) from anon, public;
grant execute on function public.register_push_subscription(text, text, text) to authenticated;

-- ───────────────────────────── envío programado (research D1–D3) ─────────────────────────────

-- Rol propio de la Edge Function `review-reminders`. No es la sesión de un usuario ni la clave
-- pública (excepción justificada en specs/004-avisos-push/plan.md): sin permisos sobre ninguna tabla,
-- solo puede ejecutar las dos funciones de abajo. La contraseña se pone a mano al desplegar:
--   alter role reminder_sender with login password '…';
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'reminder_sender') then
    create role reminder_sender nologin noinherit;
  end if;
end;
$$;

grant usage on schema public to reminder_sender;

-- Elige a quién le toca el aviso en el instante `p_now`, lo marca como avisado hoy en el mismo paso
-- (dos ejecuciones solapadas nunca eligen al mismo usuario) y devuelve sus dispositivos.
-- Toca si: repaso activo, algún dispositivo, algún hábito activo, la hora local ya llegó, no se le
-- avisó hoy (día natural) y el repaso del día (regla de las 04:00) no está completado.
create or replace function public.claim_due_reminders(p_limit integer default 500, p_now timestamptz default now())
returns table (user_id uuid, day date, subscription_id uuid, endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with due as (
    select p.id, (p_now at time zone p.timezone) as local_now
    from public.profiles p
    where p.review_enabled
      and exists (select 1 from public.push_subscriptions s where s.user_id = p.id)
      and exists (select 1 from public.habits h where h.user_id = p.id and h.archived_at is null)
      and (p_now at time zone p.timezone)::time >= p.review_time
      and p.last_reminder_day is distinct from (p_now at time zone p.timezone)::date
      and not exists (
        select 1 from public.review_sessions r
        where r.user_id = p.id
          and r.completed_at is not null
          -- Día del repaso: antes de las 04:00 locales sigue siendo el día anterior.
          and r.day = ((p_now at time zone p.timezone) - interval '4 hours')::date
      )
    order by p.id
    limit greatest(p_limit, 0)
    for update of p skip locked
  ), marked as (
    update public.profiles p
      set last_reminder_day = due.local_now::date
      from due
      where p.id = due.id
      returning p.id, p.last_reminder_day
  )
  select s.user_id, m.last_reminder_day, s.id, s.endpoint, s.p256dh, s.auth
  from marked m
  join public.push_subscriptions s on s.user_id = m.id;
end;
$$;

-- Resultado del envío: `gone` (404/410) borra el dispositivo; si ningún dispositivo del usuario
-- aceptó el aviso, se libera el día para reintentarlo el minuto siguiente (solo si sigue siendo ese
-- día). Si al menos uno lo aceptó no se reintenta, para no duplicarlo. Ignora elementos mal formados.
create or replace function public.report_reminder_results(p_results jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e jsonb;
  sid uuid;
  uid uuid;
  d date;
  outcome text;
  uids uuid[] := '{}';
  days date[] := '{}';
  sents boolean[] := '{}';
begin
  if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results) > 5000 then
    return;
  end if;

  for e in select value from jsonb_array_elements(p_results) loop
    begin
      sid := (e ->> 'subscription_id')::uuid;
      uid := (e ->> 'user_id')::uuid;
      d := (e ->> 'day')::date;
      outcome := e ->> 'outcome';
    exception when others then
      continue;
    end;
    if sid is null or uid is null or d is null or outcome is null or outcome not in ('sent', 'gone', 'retry') then
      continue;
    end if;
    if outcome = 'gone' then
      delete from public.push_subscriptions s where s.id = sid and s.user_id = uid;
    end if;
    uids := uids || uid;
    days := days || d;
    sents := sents || (outcome = 'sent');
  end loop;

  update public.profiles p
    set last_reminder_day = null
    from (
      select t.u, t.dd
      from unnest(uids, days, sents) as t(u, dd, ok)
      group by t.u, t.dd
      having not bool_or(t.ok)
    ) x
    where p.id = x.u and p.last_reminder_day = x.dd;
end;
$$;

revoke execute on function public.claim_due_reminders(integer, timestamptz) from public, anon, authenticated, service_role;
revoke execute on function public.report_reminder_results(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.claim_due_reminders(integer, timestamptz) to reminder_sender;
grant execute on function public.report_reminder_results(jsonb) to reminder_sender;

-- ───────────────────────────── programación cada minuto (research D11) ─────────────────────────────

-- Solo donde existen pg_cron y pg_net (Supabase). PGlite y la CI se lo saltan.
-- La URL de la función y el secreto del cron no van en el repositorio: se leen en cada ejecución de
-- Supabase Vault (`reminders_function_url`, `reminders_cron_secret`); si falta alguno, no hace nada.
do $outer$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron with schema pg_catalog;
    create extension if not exists pg_net with schema extensions;

    if exists (select 1 from cron.job where jobname = 'review-reminders') then
      perform cron.unschedule('review-reminders');
    end if;

    perform cron.schedule('review-reminders', '* * * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_function_url'),
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 5000
      )
      where exists (select 1 from vault.decrypted_secrets where name = 'reminders_function_url')
        and exists (select 1 from vault.decrypted_secrets where name = 'reminders_cron_secret');
    $job$);
  end if;
end;
$outer$;
