import { route } from '@/lib/server/api';
import { todayIn } from '@/lib/dates';
import { backupFileName, exportBackup, getProfile } from '@/features/profile/queries';

/**
 * Descarga la copia de seguridad completa del usuario como `mis-habitos-AAAA-MM-DD.json` (día de
 * hoy en su zona horaria). No cambia la fecha de la última copia: eso lo hace la UI solo cuando el
 * archivo se ha guardado o compartido.
 */
export const GET = route(
  async ({ db }) => {
    const profile = await getProfile(db);
    const name = backupFileName(todayIn(profile.timezone));
    return new Response(JSON.stringify(await exportBackup(db)), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'no-store',
      },
    });
  },
  { limit: 5 },
);
