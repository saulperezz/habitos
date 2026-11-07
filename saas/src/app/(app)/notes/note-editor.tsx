'use client';
import { useRef, useState, useTransition } from 'react';
import { saveNoteAction } from '@/features/notes/actions';

export function NoteEditor({ day, label, initial, isToday, autoFocus }: { day: string; label: string; initial: string; isToday: boolean; autoFocus: boolean }) {
  const [body, setBody] = useState(initial);
  const saved = useRef(initial);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [pending, start] = useTransition();

  const save = () => {
    if (body === saved.current) return;
    const value = body;
    setStatus('saving');
    start(async () => {
      const r = await saveNoteAction(day, value);
      if (r.ok) saved.current = value;
      setStatus(r.ok ? 'saved' : 'error');
    });
  };

  return (
    <div className={`card space-y-2 ${isToday ? 'border-accent' : ''}`}>
      <div className="flex items-center justify-between">
        <label htmlFor={`note-${day}`} className="text-sm font-semibold first-letter:uppercase">
          {label}
          {isToday && <span className="ml-2 text-xs text-accent">Hoy</span>}
        </label>
        <span className={`text-xs ${status === 'error' ? 'text-danger' : 'text-muted'}`} aria-live="polite">
          {status === 'saving' || pending ? 'Guardando…' : status === 'saved' ? 'Guardado ✓' : status === 'error' ? 'No se pudo guardar' : ''}
        </span>
      </div>
      <textarea
        id={`note-${day}`}
        className="input min-h-24 py-2"
        placeholder="¿Qué tal ha ido el día?"
        maxLength={10000}
        value={body}
        autoFocus={autoFocus}
        onChange={(e) => {
          setBody(e.target.value);
          if (status !== 'idle') setStatus('idle');
        }}
        onBlur={save}
      />
    </div>
  );
}
