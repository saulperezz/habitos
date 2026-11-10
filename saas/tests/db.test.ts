/**
 * Prueba la migración real contra Postgres (PGlite, en memoria) con un stub mínimo de Supabase
 * (esquema auth, auth.uid() y roles). Verifica restricciones, RLS entre usuarios e importación.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ALICE = '00000000-0000-4000-8000-00000000000a';
const BOB = '00000000-0000-4000-8000-00000000000b';

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

let db: PGlite;

async function as<T>(uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${uid ? 'authenticated' : 'anon'}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const dir = join(__dirname, '..', 'supabase', 'migrations');
  for (const file of readdirSync(dir).sort()) {
    await db.exec(readFileSync(join(dir, file), 'utf8'));
  }
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values
    ($1, 'alice@example.com', '{"timezone":"America/Mexico_City"}'),
    ($2, 'bob@example.com', '{"timezone":"No/Existe"}')`, [ALICE, BOB]);
});

afterAll(async () => {
  await db?.close();
});

describe('perfiles', () => {
  it('se crean al registrarse, con zona horaria válida o la de por defecto', async () => {
    const { rows } = await db.query<{ id: string; timezone: string }>(
      'select id, timezone from public.profiles order by id');
    expect(rows).toEqual([
      { id: ALICE, timezone: 'America/Mexico_City' },
      { id: BOB, timezone: 'Europe/Madrid' },
    ]);
  });

  it('rechaza zonas horarias inválidas', async () => {
    await expect(as(ALICE, () => db.query(
      `update public.profiles set timezone = 'Marte/Olympus' where id = $1`, [ALICE])))
      .rejects.toThrow(/check constraint/);
  });
});

describe('RLS', () => {
  it('cada usuario solo ve y modifica lo suyo', async () => {
    const habitId = await as(ALICE, async () => {
      const r = await db.query<{ id: string }>(
        `insert into public.habits (name) values ('Leer') returning id`);
      return r.rows[0]!.id;
    });

    const bobSees = await as(BOB, () => db.query('select * from public.habits'));
    expect(bobSees.rows).toHaveLength(0);

    const bobUpdate = await as(BOB, () => db.query(
      `update public.habits set name = 'hackeado' where id = $1`, [habitId]));
    expect(bobUpdate.affectedRows).toBe(0);

    // Bob no puede crear filas a nombre de Alice…
    await expect(as(BOB, () => db.query(
      `insert into public.habits (user_id, name) values ($1, 'x')`, [ALICE])))
      .rejects.toThrow(/row-level security/);
    // …ni marcar el hábito de Alice como suyo (FK compuesta hábito+usuario).
    await expect(as(BOB, () => db.query(
      `insert into public.habit_logs (habit_id, day) values ($1, '2026-11-07')`, [habitId])))
      .rejects.toThrow();

    const aliceLog = await as(ALICE, () => db.query(
      `insert into public.habit_logs (habit_id, day) values ($1, '2026-11-07') returning user_id`, [habitId]));
    expect(aliceLog.rows).toEqual([{ user_id: ALICE }]);
  });

  it('los anónimos no leen nada', async () => {
    await expect(as(null, () => db.query('select * from public.habits'))).rejects.toThrow(/permission denied/);
  });
});

describe('restricciones', () => {
  it('valida longitudes y coherencia de tareas', async () => {
    await expect(as(ALICE, () => db.query(`insert into public.habits (name) values ('   ')`)))
      .rejects.toThrow(/check constraint/);
    await expect(as(ALICE, () => db.query(
      `insert into public.tasks (title, due_time) values ('Sin fecha', '10:00')`)))
      .rejects.toThrow(/tasks_time_needs_date/);
  });

  it('limita el número de hábitos por usuario', async () => {
    await as(BOB, async () => {
      for (let i = 0; i < 100; i++) await db.query(`insert into public.habits (name) values ($1)`, [`h${i}`]);
      await expect(db.query(`insert into public.habits (name) values ('101')`)).rejects.toThrow(/limit_exceeded/);
      await db.query('delete from public.habits');
    });
  });
});

describe('import_legacy_backup', () => {
  const backup = {
    app: 'mis-habitos',
    version: 2,
    exportado: '2026-11-01T10:00:00.000Z',
    datos: {
      habits: [
        { id: 1, name: 'Meditar', description: '10 min', history: { '2026-10-30': true, '2026-10-31': true, '2026-02-31': true, basura: true } },
        { id: 2, name: '  ', history: {} },
        { id: 3, name: 'Correr' },
      ],
      habitos_tareas: [
        { id: 1, titulo: 'Comprar pan', nota: '', fecha: '2026-11-02', hora: '09:30', hecha: false, creadaEn: 1761990000000 },
        { id: 2, titulo: 'Llamar', fecha: null, hora: '10:00', hecha: true, creadaEn: 1761990000000, hechaEn: 1761993600000 },
        { id: 3, titulo: '' },
      ],
      habitos_notas: { '2026-10-31': { texto: 'Buen día', editado: null }, mal: { texto: 'x' } },
    },
  };

  it('importa hábitos, historial, tareas y notas ignorando lo inválido', async () => {
    const result = await as(BOB, () => db.query<{ r: Record<string, number> }>(
      'select public.import_legacy_backup($1::jsonb) as r', [JSON.stringify(backup)]));
    expect(result.rows[0]!.r).toEqual({ habits: 2, logs: 2, tasks: 2, notes: 1 });

    const tasks = await as(BOB, () => db.query<{ title: string; due_time: string | null; done: boolean }>(
      'select title, due_time, done_at is not null as done from public.tasks order by title'));
    expect(tasks.rows).toEqual([
      { title: 'Comprar pan', due_time: '09:30:00', done: false },
      { title: 'Llamar', due_time: null, done: true },
    ]);
  });

  it('rechaza archivos que no son copias', async () => {
    await expect(as(BOB, () => db.query('select public.import_legacy_backup($1::jsonb)', ['{"app":"otra"}'])))
      .rejects.toThrow(/invalid_backup/);
  });
});

describe('delete_account', () => {
  it('borra el usuario y todos sus datos en cascada', async () => {
    await as(BOB, () => db.query('select public.delete_account()'));
    const users = await db.query('select id from auth.users');
    expect(users.rows).toEqual([{ id: ALICE }]);
    const left = await db.query(`select count(*)::int as c from public.tasks where user_id = $1`, [BOB]);
    expect(left.rows).toEqual([{ c: 0 }]);
  });
});

describe('record_review_answer', () => {
  it('marca el hábito y fusiona respuestas de forma atómica', async () => {
    const r = await as(ALICE, async () => {
      const h = await db.query<{ id: string }>(`insert into public.habits (name) values ('Agua') returning id`);
      const id = h.rows[0]!.id;
      await db.query(`select public.record_review_answer('2026-11-06', $1, 'yes')`, [id]);
      const other = await db.query<{ id: string }>(`insert into public.habits (name) values ('Dormir') returning id`);
      await db.query(`select public.record_review_answer('2026-11-06', $1, 'no')`, [other.rows[0]!.id]);
      const logs = await db.query(`select 1 from public.habit_logs where habit_id = $1 and day = '2026-11-06'`, [id]);
      const s = await db.query<{ answers: Record<string, string> }>(`select answers from public.review_sessions where day = '2026-11-06'`);
      return { logs: logs.rows.length, answers: Object.values(s.rows[0]!.answers).sort() };
    });
    expect(r).toEqual({ logs: 1, answers: ['no', 'yes'] });
  });
});

describe('save_note', () => {
  const DEV_X = '00000000-0000-4000-8000-0000000000d1';
  const DEV_Y = '00000000-0000-4000-8000-0000000000d2';
  const OLD = '2000-01-01T00:00:00+00:00';
  const SEP = '\n\n— — —\n\n';
  type Saved = { outcome: string; note: { body: string; updated_at: string; last_device: string | null } | null };

  const save = (day: string, body: string, base: string | null, device: string | null) =>
    as(ALICE, async () => {
      const r = await db.query<{ r: Saved }>(
        'select public.save_note($1::date, $2, $3::timestamptz, $4::uuid) as r', [day, body, base, device]);
      return r.rows[0]!.r;
    });
  const row = (day: string) =>
    as(ALICE, async () => {
      const r = await db.query<{ body: string; last_device: string | null }>(
        'select body, last_device from public.notes where day = $1', [day]);
      return r.rows[0] ?? null;
    });

  it('inserta, actualiza y borra sin conflicto', async () => {
    const a = await save('2026-10-01', 'Hola', null, DEV_X);
    expect(a.outcome).toBe('saved');
    expect(a.note).toMatchObject({ body: 'Hola', last_device: DEV_X });

    const b = await save('2026-10-01', 'Hola mundo', a.note!.updated_at, DEV_Y);
    expect(b.outcome).toBe('saved');
    expect(await row('2026-10-01')).toEqual({ body: 'Hola mundo', last_device: DEV_Y });

    const c = await save('2026-10-01', '  \n ', b.note!.updated_at, DEV_Y);
    expect(c).toEqual({ outcome: 'deleted', note: null });
    expect(await row('2026-10-01')).toBeNull();

    expect(await save('2026-10-01', '', null, DEV_Y)).toEqual({ outcome: 'deleted', note: null });
  });

  it('el mismo dispositivo con base antigua no es conflicto', async () => {
    await save('2026-10-02', 'uno', null, DEV_X);
    const r = await save('2026-10-02', 'uno dos', OLD, DEV_X);
    expect(r.outcome).toBe('saved');
    expect((await row('2026-10-02'))!.body).toBe('uno dos');
  });

  it('une los textos si cambió en otro dispositivo', async () => {
    await save('2026-10-03', 'B', null, DEV_Y);
    const r = await save('2026-10-03', 'A', OLD, DEV_X);
    expect(r.outcome).toBe('merged');
    expect(await row('2026-10-03')).toEqual({ body: `B${SEP}A`, last_device: null });
  });

  it('un reintento de la misma unión no la sobrescribe ni la duplica', async () => {
    // X une su texto, pero la respuesta se pierde y X reintenta con su versión antigua.
    await save('2026-10-10', 'B', null, DEV_Y);
    expect((await save('2026-10-10', 'A', OLD, DEV_X)).outcome).toBe('merged');
    const retry = await save('2026-10-10', 'A', OLD, DEV_X);
    expect(retry.outcome).toBe('kept');
    expect((await row('2026-10-10'))!.body).toBe(`B${SEP}A`);
    // Con la versión nueva, X sigue escribiendo con normalidad.
    const next = await save('2026-10-10', `B${SEP}A y más`, retry.note!.updated_at, DEV_X);
    expect(next.outcome).toBe('saved');
  });

  it('conserva la versión del servidor si el texto es vacío o idéntico', async () => {
    await save('2026-10-04', 'B', null, DEV_Y);
    expect((await save('2026-10-04', '', OLD, DEV_X)).outcome).toBe('kept');
    expect((await save('2026-10-04', 'B', OLD, DEV_X)).outcome).toBe('kept');
    expect(await row('2026-10-04')).toEqual({ body: 'B', last_device: DEV_Y });
  });

  it('no escribe si la unión supera 10 000 caracteres', async () => {
    await save('2026-10-05', 'x'.repeat(6000), null, DEV_Y);
    const r = await save('2026-10-05', 'y'.repeat(6000), OLD, DEV_X);
    expect(r.outcome).toBe('too_long');
    expect((await row('2026-10-05'))!.body).toBe('x'.repeat(6000));
  });

  it('sin dispositivo deja last_device nulo y siempre detecta conflicto', async () => {
    const a = await save('2026-10-06', 'api', null, null);
    expect(a.note!.last_device).toBeNull();
    expect((await save('2026-10-06', 'otra api', OLD, null)).outcome).toBe('merged');
  });

  it('una escritura directa (saveNote) borra la marca de dispositivo', async () => {
    await save('2026-10-07', 'de X', null, DEV_X);
    await as(ALICE, () => db.query(
      `insert into public.notes (day, body, last_device) values ('2026-10-07', 'externa', null)
       on conflict (user_id, day) do update set body = excluded.body, last_device = null`));
    expect(await row('2026-10-07')).toEqual({ body: 'externa', last_device: null });
    const r = await save('2026-10-07', 'reintento de X', OLD, DEV_X);
    expect(r.outcome).toBe('merged');
  });

  it('la importación borra la marca de dispositivo al sobrescribir', async () => {
    await save('2026-10-08', 'de X', null, DEV_X);
    const backup = { app: 'mis-habitos', datos: { habits: [], habitos_notas: { '2026-10-08': { texto: 'importada' } } } };
    const imp = await as(ALICE, () => db.query<{ r: Record<string, number> }>(
      'select public.import_legacy_backup($1::jsonb) as r', [JSON.stringify(backup)]));
    expect(imp.rows[0]!.r).toEqual({ habits: 0, logs: 0, tasks: 0, notes: 1 });
    expect(await row('2026-10-08')).toEqual({ body: 'importada', last_device: null });
    expect((await save('2026-10-08', 'reintento de X', OLD, DEV_X)).outcome).toBe('merged');
  });

  it('respeta RLS y no la pueden ejecutar los anónimos', async () => {
    await save('2026-10-09', 'privada', null, DEV_X);
    const otherId = '00000000-0000-4000-8000-00000000000c';
    await db.query(`insert into auth.users (id, email) values ($1, 'carol@example.com')`, [otherId]);
    const r = await as(otherId, () => db.query<{ r: Saved }>(
      `select public.save_note('2026-10-09', 'mía', null, null) as r`));
    expect(r.rows[0]!.r.outcome).toBe('saved');
    expect((await row('2026-10-09'))!.body).toBe('privada');
    await expect(as(null, () => db.query(`select public.save_note('2026-10-09', 'x', null, null)`)))
      .rejects.toThrow(/permission denied/);
  });
});
