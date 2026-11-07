-- Habitos SaaS · esquema inicial
-- Principios:
--   * Cada fila pertenece a un usuario (user_id) y Row Level Security lo garantiza en la BD.
--   * Las restricciones (longitudes, coherencia, límites por usuario) viven aquí, no solo en la API,
--     porque los clientes también pueden hablar directamente con PostgREST usando su JWT.
--   * Todas las tablas se indexan empezando por user_id: las consultas siempre filtran por usuario,
--     lo que mantiene el coste constante con millones de usuarios y permite particionar en el futuro.

-- ───────────────────────────── utilidades ─────────────────────────────

create or replace function public.is_valid_timezone(tz text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  perform now() at time zone tz;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ───────────────────────────── perfiles ─────────────────────────────

create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  display_name   text check (char_length(display_name) <= 60),
  timezone       text not null default 'Europe/Madrid'
                 check (char_length(timezone) <= 64 and public.is_valid_timezone(timezone)),
  review_time    time not null default '22:00',
  review_enabled boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Crea el perfil al registrarse. La zona horaria llega en los metadatos del alta (si es válida).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text := new.raw_user_meta_data ->> 'timezone';
begin
  insert into public.profiles (id, timezone)
  values (
    new.id,
    case when tz is not null and char_length(tz) <= 64 and public.is_valid_timezone(tz)
         then tz else 'Europe/Madrid' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────────── hábitos ─────────────────────────────

create table public.habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  description text check (char_length(description) <= 120),
  position    integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id) -- destino de la FK compuesta de habit_logs
);

create index habits_user_active_idx on public.habits (user_id, position) where archived_at is null;

create trigger habits_updated_at before update on public.habits
  for each row execute function public.set_updated_at();

-- Un registro = hábito cumplido ese día. La FK compuesta impide marcar hábitos de otro usuario.
create table public.habit_logs (
  habit_id   uuid not null,
  user_id    uuid not null default auth.uid(),
  day        date not null,
  created_at timestamptz not null default now(),
  primary key (habit_id, day),
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade
);

create index habit_logs_user_day_idx on public.habit_logs (user_id, day);

-- ───────────────────────────── tareas ─────────────────────────────

create table public.tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null check (char_length(btrim(title)) between 1 and 80),
  note       text check (char_length(note) <= 200),
  due_date   date,
  due_time   time,
  done_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_time_needs_date check (due_time is null or due_date is not null)
);

create index tasks_pending_idx on public.tasks (user_id, due_date, due_time, created_at)
  where done_at is null;
create index tasks_done_idx on public.tasks (user_id, done_at desc) where done_at is not null;

create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- ───────────────────────────── diario (notas por día) ─────────────────────────────

create table public.notes (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day        date not null,
  body       text not null check (char_length(btrim(body)) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create trigger notes_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

-- ───────────────────────────── repaso diario ─────────────────────────────

create table public.review_sessions (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day          date not null,
  answers      jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (user_id, day)
);

create trigger review_sessions_updated_at before update on public.review_sessions
  for each row execute function public.set_updated_at();

-- ───────────────────────────── suscripciones push (fase 2) ─────────────────────────────

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 1024),
  p256dh     text not null check (char_length(p256dh) <= 256),
  auth       text not null check (char_length(auth) <= 64),
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ───────────────────────────── límites por usuario (anti-abuso) ─────────────────────────────

create or replace function public.enforce_row_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  max_rows integer := tg_argv[0]::integer;
  current_rows integer;
begin
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name)
    into current_rows using new.user_id;
  if current_rows >= max_rows then
    raise exception 'limit_exceeded: máximo % filas en %', max_rows, tg_table_name
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger habits_limit before insert on public.habits
  for each row execute function public.enforce_row_limit('100');
create trigger tasks_limit before insert on public.tasks
  for each row execute function public.enforce_row_limit('10000');
create trigger push_subscriptions_limit before insert on public.push_subscriptions
  for each row execute function public.enforce_row_limit('10');

-- ───────────────────────────── Row Level Security ─────────────────────────────

alter table public.profiles           enable row level security;
alter table public.habits             enable row level security;
alter table public.habit_logs         enable row level security;
alter table public.tasks              enable row level security;
alter table public.notes              enable row level security;
alter table public.review_sessions    enable row level security;
alter table public.push_subscriptions enable row level security;

-- (select auth.uid()) se evalúa una vez por consulta en lugar de por fila.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy habits_owner on public.habits for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy habit_logs_owner on public.habit_logs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy tasks_owner on public.tasks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notes_owner on public.notes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy review_sessions_owner on public.review_sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy push_subscriptions_owner on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Los visitantes anónimos no tocan ninguna tabla.
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on function public.is_valid_timezone(text) to authenticated;

-- ───────────────────────────── RPC ─────────────────────────────

-- Importa la copia JSON de la app original (index.html, `mis-habitos-AAAA-MM-DD.json`).
-- Se ejecuta en una sola transacción con los permisos del usuario (security invoker → aplica RLS).
create or replace function public.import_legacy_backup(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  datos jsonb := payload -> 'datos';
  h jsonb;
  t jsonb;
  n record;
  k text;
  new_id uuid;
  base_position integer;
  i integer := 0;
  n_habits integer := 0;
  n_logs integer := 0;
  n_tasks integer := 0;
  n_notes integer := 0;
  date_re constant text := '^\d{4}-\d{2}-\d{2}$';
  time_re constant text := '^\d{2}:\d{2}$';
  inserted integer;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if payload ->> 'app' is distinct from 'mis-habitos' or jsonb_typeof(datos) <> 'object'
     or jsonb_typeof(datos -> 'habits') <> 'array' then
    raise exception 'invalid_backup' using errcode = '22023';
  end if;

  select coalesce(max(position) + 1, 0) into base_position
    from public.habits where user_id = uid and archived_at is null;

  for h in select * from jsonb_array_elements(datos -> 'habits') loop
    continue when jsonb_typeof(h) <> 'object'
      or char_length(btrim(coalesce(h ->> 'name', ''))) = 0;

    insert into public.habits (user_id, name, description, position)
    values (
      uid,
      left(btrim(h ->> 'name'), 40),
      nullif(left(coalesce(h ->> 'description', ''), 120), ''),
      base_position + i
    )
    returning id into new_id;
    i := i + 1;
    n_habits := n_habits + 1;

    if jsonb_typeof(h -> 'history') = 'object' then
      for k in select key from jsonb_each(h -> 'history') where value = 'true'::jsonb loop
        continue when k !~ date_re;
        begin
          insert into public.habit_logs (habit_id, user_id, day) values (new_id, uid, k::date)
          on conflict do nothing;
          get diagnostics inserted = row_count;
          n_logs := n_logs + inserted;
        exception when invalid_datetime_format or datetime_field_overflow then
          null; -- fecha imposible (p. ej. 2026-02-31): se ignora
        end;
      end loop;
    end if;
  end loop;

  if jsonb_typeof(datos -> 'habitos_tareas') = 'array' then
    for t in select * from jsonb_array_elements(datos -> 'habitos_tareas') loop
      continue when jsonb_typeof(t) <> 'object'
        or char_length(btrim(coalesce(t ->> 'titulo', ''))) = 0;
      begin
        insert into public.tasks (user_id, title, note, due_date, due_time, done_at, created_at)
        values (
          uid,
          left(btrim(t ->> 'titulo'), 80),
          nullif(left(coalesce(t ->> 'nota', ''), 200), ''),
          case when t ->> 'fecha' ~ date_re then (t ->> 'fecha')::date end,
          case when t ->> 'fecha' ~ date_re and t ->> 'hora' ~ time_re then (t ->> 'hora')::time end,
          case when (t ->> 'hecha')::boolean is true then
            coalesce(to_timestamp(nullif(t ->> 'hechaEn', '')::double precision / 1000), now())
          end,
          coalesce(to_timestamp(nullif(t ->> 'creadaEn', '')::double precision / 1000), now())
        );
        n_tasks := n_tasks + 1;
      exception when invalid_datetime_format or datetime_field_overflow
                  or invalid_text_representation or numeric_value_out_of_range then
        null; -- tarea con datos dañados: se omite sin abortar la importación
      end;
    end loop;
  end if;

  if jsonb_typeof(datos -> 'habitos_notas') = 'object' then
    for n in select key, value from jsonb_each(datos -> 'habitos_notas') loop
      continue when n.key !~ date_re or jsonb_typeof(n.value) <> 'object'
        or char_length(btrim(coalesce(n.value ->> 'texto', ''))) = 0;
      begin
        insert into public.notes (user_id, day, body)
        values (uid, n.key::date, left(n.value ->> 'texto', 10000))
        on conflict (user_id, day) do update set body = excluded.body;
        n_notes := n_notes + 1;
      exception when invalid_datetime_format or datetime_field_overflow then
        null;
      end;
    end loop;
  end if;

  return jsonb_build_object('habits', n_habits, 'logs', n_logs, 'tasks', n_tasks, 'notes', n_notes);
end;
$$;

grant execute on function public.import_legacy_backup(jsonb) to authenticated;

-- Respuesta del repaso: marca/desmarca el hábito y guarda la respuesta en una sola transacción.
-- La fusión `answers || {...}` es atómica, así que dos respuestas rápidas no se pisan.
create or replace function public.record_review_answer(p_day date, p_habit_id uuid, p_answer text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_answer not in ('yes', 'no') then
    raise exception 'invalid_answer' using errcode = '22023';
  end if;

  if p_answer = 'yes' then
    insert into public.habit_logs (habit_id, user_id, day) values (p_habit_id, uid, p_day)
    on conflict do nothing;
  else
    delete from public.habit_logs where habit_id = p_habit_id and day = p_day and user_id = uid;
  end if;

  insert into public.review_sessions (user_id, day, answers)
  values (uid, p_day, jsonb_build_object(p_habit_id::text, p_answer))
  on conflict (user_id, day) do update
    set answers = public.review_sessions.answers || excluded.answers
  returning answers into result;
  return result;
end;
$$;

grant execute on function public.record_review_answer(date, uuid, text) to authenticated;

-- Borra la cuenta y, en cascada, todos sus datos (derecho de supresión, RGPD art. 17).
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

grant execute on function public.delete_account() to authenticated;
