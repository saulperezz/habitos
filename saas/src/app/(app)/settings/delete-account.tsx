'use client';
import { useState, useTransition } from 'react';
import { deleteAccountAction } from '@/features/profile/actions';

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="card space-y-3">
      <p className="label">Zona peligrosa</p>
      {!open ? (
        <button type="button" className="btn-danger" onClick={() => setOpen(true)}>Borrar mi cuenta</button>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await deleteAccountAction(confirmation);
              if (r && !r.ok) setError(r.error);
            });
          }}
        >
          <p className="text-sm">Se borrarán tu cuenta, hábitos, historial, tareas y notas. No se puede deshacer. Escribe <strong>BORRAR</strong> para confirmar.</p>
          <input className="input" aria-label="Confirmación" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" />
          {error && <p className="error" role="alert">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-danger" disabled={pending || confirmation !== 'BORRAR'}>Borrar definitivamente</button>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
          </div>
        </form>
      )}
    </section>
  );
}
