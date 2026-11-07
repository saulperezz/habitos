export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'not_found'
  | 'conflict'
  | 'limit_exceeded'
  | 'rate_limited'
  | 'payload_too_large'
  | 'internal';

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  limit_exceeded: 422,
  payload_too_large: 413,
  rate_limited: 429,
  internal: 500,
};

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
  get status() {
    return STATUS[this.code];
  }
}

/** Traduce errores de PostgREST/Postgres a errores de dominio sin filtrar detalles internos. */
export function fromDbError(err: { code?: string; message?: string } | null): AppError | null {
  if (!err) return null;
  const msg = err.message ?? '';
  if (msg.includes('limit_exceeded')) return new AppError('limit_exceeded', 'Has alcanzado el máximo permitido.');
  if (msg.includes('invalid_backup')) return new AppError('bad_request', 'Este archivo no es una copia válida.');
  switch (err.code) {
    case '23505':
      return new AppError('conflict', 'Ya existe.');
    case '23503':
    case 'PGRST116':
      return new AppError('not_found', 'No encontrado.');
    case '23514':
    case '22P02':
    case '22007':
    case '22008':
      return new AppError('bad_request', 'Datos inválidos.');
    case '42501':
      return new AppError('unauthorized', 'No autorizado.');
    default:
      return new AppError('internal', 'Error interno.');
  }
}

type DbErr = { code?: string; message?: string };

/** Devuelve `data` del caso de éxito o lanza un AppError (supabase-js devuelve una unión éxito | error). */
export function check<R extends { data: unknown; error: DbErr | null }>(result: R): Extract<R, { error: null }>['data'] {
  const e = fromDbError(result.error);
  if (e) {
    if (e.code === 'internal') console.error(JSON.stringify({ level: 'error', msg: 'db_error', error: result.error }));
    throw e;
  }
  return result.data as Extract<R, { error: null }>['data'];
}
