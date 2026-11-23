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
