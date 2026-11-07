import type { Metadata } from 'next';
import { requireSession } from '@/lib/server/session';
import { signOutAction } from '@/features/profile/actions';
import { ProfileForm } from './profile-form';
import { ImportBackup } from './import-backup';
import { DeleteAccount } from './delete-account';

export const metadata: Metadata = { title: 'Ajustes' };

export default async function SettingsPage() {
  const { user, profile } = await requireSession();
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
      <ImportBackup />
      <DeleteAccount />
    </div>
  );
}
