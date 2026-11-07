'use client';
import { useState, useTransition } from 'react';
import { importBackupAction } from '@/features/profile/actions';

export function ImportBackup() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <section className="card space-y-3">
      <p className="label">Traer datos de la app anterior</p>
      <p className="text-sm text-muted">
        En la app original ve a Ajustes › Copia de seguridad › Exportar y elige aquí el archivo <code>mis-habitos-….json</code>.
        Se añadirá a lo que ya tengas.
      </p>
      <label className={`btn-ghost w-full cursor-pointer ${pending ? 'opacity-50' : ''}`}>
        {pending ? 'Importando…' : 'Elegir archivo'}
        <input
          type="file"
          accept="application/json,.json"
          className="sr-only"
          disabled={pending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setMsg(null);
            start(async () => {
              const r = await importBackupAction(await file.text());
              setMsg(
                r.ok
                  ? { ok: true, text: `Importado ✓ ${r.data.habits} hábitos, ${r.data.logs} días cumplidos, ${r.data.tasks} tareas y ${r.data.notes} notas.` }
                  : { ok: false, text: r.error },
              );
            });
          }}
        />
      </label>
      {msg && <p className={msg.ok ? 'text-sm text-accent' : 'error'} role="status">{msg.text}</p>}
    </section>
  );
}
