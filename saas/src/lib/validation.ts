import { z } from 'zod';
import { isValidDay, isValidTime, isValidTimeZone } from '@/lib/dates';

const trimmed = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label}: obligatorio`).max(max, `${label}: máximo ${max} caracteres`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const dayParam = z.string().refine(isValidDay, 'Fecha inválida (AAAA-MM-DD)');
export const timeParam = z.string().refine(isValidTime, 'Hora inválida (HH:MM)');
export const uuidParam = z.uuid('Identificador inválido');

const emptyToNull = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? null : v), schema.nullable().optional());

export const habitCreate = z.object({
  name: trimmed(1, 40, 'Nombre'),
  description: optionalText(120),
});

export const habitUpdate = z
  .object({
    name: trimmed(1, 40, 'Nombre').optional(),
    description: optionalText(120),
    position: z.number().int().min(0).max(10_000).optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada que actualizar');

export const habitReorder = z.object({ ids: z.array(uuidParam).min(1).max(100) });

export const taskCreate = z
  .object({
    title: trimmed(1, 80, 'Título'),
    note: optionalText(200),
    dueDate: emptyToNull(dayParam),
    dueTime: emptyToNull(timeParam),
  })
  .refine((v) => !v.dueTime || v.dueDate, { message: 'La hora necesita una fecha', path: ['dueTime'] });

export const taskUpdate = z
  .object({
    title: trimmed(1, 80, 'Título').optional(),
    note: optionalText(200),
    dueDate: emptyToNull(dayParam),
    dueTime: emptyToNull(timeParam),
    done: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada que actualizar');

export const taskListQuery = z.object({
  status: z.enum(['pending', 'done']).default('pending'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
});

export const noteUpsert = z.object({ body: z.string().max(10_000, 'Máximo 10.000 caracteres') });

/** Guardado con detección de conflictos: versión de la nota que tenía el dispositivo y su id. */
export const noteSave = noteUpsert.extend({
  baseUpdatedAt: z.iso.datetime({ offset: true, message: 'Versión inválida' }).nullable().optional(),
  deviceId: z.uuid('Dispositivo inválido').optional(),
});

export const profileUpdate = z
  .object({
    displayName: optionalText(60),
    timezone: z.string().max(64).refine(isValidTimeZone, 'Zona horaria desconocida').optional(),
    reviewTime: timeParam.optional(),
    reviewEnabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada que actualizar');

export const rangeQuery = z
  .object({ from: dayParam, to: dayParam })
  .refine((v) => v.from <= v.to, 'from debe ser ≤ to')
  .refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 <= 400, 'Rango máximo: 400 días');

export const reviewAnswer = z.object({
  day: dayParam,
  habitId: uuidParam,
  answer: z.enum(['yes', 'no', 'skip']),
});

/** Copia `mis-habitos-*.json` de la app original. La validación fina la hace la RPC en SQL. */
export const legacyBackup = z.object({
  app: z.literal('mis-habitos', { error: 'Este archivo no es una copia de Mis Hábitos.' }),
  version: z.number().int().max(2, 'La copia es de una versión más nueva.'),
  datos: z.object({
    habits: z.array(z.unknown()).max(500),
    habitos_tareas: z.array(z.unknown()).max(20_000).optional(),
    habitos_notas: z.record(z.string(), z.unknown()).optional(),
  }).passthrough(),
}).passthrough();

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Datos inválidos';
}
