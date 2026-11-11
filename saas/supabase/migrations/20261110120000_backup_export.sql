-- Copia de seguridad exportable e importación sin duplicados (feature 003).
--
-- · profiles.last_exported_at: fecha de la última copia exportada con éxito. Solo la escribe
--   mark_backup_exported() con el reloj de Postgres; la importación no la cambia.
-- · export_backup(): devuelve la copia completa del usuario con el formato de la app original
--   (app, version 2, exportado, datos.habits/habitos_tareas/habitos_notas/habitos_repaso/
--   habitos_config) más campos extra que esa app ignora: uuid, habitos_archivados y repasos.
--   Los id de la copia son enteros (la app original los usa sin comillas en sus onclick).
--   Los tiempos se exportan truncados a milisegundos.
-- · mark_backup_exported(): pone last_exported_at = now() en el perfil del usuario.
-- · import_legacy_backup(): redefinida. Reconoce lo que ya existe (hábitos por uuid o por nombre
--   normalizado, tareas por uuid o por título + creadaEn), une notas con otro texto en lugar de
--   sobrescribirlas, restaura archivados, repasos y configuración del repaso, y devuelve solo lo
--   que de verdad añade. Todo o nada: cualquier error aborta la importación entera.
--   El uuid de la copia solo sirve para buscar; las filas nuevas siempre usan gen_random_uuid().

alter table public.profiles add column last_exported_at timestamptz;

-- ---------------------------------------------------------------------------------------------
-- Exportar
-- ---------------------------------------------------------------------------------------------

create or replace function public.export_backup()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  idmap jsonb;      -- habits.id (texto) → id entero de la copia
  habits jsonb;
  archived jsonb;
  tasks jsonb;
  notes jsonb;
  reviews jsonb;
  latest jsonb;
  config jsonb;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Activos primero (por posición) y después los archivados, con una sola numeración.
  select coalesce(jsonb_object_agg(id::text, n), '{}'::jsonb) into idmap
    from (
      select id, row_number() over (order by archived_at is not null, position, created_at, id) as n
        from public.habits where user_id = uid
    ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', (idmap ->> h.id::text)::bigint,
           'uuid', h.id,
           'name', h.name,
           'description', coalesce(h.description, ''),
           'history', (select coalesce(jsonb_object_agg(to_char(l.day, 'YYYY-MM-DD'), true), '{}'::jsonb)
                         from public.habit_logs l where l.habit_id = h.id),
           'position', h.pos
         ) order by h.pos), '[]'::jsonb)
    into habits
    from (
      select x.*, row_number() over (order by x.position, x.created_at, x.id) - 1 as pos
        from public.habits x where x.user_id = uid and x.archived_at is null
    ) h;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', (idmap ->> h.id::text)::bigint,
           'uuid', h.id,
           'name', h.name,
           'description', coalesce(h.description, ''),
           'history', (select coalesce(jsonb_object_agg(to_char(l.day, 'YYYY-MM-DD'), true), '{}'::jsonb)
                         from public.habit_logs l where l.habit_id = h.id),
           'position', h.position,
           'archivadoEn', to_jsonb(date_trunc('milliseconds', h.archived_at))
         ) order by (idmap ->> h.id::text)::bigint), '[]'::jsonb)
    into archived
    from public.habits h where h.user_id = uid and h.archived_at is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.n,
           'uuid', t.id,
           'titulo', t.title,
           'nota', coalesce(t.note, ''),
           'fecha', to_char(t.due_date, 'YYYY-MM-DD'),
           'hora', to_char(t.due_time, 'HH24:MI'),
           'hecha', t.done_at is not null,
           'hechaEn', floor(extract(epoch from t.done_at) * 1000)::bigint,
           'creadaEn', floor(extract(epoch from t.created_at) * 1000)::bigint
         ) order by t.n), '[]'::jsonb)
    into tasks
    from (
      select x.*, row_number() over (order by x.created_at, x.id) as n
        from public.tasks x where x.user_id = uid
    ) t;

  select coalesce(jsonb_object_agg(to_char(n.day, 'YYYY-MM-DD'), jsonb_build_object(
           'texto', n.body,
           'editado', to_jsonb(date_trunc('milliseconds', n.updated_at))
         )), '{}'::jsonb)
    into notes
    from public.notes n where n.user_id = uid;

  -- Respuestas con la clave numérica de la copia y los valores de la app original (si/no);
  -- se omiten las que no apuntan a un hábito del usuario.
  select coalesce(jsonb_agg(jsonb_build_object(
           'fecha', to_char(r.day, 'YYYY-MM-DD'),
           'respuestas', (select coalesce(jsonb_object_agg(idmap ->> a.key,
                                    case a.value #>> '{}' when 'yes' then 'si' else 'no' end), '{}'::jsonb)
                            from jsonb_each(r.answers) a
                           where idmap ? a.key and a.value #>> '{}' in ('yes', 'no')),
           'completado', r.completed_at is not null,
           'completadoEn', to_jsonb(date_trunc('milliseconds', r.completed_at))
         ) order by r.day), '[]'::jsonb)
    into reviews
    from public.review_sessions r where r.user_id = uid;

  if jsonb_array_length(reviews) > 0 then
    latest := reviews -> -1;
    latest := jsonb_build_object(
      'version', 1,
      'fecha', latest -> 'fecha',
      'respuestas', latest -> 'respuestas',
      'completado', latest -> 'completado',
      'avisoCanceladoEnviado', false
    );
  end if;

  select jsonb_build_object('repasoActivo', p.review_enabled, 'hora', to_char(p.review_time, 'HH24:MI'))
    into config
    from public.profiles p where p.id = uid;

  return jsonb_build_object(
    'app', 'mis-habitos',
    'version', 2,
    'exportado', to_jsonb(date_trunc('milliseconds', now())),
    'datos', jsonb_build_object(
      'habits', habits,
      'habitos_archivados', archived,
      'habitos_tareas', tasks,
      'habitos_notas', notes,
      'habitos_repaso', coalesce(latest, 'null'::jsonb),
      'repasos', reviews,
      'habitos_config', config
    )
  );
end;
$$;

create or replace function public.mark_backup_exported()
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  update public.profiles set last_exported_at = now() where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------------------------
-- Importar
-- ---------------------------------------------------------------------------------------------

create or replace function public.import_legacy_backup(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  datos jsonb := payload -> 'datos';
  list jsonb;
  is_archived boolean;
  h jsonb;
  t jsonb;
  n record;
  rv jsonb;
  k text;
  habit_name text;
  task_title text;
  note_text text;
  current_body text;
  merged text;
  v_answers jsonb;
  v_done_at timestamptz;
  v_archived_at timestamptz;
  new_id uuid;
  matched_habits uuid[] := '{}';
  matched_tasks uuid[] := '{}';
  habit_map jsonb := '{}'::jsonb;   -- id de la copia (texto) → habits.id
  base_position integer;
  i integer := 0;
  n_habits integer := 0;
  n_logs integer := 0;
  n_tasks integer := 0;
  n_notes integer := 0;
  n_merged integer := 0;
  n_too_long integer := 0;
  n_reviews integer := 0;
  date_re constant text := '^\d{4}-\d{2}-\d{2}$';
  time_re constant text := '^\d{2}:\d{2}$';
  hhmm_re constant text := '^([01]\d|2[0-3]):[0-5]\d$';
  uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  ms_re constant text := '^\d{1,15}(\.\d+)?$';
  separator constant text := E'\n\n— — —\n\n';
  inserted integer;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if payload ->> 'app' is distinct from 'mis-habitos' or jsonb_typeof(datos) is distinct from 'object'
     or jsonb_typeof(datos -> 'habits') is distinct from 'array' then
    raise exception 'invalid_backup' using errcode = '22023';
  end if;
  if payload ? 'version' and (jsonb_typeof(payload -> 'version') <> 'number'
                              or (payload ->> 'version')::numeric > 2) then
    raise exception 'invalid_backup: la copia es de una versión más nueva' using errcode = '22023';
  end if;

  select coalesce(max(position) + 1, 0) into base_position
    from public.habits where user_id = uid and archived_at is null;

  -- Hábitos: primero los activos (habits) y después los archivados (habitos_archivados).
  foreach is_archived in array array[false, true] loop
    list := case when is_archived then datos -> 'habitos_archivados' else datos -> 'habits' end;
    continue when jsonb_typeof(list) is distinct from 'array';

    for h in select * from jsonb_array_elements(list) loop
      continue when jsonb_typeof(h) <> 'object'
        or char_length(btrim(coalesce(h ->> 'name', ''))) = 0;
      habit_name := left(btrim(h ->> 'name'), 40);
      new_id := null;

      -- 1) Por el identificador real de saas/ (solo para buscar, nunca para insertar).
      if coalesce(h ->> 'uuid', '') ~ uuid_re then
        select x.id into new_id from public.habits x
         where x.user_id = uid and x.id = (h ->> 'uuid')::uuid and x.id <> all (matched_habits);
      end if;
      -- 2) Por nombre sin mayúsculas ni espacios sobrantes; primero activos, luego archivados.
      if new_id is null then
        select x.id into new_id from public.habits x
         where x.user_id = uid and lower(btrim(x.name)) = lower(habit_name) and x.id <> all (matched_habits)
         order by x.archived_at is not null, x.position, x.created_at, x.id
         limit 1;
      end if;
      -- 3) Nuevo. Los hábitos reconocidos no se modifican.
      if new_id is null then
        if is_archived then
          begin
            v_archived_at := coalesce((h ->> 'archivadoEn')::timestamptz, now());
          exception when data_exception then
            v_archived_at := now();
          end;
          insert into public.habits (user_id, name, description, position, archived_at)
          values (
            uid,
            habit_name,
            nullif(left(coalesce(h ->> 'description', ''), 120), ''),
            case when h ->> 'position' ~ '^-?\d{1,9}$' then (h ->> 'position')::integer else 0 end,
            v_archived_at
          )
          returning id into new_id;
        else
          insert into public.habits (user_id, name, description, position)
          values (uid, habit_name, nullif(left(coalesce(h ->> 'description', ''), 120), ''), base_position + i)
          returning id into new_id;
          i := i + 1;
        end if;
        n_habits := n_habits + 1;
      end if;

      matched_habits := matched_habits || new_id;
      if h ? 'id' and jsonb_typeof(h -> 'id') in ('number', 'string') then
        habit_map := habit_map || jsonb_build_object(h ->> 'id', new_id::text);
      end if;

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
  end loop;

  -- Tareas: por uuid; si no, por título + momento de creación en milisegundos.
  if jsonb_typeof(datos -> 'habitos_tareas') = 'array' then
    for t in select * from jsonb_array_elements(datos -> 'habitos_tareas') loop
      continue when jsonb_typeof(t) <> 'object'
        or char_length(btrim(coalesce(t ->> 'titulo', ''))) = 0;
      task_title := left(btrim(t ->> 'titulo'), 80);
      new_id := null;

      if coalesce(t ->> 'uuid', '') ~ uuid_re then
        select x.id into new_id from public.tasks x
         where x.user_id = uid and x.id = (t ->> 'uuid')::uuid and x.id <> all (matched_tasks);
      end if;
      if new_id is null and coalesce(t ->> 'creadaEn', '') ~ ms_re then
        select x.id into new_id from public.tasks x
         where x.user_id = uid and x.title = task_title
           and floor(extract(epoch from x.created_at) * 1000)::bigint = floor((t ->> 'creadaEn')::numeric)::bigint
           and x.id <> all (matched_tasks)
         order by x.created_at, x.id
         limit 1;
      end if;
      if new_id is not null then
        matched_tasks := matched_tasks || new_id;
        continue; -- las tareas reconocidas no se modifican
      end if;

      begin
        -- Los milisegundos se convierten con aritmética exacta (sin double precision) para que la
        -- comparación por creadaEn reconozca siempre la tarea al reimportar.
        insert into public.tasks (user_id, title, note, due_date, due_time, done_at, created_at)
        values (
          uid,
          task_title,
          nullif(left(coalesce(t ->> 'nota', ''), 200), ''),
          case when t ->> 'fecha' ~ date_re then (t ->> 'fecha')::date end,
          case when t ->> 'fecha' ~ date_re and t ->> 'hora' ~ time_re then (t ->> 'hora')::time end,
          case when (t ->> 'hecha')::boolean is true then
            coalesce(case when t ->> 'hechaEn' ~ ms_re then
                       'epoch'::timestamptz + floor((t ->> 'hechaEn')::numeric) * interval '1 millisecond' end,
                     now())
          end,
          coalesce(case when t ->> 'creadaEn' ~ ms_re then
                     'epoch'::timestamptz + floor((t ->> 'creadaEn')::numeric) * interval '1 millisecond' end,
                   now())
        )
        returning id into new_id;
        matched_tasks := matched_tasks || new_id;
        n_tasks := n_tasks + 1;
      exception when invalid_datetime_format or datetime_field_overflow
                  or invalid_text_representation or numeric_value_out_of_range then
        null; -- tarea con datos dañados: se omite sin abortar la importación
      end;
    end loop;
  end if;

  -- Notas: se añaden, se dejan si ya contienen el texto o se unen con un separador.
  if jsonb_typeof(datos -> 'habitos_notas') = 'object' then
    for n in select key, value from jsonb_each(datos -> 'habitos_notas') loop
      continue when n.key !~ date_re or jsonb_typeof(n.value) <> 'object'
        or char_length(btrim(coalesce(n.value ->> 'texto', ''))) = 0;
      note_text := left(n.value ->> 'texto', 10000);
      begin
        select x.body into current_body from public.notes x where x.user_id = uid and x.day = n.key::date;
        if not found then
          insert into public.notes (user_id, day, body, last_device) values (uid, n.key::date, note_text, null);
          n_notes := n_notes + 1;
        elsif strpos(current_body, note_text) > 0 then
          null; -- igual o ya contenida (p. ej. unida en una importación anterior)
        else
          merged := current_body || separator || note_text;
          if char_length(merged) <= 10000 then
            update public.notes set body = merged, last_device = null where user_id = uid and day = n.key::date;
            n_merged := n_merged + 1;
          else
            n_too_long := n_too_long + 1;
          end if;
        end if;
      exception when invalid_datetime_format or datetime_field_overflow then
        null;
      end;
    end loop;
  end if;

  -- Repasos: todos los de saas/ o el único de la app original. Nunca se sobrescribe uno existente.
  list := case
    when jsonb_typeof(datos -> 'repasos') = 'array' then datos -> 'repasos'
    when jsonb_typeof(datos -> 'habitos_repaso') = 'object' then jsonb_build_array(datos -> 'habitos_repaso')
    else '[]'::jsonb
  end;
  for rv in select * from jsonb_array_elements(list) loop
    continue when jsonb_typeof(rv) <> 'object' or coalesce(rv ->> 'fecha', '') !~ date_re;
    begin
      select coalesce(jsonb_object_agg(habit_map ->> a.key,
                        case a.value #>> '{}' when 'si' then 'yes' else 'no' end), '{}'::jsonb)
        into v_answers
        from jsonb_each(case when jsonb_typeof(rv -> 'respuestas') = 'object' then rv -> 'respuestas'
                             else '{}'::jsonb end) a
       where habit_map ? a.key and jsonb_typeof(a.value) = 'string' and a.value #>> '{}' in ('si', 'no');

      v_done_at := null;
      if rv -> 'completado' = 'true'::jsonb then
        begin
          v_done_at := (rv ->> 'completadoEn')::timestamptz;
        exception when data_exception then
          v_done_at := null;
        end;
        if v_done_at is null then
          begin
            v_done_at := (payload ->> 'exportado')::timestamptz;
          exception when data_exception then
            v_done_at := null;
          end;
        end if;
        v_done_at := coalesce(v_done_at, now());
      end if;

      insert into public.review_sessions (user_id, day, answers, completed_at)
      values (uid, (rv ->> 'fecha')::date, v_answers, v_done_at)
      on conflict (user_id, day) do nothing;
      get diagnostics inserted = row_count;
      n_reviews := n_reviews + inserted;
    exception when invalid_datetime_format or datetime_field_overflow then
      null;
    end;
  end loop;

  -- Configuración del repaso, como hace la app original al importar.
  if jsonb_typeof(datos -> 'habitos_config') = 'object' then
    if jsonb_typeof(datos -> 'habitos_config' -> 'repasoActivo') = 'boolean' then
      update public.profiles set review_enabled = (datos -> 'habitos_config' ->> 'repasoActivo')::boolean
       where id = uid;
    end if;
    if coalesce(datos -> 'habitos_config' ->> 'hora', '') ~ hhmm_re then
      update public.profiles set review_time = (datos -> 'habitos_config' ->> 'hora')::time where id = uid;
    end if;
  end if;

  return jsonb_build_object(
    'habits', n_habits, 'logs', n_logs, 'tasks', n_tasks, 'notes', n_notes,
    'notes_merged', n_merged, 'notes_too_long', n_too_long, 'reviews', n_reviews
  );
end;
$$;

revoke execute on function public.export_backup() from anon, public;
grant execute on function public.export_backup() to authenticated;
revoke execute on function public.mark_backup_exported() from anon, public;
grant execute on function public.mark_backup_exported() to authenticated;
revoke execute on function public.import_legacy_backup(jsonb) from anon, public;
grant execute on function public.import_legacy_backup(jsonb) to authenticated;
