'use client';
import { useState } from 'react';
import { markBackupExportedAction } from '@/features/profile/actions';
import { saveNoteAction } from '@/features/notes/actions';
import { clearPendingIfUnchanged, getDeviceId, listPending } from '@/features/notes/pending-store';

type Props = {
  userId: string;
  /** Tamaño máximo importable (llega del servidor para no importar la validación en el cliente). */
  maxBytes: number;
  lastExportedAt: string | null;
  showReminder: boolean;
  timezone: string;
};

type Message = { ok: boolean; lines: string[] };

const FALLBACK_NAME = 'mis-habitos.json';

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Envía al servidor las notas que siguen pendientes en este dispositivo para que entren en la copia.
 * Devuelve `true` si alguna no se ha podido enviar (sin conexión o error); en ese caso se queda en el
 * dispositivo como siempre y la exportación continúa sin ella.
 */
async function flushPendingNotes(userId: string): Promise<boolean> {
  let left = false;
  for (const [day, note] of Object.entries(listPending(userId))) {
    try {
      const r = await saveNoteAction(day, note.body, note.base, getDeviceId());
      if (r.ok && r.data.outcome !== 'too_long') clearPendingIfUnchanged(userId, day, note.body);
      else left = true;
    } catch {
      left = true;
    }
  }
  return left;
}

function fileNameFrom(res: Response): string {
  const match = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '');
  return match?.[1] ?? FALLBACK_NAME;
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ExportBackup({ userId, maxBytes, lastExportedAt, showReminder, timezone }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Message | null>(null);

  const lastDate = lastExportedAt
    ? new Date(lastExportedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: timezone })
    : null;

  async function exportBackup() {
    setBusy(true);
    setMsg(null);
    try {
      const notesLeft = await flushPendingNotes(userId);

      const res = await fetch('/api/v1/export', { cache: 'no-store' });
      if (!res.ok) throw new Error(`export ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], fileNameFrom(res), { type: 'application/json' });

      if (isIOS() && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Copia de Mis Hábitos' });
        } catch (err) {
          // El usuario ha cerrado la hoja de compartir: ni error ni fecha nueva.
          if (err instanceof DOMException && err.name === 'AbortError') return;
          throw err;
        }
      } else {
        download(file);
      }

      await markBackupExportedAction();
      const lines = ['Copia exportada ✓ Guárdala en un lugar seguro (Archivos, iCloud…).'];
      if (blob.size > maxBytes) lines.push('La copia es muy grande y no podrá volver a importarse aquí.');
      if (notesLeft) lines.push('Hay notas sin guardar en este dispositivo; no están en la copia.');
      setMsg({ ok: true, lines });
    } catch {
      setMsg({ ok: false, lines: ['No se pudo exportar la copia. Inténtalo de nuevo.'] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3">
      <p className="label">Copia de seguridad</p>
      <p className="text-sm text-muted">
        {lastDate ? `Última copia: ${lastDate}` : 'Aún no has hecho ninguna copia'}
      </p>
      {showReminder && (
        <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-text">
          {lastDate
            ? 'Hace más de un mes de tu última copia. Te recomendamos hacer una nueva.'
            : 'Te recomendamos hacer una copia de tus datos.'}
        </p>
      )}
      <button type="button" className="btn-primary w-full" disabled={busy} onClick={exportBackup}>
        {busy ? 'Exportando…' : 'Exportar copia de seguridad'}
      </button>
      {msg &&
        (msg.ok ? (
          <div role="status" className="space-y-1 text-sm">
            {msg.lines.map((line, i) => (
              <p key={line} className={i === 0 ? 'text-accent' : 'text-warn'}>
                {line}
              </p>
            ))}
          </div>
        ) : (
          <p role="alert" className="error">
            {msg.lines[0]}
          </p>
        ))}
    </section>
  );
}
