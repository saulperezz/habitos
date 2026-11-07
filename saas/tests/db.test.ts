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
