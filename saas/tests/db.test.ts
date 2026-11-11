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

/** Copia de la app original (sin `uuid`), con datos válidos e inválidos. */
const LEGACY_BACKUP = {
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

describe('import_legacy_backup', () => {
  const backup = LEGACY_BACKUP;

  it('importa hábitos, historial, tareas y notas ignorando lo inválido', async () => {
    const result = await as(BOB, () => db.query<{ r: Record<string, number> }>(
      'select public.import_legacy_backup($1::jsonb) as r', [JSON.stringify(backup)]));
    expect(result.rows[0]!.r).toEqual({ habits: 2, logs: 2, tasks: 2, notes: 1, notes_merged: 0, notes_too_long: 0, reviews: 0 });

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

  it('la importación une la nota y borra la marca de dispositivo', async () => {
    await save('2026-10-08', 'de X', null, DEV_X);
    const backup = { app: 'mis-habitos', datos: { habits: [], habitos_notas: { '2026-10-08': { texto: 'importada' } } } };
    const imp = await as(ALICE, () => db.query<{ r: Record<string, number> }>(
      'select public.import_legacy_backup($1::jsonb) as r', [JSON.stringify(backup)]));
    expect(imp.rows[0]!.r).toMatchObject({ habits: 0, logs: 0, tasks: 0, notes: 0, notes_merged: 1 });
    expect(await row('2026-10-08')).toEqual({ body: `de X${SEP}importada`, last_device: null });
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

// ---------------------------------------------------------------------------------------------
// Copia de seguridad (003): exportar, reimportar sin duplicar e ida y vuelta entre cuentas.
// Usuarios propios para no depender de lo que han dejado las pruebas anteriores.
// ---------------------------------------------------------------------------------------------

const ANA = '00000000-0000-4000-8000-0000000000a1'; // cuenta con datos (la «ALICE» de las tareas)
const BEA = '00000000-0000-4000-8000-0000000000b1'; // otra cuenta para comprobar RLS
const CAROL = '00000000-0000-4000-8000-0000000000c1'; // cuenta vacía para la ida y vuelta
const DAVE = '00000000-0000-4000-8000-0000000000d4'; // usuario B de la prueba entre cuentas
const EVA = '00000000-0000-4000-8000-0000000000e1'; // copia de la app original importada dos veces
const FRAN = '00000000-0000-4000-8000-0000000000f1'; // nombres, uuid inválido y configuración
const GIL = '00000000-0000-4000-8000-0000000000f2'; // límite de hábitos

const SEPARATOR = '\n\n— — —\n\n';
const STRANGER = '00000000-0000-4000-8000-00000000ffff';

type CopyHabit = {
  id: number;
  uuid: string;
  name: string;
  description: string;
  history: Record<string, boolean>;
  position: number;
  archivadoEn?: string;
};
type CopyTask = {
  id: number;
  uuid: string;
  titulo: string;
  nota: string;
  fecha: string | null;
  hora: string | null;
  hecha: boolean;
  hechaEn: number | null;
  creadaEn: number;
};
type CopyReview = { fecha: string; respuestas: Record<string, string>; completado: boolean; completadoEn: string | null };
type Backup = {
  app: string;
  version: number;
  exportado: string;
  datos: {
    habits: CopyHabit[];
    habitos_archivados: CopyHabit[];
    habitos_tareas: CopyTask[];
    habitos_notas: Record<string, { texto: string; editado: string }>;
    habitos_repaso: (Omit<CopyReview, 'completadoEn'> & { version: number; avisoCanceladoEnviado: boolean }) | null;
    repasos: CopyReview[];
    habitos_config: { repasoActivo: boolean; hora: string };
  };
};
type Counts = {
  habits: number;
  logs: number;
  tasks: number;
  notes: number;
  notes_merged: number;
  notes_too_long: number;
  reviews: number;
};
const ZERO: Counts = { habits: 0, logs: 0, tasks: 0, notes: 0, notes_merged: 0, notes_too_long: 0, reviews: 0 };

const exportAs = (uid: string) =>
  as(uid, async () => (await db.query<{ r: Backup }>('select public.export_backup() as r')).rows[0]!.r);
const importAs = (uid: string, backup: unknown) =>
  as(uid, async () =>
    (await db.query<{ r: Counts }>('select public.import_legacy_backup($1::jsonb) as r', [JSON.stringify(backup)])).rows[0]!.r);
async function sql<T = Record<string, unknown>>(uid: string, text: string, params: unknown[] = []): Promise<T[]> {
  return as(uid, async () => (await db.query<T>(text, params)).rows);
}
const count = async (uid: string, table: string) =>
  (await sql<{ c: number }>(uid, `select count(*)::int as c from public.${table}`))[0]!.c;

/** Contenido comparable de una cuenta, sin identificadores (tiempos truncados a milisegundos). */
async function snapshot(uid: string) {
  const ms = (col: string) => `floor(extract(epoch from ${col}) * 1000)::bigint`;
  return {
    habits: await sql(uid, `
      select name, coalesce(description, '') as description, archived_at is not null as archived,
             case when archived_at is null
                  then row_number() over (partition by archived_at is null order by position, created_at)
                  else position end as pos,
             ${ms('archived_at')} as archived_ms
        from public.habits order by archived, pos, name`),
    logs: await sql(uid, `
      select h.name, l.day::text as day from public.habit_logs l join public.habits h on h.id = l.habit_id
       order by 1, 2`),
    tasks: await sql(uid, `
      select title, note, due_date::text as due_date, to_char(due_time, 'HH24:MI') as due_time,
             ${ms('done_at')} as done_ms, ${ms('created_at')} as created_ms
        from public.tasks order by created_ms, title`),
    notes: await sql(uid, 'select day::text as day, body from public.notes order by day'),
    reviews: await sql(uid, `
      select r.day::text as day, ${ms('r.completed_at')} as completed_ms,
             (select coalesce(jsonb_object_agg(h.name, a.value), '{}'::jsonb)
                from jsonb_each(r.answers) a join public.habits h on h.id::text = a.key) as answers
        from public.review_sessions r order by r.day`),
    profile: await sql(uid, `select review_enabled, to_char(review_time, 'HH24:MI') as review_time from public.profiles`),
  };
}

async function seedBackupUsers() {
  await db.query(
    `insert into auth.users (id, email) values ($1, 'ana@x'), ($2, 'bea@x'), ($3, 'carol@x'), ($4, 'dave@x'),
       ($5, 'eva@x'), ($6, 'fran@x'), ($7, 'gil@x')`,
    [ANA, BEA, CAROL, DAVE, EVA, FRAN, GIL],
  );
  await as(ANA, async () => {
    const habit = async (name: string, position: number, description: string | null = null, archivedAt: string | null = null) =>
      (await db.query<{ id: string }>(
        'insert into public.habits (name, position, description, archived_at) values ($1, $2, $3, $4) returning id',
        [name, position, description, archivedAt])).rows[0]!.id;
    const leer = await habit('Leer', 0);
    const correr = await habit('Correr', 5, '5 km');
    const meditar = await habit('Meditar', 9);
    const piano = await habit('Piano', 2, 'escalas', '2026-09-01T10:00:00.123456Z');
    const logs: [string, string][] = [
      [leer, '2026-11-01'], [leer, '2026-11-02'], [correr, '2026-11-01'], [meditar, '2026-11-03'], [piano, '2026-08-30'],
    ];
    for (const [id, day] of logs) {
      await db.query('insert into public.habit_logs (habit_id, day) values ($1, $2)', [id, day]);
    }
    await db.query(`insert into public.tasks (title, note, due_date, due_time, done_at, created_at) values
      ('Comprar pan', 'integral', '2026-11-12', '09:30', null, '2026-11-01T08:00:00.123456Z'),
      ('Llamar', null, '2026-11-02', null, '2026-11-02T10:00:00.500789Z', '2026-11-01T09:00:00Z'),
      ('Algún día', null, null, null, null, '2026-11-01T10:00:00.999999Z')`);
    await db.query(`insert into public.notes (day, body) values ('2026-11-01', 'Día bueno'), ('2026-11-02', 'Otro día')`);
    await db.query(
      `insert into public.review_sessions (day, answers, completed_at) values
        ('2026-11-01', jsonb_build_object($1::text, 'yes', $2::text, 'no', $3::text, 'yes'), '2026-11-01T22:05:00Z'),
        ('2026-11-02', jsonb_build_object($1::text, 'yes'), null)`,
      [leer, correr, STRANGER]);
    await db.query(`update public.profiles set review_enabled = false, review_time = '21:30'`);
  });
}

describe('export_backup', () => {
  beforeAll(seedBackupUsers);

  it('exporta todos los datos con el formato de la app original', async () => {
    const b = await exportAs(ANA);
    expect(b.app).toBe('mis-habitos');
    expect(b.version).toBe(2);
    expect(Number.isNaN(Date.parse(b.exportado))).toBe(false);

    const d = b.datos;
    expect(d.habits.map((h) => [h.name, h.position, h.description])).toEqual([
      ['Leer', 0, ''], ['Correr', 1, '5 km'], ['Meditar', 2, ''],
    ]);
    expect(d.habitos_archivados).toHaveLength(1);
    expect(d.habitos_archivados[0]).toMatchObject({ name: 'Piano', description: 'escalas', position: 2, history: { '2026-08-30': true } });
    expect(Date.parse(d.habitos_archivados[0]!.archivadoEn!)).toBe(Date.parse('2026-09-01T10:00:00.123Z'));

    const allHabits = [...d.habits, ...d.habitos_archivados];
    expect(new Set(allHabits.map((h) => h.id)).size).toBe(4);
    expect(allHabits.every((h) => Number.isSafeInteger(h.id))).toBe(true);
    const realHabits = await sql<{ id: string; name: string }>(ANA, 'select id, name from public.habits');
    for (const h of allHabits) expect(realHabits.find((r) => r.id === h.uuid)?.name).toBe(h.name);
    expect(d.habits[0]!.history).toEqual({ '2026-11-01': true, '2026-11-02': true });

    const tasks = Object.fromEntries(d.habitos_tareas.map((t) => [t.titulo, t]));
    expect(new Set(d.habitos_tareas.map((t) => t.id)).size).toBe(3);
    expect(tasks['Comprar pan']).toMatchObject({
      nota: 'integral', fecha: '2026-11-12', hora: '09:30', hecha: false, hechaEn: null,
      creadaEn: Date.parse('2026-11-01T08:00:00.123Z'),
    });
    expect(tasks['Llamar']).toMatchObject({ nota: '', fecha: '2026-11-02', hora: null, hecha: true, hechaEn: Date.parse('2026-11-02T10:00:00.500Z') });
    expect(tasks['Algún día']).toMatchObject({ fecha: null, hora: null, creadaEn: Date.parse('2026-11-01T10:00:00.999Z') });
    const realTasks = await sql<{ id: string }>(ANA, 'select id from public.tasks');
    expect(d.habitos_tareas.map((t) => t.uuid).sort()).toEqual(realTasks.map((t) => t.id).sort());

    expect(Object.keys(d.habitos_notas).sort()).toEqual(['2026-11-01', '2026-11-02']);
    expect(d.habitos_notas['2026-11-01']!.texto).toBe('Día bueno');
    expect(Number.isNaN(Date.parse(d.habitos_notas['2026-11-01']!.editado))).toBe(false);

    const leerId = String(d.habits[0]!.id);
    const correrId = String(d.habits[1]!.id);
    expect(d.repasos).toHaveLength(2);
    expect(d.repasos[0]).toEqual({
      fecha: '2026-11-01', respuestas: { [leerId]: 'si', [correrId]: 'no' }, completado: true, completadoEn: expect.any(String),
    });
    expect(Date.parse(d.repasos[0]!.completadoEn!)).toBe(Date.parse('2026-11-01T22:05:00Z'));
    expect(d.repasos[1]).toEqual({ fecha: '2026-11-02', respuestas: { [leerId]: 'si' }, completado: false, completadoEn: null });
    expect(d.habitos_repaso).toEqual({
      version: 1, fecha: '2026-11-02', respuestas: { [leerId]: 'si' }, completado: false, avisoCanceladoEnviado: false,
    });
    expect(JSON.stringify(b)).not.toContain(STRANGER);

    expect(d.habitos_config).toEqual({ repasoActivo: false, hora: '21:30' });
  });

  it('la copia pasa la validación de la app original', async () => {
    const b = await exportAs(ANA);
    // Mismas comprobaciones que validarCopia() de index.html.
    expect(b.app === 'mis-habitos' && typeof b.version === 'number' && b.version <= 2).toBe(true);
    expect(Array.isArray(b.datos.habits) && Array.isArray(b.datos.habitos_tareas)).toBe(true);
    expect(b.datos.habits.every((h) => typeof h.name === 'string' && typeof h.history === 'object' && h.history !== null)).toBe(true);
    expect(b.datos.habitos_tareas.every((t) => typeof t.titulo === 'string')).toBe(true);
    // Los id se usan sin comillas en los onclick de la app original.
    expect([...b.datos.habits, ...b.datos.habitos_tareas].every((x) => Number.isSafeInteger(x.id))).toBe(true);
    expect(b.datos.habits.some((h) => h.name === 'Piano')).toBe(false);
    expect(b.datos.habitos_config.hora).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
  });

  it('una cuenta sin datos exporta listas vacías y su configuración', async () => {
    const b = await exportAs(BEA);
    expect(b.datos).toEqual({
      habits: [], habitos_archivados: [], habitos_tareas: [], habitos_notas: {},
      habitos_repaso: null, repasos: [], habitos_config: { repasoActivo: true, hora: '22:00' },
    });
  });

  it('respeta RLS y no la pueden ejecutar los anónimos', async () => {
    expect(JSON.stringify(await exportAs(BEA))).not.toContain('Leer');
    await expect(as(null, () => db.query('select public.export_backup()'))).rejects.toThrow(/permission denied/);
  });

  it('mark_backup_exported usa el reloj de Postgres y solo toca el propio perfil', async () => {
    const before = (await db.query<{ t: string }>('select clock_timestamp()::text as t')).rows[0]!.t;
    await as(ANA, () => db.query('select public.mark_backup_exported()'));
    const after = (await db.query<{ t: string }>('select clock_timestamp()::text as t')).rows[0]!.t;
    const r = await db.query<{ ok: boolean }>(
      'select last_exported_at between $1::timestamptz and $2::timestamptz as ok from public.profiles where id = $3',
      [before, after, ANA]);
    expect(r.rows).toEqual([{ ok: true }]);
    const bea = await db.query('select last_exported_at from public.profiles where id = $1', [BEA]);
    expect(bea.rows).toEqual([{ last_exported_at: null }]);
    await expect(as(null, () => db.query('select public.mark_backup_exported()'))).rejects.toThrow(/permission denied/);
  });
});

describe('copia: ida y vuelta', () => {
  let copy: Backup;

  beforeAll(async () => {
    copy = await exportAs(ANA);
  });

  it('exportar → importar en un usuario nuevo deja los mismos datos', async () => {
    const r = await importAs(CAROL, copy);
    expect(r).toEqual({ habits: 4, logs: 5, tasks: 3, notes: 2, notes_merged: 0, notes_too_long: 0, reviews: 2 });
    expect(await snapshot(CAROL)).toEqual(await snapshot(ANA));
    expect(await sql(CAROL, 'select last_device from public.notes where last_device is not null')).toEqual([]);
  });

  it('importar dos veces la propia copia no duplica nada', async () => {
    const before = await snapshot(ANA);
    expect(await importAs(ANA, copy)).toEqual(ZERO);
    expect(await importAs(ANA, copy)).toEqual(ZERO);
    expect(await snapshot(ANA)).toEqual(before);
  });

  it('exportar en A → importar en B dos veces: sin errores ni duplicados', async () => {
    const anaBefore = await snapshot(ANA);
    expect(await importAs(DAVE, copy)).toMatchObject({ habits: 4, tasks: 3, notes: 2, reviews: 2 });
    const uuids = new Set(
      [...copy.datos.habits, ...copy.datos.habitos_archivados, ...copy.datos.habitos_tareas].map((x) => x.uuid),
    );
    const daveIds = [
      ...(await sql<{ id: string }>(DAVE, 'select id from public.habits')),
      ...(await sql<{ id: string }>(DAVE, 'select id from public.tasks')),
    ];
    expect(daveIds).toHaveLength(7);
    expect(daveIds.some((x) => uuids.has(x.id))).toBe(false);
    expect(await snapshot(ANA)).toEqual(anaBefore);
    expect(await importAs(DAVE, copy)).toEqual(ZERO);
    expect(await count(DAVE, 'habits')).toBe(4);
    expect(await count(DAVE, 'tasks')).toBe(3);
  });

  it('una copia de la app original importada dos veces no duplica nada', async () => {
    expect(await importAs(EVA, LEGACY_BACKUP)).toMatchObject({ habits: 2, logs: 2, tasks: 2, notes: 1 });
    expect(await importAs(EVA, LEGACY_BACKUP)).toEqual(ZERO);
    expect(await count(EVA, 'habits')).toBe(2);
    expect(await count(EVA, 'tasks')).toBe(2);
  });

  it('une una nota con otro texto y no la vuelve a unir', async () => {
    await sql(ANA, `update public.notes set body = 'Cambiado' where day = '2026-11-01'`);
    expect(await importAs(ANA, copy)).toEqual({ ...ZERO, notes_merged: 1 });
    expect(await sql(ANA, `select body, last_device from public.notes where day = '2026-11-01'`))
      .toEqual([{ body: `Cambiado${SEPARATOR}Día bueno`, last_device: null }]);
    expect(await importAs(ANA, copy)).toEqual(ZERO);
  });

  it('no une si el resultado supera 10 000 caracteres', async () => {
    const long = 'z'.repeat(9995);
    await sql(ANA, `update public.notes set body = $1 where day = '2026-11-02'`, [long]);
    expect(await importAs(ANA, copy)).toEqual({ ...ZERO, notes_too_long: 1 });
    expect(await sql(ANA, `select body from public.notes where day = '2026-11-02'`)).toEqual([{ body: long }]);
    await sql(ANA, `update public.notes set body = 'Otro día' where day = '2026-11-02'`);
  });

  it('reconoce por uuid un hábito renombrado o archivado después de exportar', async () => {
    const archivedAt = '2026-11-05T12:00:00.000Z';
    await sql(ANA, `update public.habits set name = 'Lectura' where name = 'Leer'`);
    await sql(ANA, `update public.habits set archived_at = $1 where name = 'Meditar'`, [archivedAt]);
    await sql(ANA, `delete from public.habit_logs l using public.habits h where h.id = l.habit_id and h.name = 'Meditar'`);

    expect(await importAs(ANA, copy)).toEqual({ ...ZERO, logs: 1 });
    expect(await sql(ANA, `select name from public.habits where name in ('Leer', 'Lectura')`)).toEqual([{ name: 'Lectura' }]);
    const meditar = await sql(ANA, `
      select h.archived_at = $1::timestamptz as archived,
             (select count(*)::int from public.habit_logs l where l.habit_id = h.id) as logs
        from public.habits h where h.name = 'Meditar'`, [archivedAt]);
    expect(meditar).toEqual([{ archived: true, logs: 1 }]);
    expect(await count(ANA, 'habits')).toBe(4);
  });

  it('reconoce por nombre sin distinguir mayúsculas ni espacios y trata un uuid inválido como ausente', async () => {
    await sql(FRAN, `insert into public.habits (name) values ('leer ')`);
    const legacy = { app: 'mis-habitos', version: 2, datos: { habits: [{ id: 1, name: 'Leer', history: { '2026-11-01': true } }] } };
    expect(await importAs(FRAN, legacy)).toEqual({ ...ZERO, logs: 1 });
    const bad = { app: 'mis-habitos', version: 2, datos: { habits: [{ id: 1, uuid: 'no-es-uuid', name: 'Nuevo' }] } };
    expect(await importAs(FRAN, bad)).toEqual({ ...ZERO, habits: 1 });
    expect(await count(FRAN, 'habits')).toBe(2);
  });

  it('rechaza una copia de una versión más nueva', async () => {
    await expect(importAs(FRAN, { app: 'mis-habitos', version: 3, datos: { habits: [] } })).rejects.toThrow(/invalid_backup/);
  });

  it('si se supera el límite de hábitos no importa nada', async () => {
    await as(GIL, async () => {
      for (let i = 0; i < 99; i++) await db.query('insert into public.habits (name) values ($1)', [`h${i}`]);
    });
    const big = {
      app: 'mis-habitos',
      version: 2,
      datos: {
        habits: [{ id: 1, name: 'Nuevo 1', history: { '2026-11-01': true } }, { id: 2, name: 'Nuevo 2' }],
        habitos_tareas: [{ id: 1, titulo: 'Tarea', creadaEn: 1761990000000 }],
      },
    };
    await expect(importAs(GIL, big)).rejects.toThrow(/limit_exceeded/);
    expect(await count(GIL, 'habits')).toBe(99);
    expect(await count(GIL, 'habit_logs')).toBe(0);
    expect(await count(GIL, 'tasks')).toBe(0);
  });

  it('aplica la configuración del repaso e ignora una hora inválida', async () => {
    const cfg = (repasoActivo: boolean, hora: string) =>
      ({ app: 'mis-habitos', version: 2, datos: { habits: [], habitos_config: { repasoActivo, hora } } });
    const read = () => sql(FRAN, `select review_enabled, to_char(review_time, 'HH24:MI') as t from public.profiles`);
    await importAs(FRAN, cfg(false, '07:15'));
    expect(await read()).toEqual([{ review_enabled: false, t: '07:15' }]);
    await importAs(FRAN, cfg(true, '25:00'));
    expect(await read()).toEqual([{ review_enabled: true, t: '07:15' }]);
  });
});
