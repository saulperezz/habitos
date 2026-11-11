'use client';
import { useState, useTransition } from 'react';
import { importBackupAction } from '@/features/profile/actions';
import type { ImportResult } from '@/features/profile/import';

type Message = { ok: boolean; lines: string[] };

function summary(r: ImportResult): string[] {
  const toReview = r.notes_merged + r.notes_too_long;
  const added = r.habits + r.logs + r.tasks + r.notes + r.reviews;
  if (added === 0 && toReview === 0) return ['No había nada nuevo que añadir.'];
  const lines = [
    `Importado ✓ ${r.habits} hábitos, ${r.logs} días cumplidos, ${r.tasks} tareas, ${r.notes} notas y ${r.reviews} repasos.`,
  ];
  if (toReview > 0) lines.push(`${toReview} notas tenían otro texto: revísalas en el Diario.`);
  return lines;
}

export function ImportBackup() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Message | null>(null);

  return (
    <section className="card space-y-3">
      <p className="label">Traer datos</p>
      <p className="text-sm text-muted">
        Elige un archivo <code>mis-habitos-….json</code> exportado aquí o desde la app original. Se añadirá a lo que ya
        tengas sin duplicar nada.
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
              setMsg(r.ok ? { ok: true, lines: summary(r.data) } : { ok: false, lines: [r.error] });
            });
          }}
        />
      </label>
      {msg && (
        <div className={msg.ok ? 'space-y-1 text-sm text-accent' : 'error'} role="status">
          {msg.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}
    </section>
  );
}
