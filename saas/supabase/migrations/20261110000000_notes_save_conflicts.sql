-- Diario semanal (002): guardado de notas sin pérdidas entre dispositivos.
--
-- · notes.last_device: dispositivo que hizo la última escritura con save_note(). Cualquier otra
--   escritura (API sin dispositivo, importación) lo deja nulo, de modo que un reintento posterior
--   con una versión antigua se detecta como conflicto y nunca sobrescribe texto ajeno.
-- · save_note(): guarda, borra (texto vacío) o, si la nota cambió en otro dispositivo, une ambos
--   textos (o conserva la del servidor si no hay nada que unir). Una unión deja
--   last_device nulo, para que un reintento con la versión antigua no la sobrescriba. Todo en una transacción con la
--   fila bloqueada. security invoker → aplica RLS.
-- · import_legacy_backup(): misma función que en la migración inicial, salvo que al sobrescribir
--   una nota existente también pone last_device = null.

alter table public.notes add column last_device uuid;

create or replace function public.save_note(p_day date, p_body text, p_base timestamptz, p_device uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cur public.notes;
  -- Vacío = sin ningún carácter visible (btrim solo quita espacios, no saltos de línea).
  is_empty boolean := coalesce(p_body, '') !~ '[^[:space:]]';
  joined text;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into cur from public.notes where user_id = uid and day = p_day for update;

  if not found then
    if is_empty then
      return jsonb_build_object('outcome', 'deleted', 'note', null);
    end if;
    insert into public.notes (user_id, day, body, last_device)
    values (uid, p_day, p_body, p_device)
    on conflict (user_id, day) do nothing
    returning * into cur;
    if found then
      return jsonb_build_object('outcome', 'saved', 'note', to_jsonb(cur));
    end if;
    -- Otro dispositivo la ha creado a la vez: se trata como nota existente (conflicto).
    select * into cur from public.notes where user_id = uid and day = p_day for update;
  end if;

  -- Sin conflicto: nadie la cambió desde la versión que tenía el dispositivo, o la última
  -- escritura la hizo este mismo dispositivo (p. ej. un reintento cuya respuesta se perdió).
  if cur.updated_at is not distinct from p_base
     or (p_device is not null and cur.last_device is not distinct from p_device) then
    if is_empty then
      delete from public.notes where user_id = uid and day = p_day;
      return jsonb_build_object('outcome', 'deleted', 'note', null);
    end if;
    update public.notes set body = p_body, last_device = p_device
      where user_id = uid and day = p_day
      returning * into cur;
    return jsonb_build_object('outcome', 'saved', 'note', to_jsonb(cur));
  end if;

  -- Conflicto: nunca se sobrescribe. Si el texto del servidor ya contiene el del dispositivo
  -- (vacío, idéntico o un reintento de una unión ya hecha), no hay nada que unir.
  if is_empty or strpos(cur.body, p_body) > 0 then
    return jsonb_build_object('outcome', 'kept', 'note', to_jsonb(cur));
  end if;

  joined := cur.body || E'\n\n— — —\n\n' || p_body;
  if char_length(joined) > 10000 then
    return jsonb_build_object('outcome', 'too_long', 'note', to_jsonb(cur));
  end if;

  -- La unión deja last_device nulo: si la respuesta no llega al dispositivo y este reintenta con
  -- su versión antigua, el reintento vuelve a ser conflicto (y da kept) en vez de sobrescribirla.
  update public.notes set body = joined, last_device = null
    where user_id = uid and day = p_day
    returning * into cur;
  return jsonb_build_object('outcome', 'merged', 'note', to_jsonb(cur));
end;
$$;

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
        on conflict (user_id, day) do update set body = excluded.body, last_device = null;
        n_notes := n_notes + 1;
      exception when invalid_datetime_format or datetime_field_overflow then
        null;
      end;
    end loop;
  end if;

  return jsonb_build_object('habits', n_habits, 'logs', n_logs, 'tasks', n_tasks, 'notes', n_notes);
end;
$$;

revoke execute on function public.save_note(date, text, timestamptz, uuid) from anon, public;
grant execute on function public.save_note(date, text, timestamptz, uuid) to authenticated;
revoke execute on function public.import_legacy_backup(jsonb) from anon, public;
grant execute on function public.import_legacy_backup(jsonb) to authenticated;
