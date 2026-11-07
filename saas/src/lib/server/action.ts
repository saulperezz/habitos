import 'server-only';
import { AppError } from '@/lib/errors';

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/** Convierte excepciones en un resultado serializable que la UI puede mostrar. */
export async function safe<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    // redirect()/notFound() de Next lanzan errores especiales que hay que propagar.
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    if (err instanceof AppError) return { ok: false, error: err.message };
    console.error(JSON.stringify({ level: 'error', msg: 'action_unhandled', error: String(err) }));
    return { ok: false, error: 'Algo ha fallado. Inténtalo de nuevo.' };
  }
}
