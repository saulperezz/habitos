import type { Metadata } from 'next';
import { requireSession } from '@/lib/server/session';
import { signOutAction } from '@/features/profile/actions';
import { hasAnyData, needsBackupReminder } from '@/features/profile/queries';
import { BACKUP_MAX_BYTES } from '@/lib/validation';
import { ProfileForm } from './profile-form';
import { ExportBackup } from './export-backup';
import { ImportBackup } from './import-backup';
import { DeleteAccount } from './delete-account';

export const metadata: Metadata = { title: 'Ajustes' };

export default async function SettingsPage() {
  const { db, user, profile } = await requireSession();
  // Solo se cuenta si hay datos cuando nunca se ha exportado, para no consultar de más.
  const hasData = profile.last_exported_at === null ? await hasAnyData(db) : true;
  const showReminder = needsBackupReminder(profile.last_exported_at, hasData, new Date());
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Ajustes</h1>

      <section className="card space-y-1">
        <p className="label">Cuenta</p>
        <p className="font-semibold break-all">{user.email}</p>
        <form action={signOutAction}>
          <button className="btn-ghost mt-2">Cerrar sesión</button>
        </form>
      </section>

      <ProfileForm timezone={profile.timezone} reviewTime={profile.review_time.slice(0, 5)} reviewEnabled={profile.review_enabled} />
      <ExportBackup
        userId={user.id}
        maxBytes={BACKUP_MAX_BYTES}
        lastExportedAt={profile.last_exported_at}
        showReminder={showReminder}
        timezone={profile.timezone}
      />
      <ImportBackup />
      <DeleteAccount />
    </div>
  );
}
