import type { ConflictNotice, SaveState } from './use-note-saver';

const STATE_TEXT: Record<SaveState, string> = {
  idle: '',
  saving: 'Guardando…',
  saved: 'Guardado',
  unsaved: 'Sin guardar',
};

/** Indicador discreto del guardado (FR-013). */
export function SaveStatus({ state }: { state: SaveState }) {
  return (
    <span aria-live="polite" className={`text-xs ${state === 'unsaved' ? 'text-warn' : 'text-muted'}`}>
      {STATE_TEXT[state]}
    </span>
  );
}

const NOTICE_TEXT: Record<ConflictNotice, string> = {
  merged: 'Esta nota se cambió en otro dispositivo; se han juntado los dos textos. Revísala.',
  kept: 'La nota cambió en otro dispositivo; se ha conservado esa versión.',
  too_long:
    'La nota cambió en otro dispositivo y juntar los dos textos supera 10.000 caracteres. Recorta el texto para poder guardarlo.',
};

/** Aviso de conflicto entre dispositivos (FR-030). */
export function ConflictMessage({ notice }: { notice: ConflictNotice }) {
  return (
    <p role="status" className={`my-1 rounded-xl px-3 py-2 text-sm ${notice === 'too_long' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-text'}`}>
      {NOTICE_TEXT[notice]}
    </p>
  );
}
