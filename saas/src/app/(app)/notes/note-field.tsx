'use client';
import { useEffect, useLayoutEffect, useRef } from 'react';

/** Alto que deja libre la pantalla bajo la cabecera y sobre la barra inferior (FR-006). */
const FILL_MIN_HEIGHT =
  'calc(100dvh - var(--cabecera-h) - var(--barra-h) - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 3rem)';

/** Campo del diario: crece con el texto, sin desplazamiento interno ni recuadro (FR-007). */
export function NoteField({
  value,
  onChange,
  label,
  fill = false,
  placeholder,
  boxed = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  fill?: boolean;
  placeholder?: string;
  boxed?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(resize, [value]);
  useEffect(() => {
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  return (
    <textarea
      ref={ref}
      data-diario-campo
      rows={1}
      maxLength={10000}
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={fill ? { minHeight: FILL_MIN_HEIGHT } : undefined}
      className={`block w-full resize-none overflow-hidden text-base leading-relaxed text-text outline-none placeholder:text-muted ${
        boxed ? 'rounded-xl bg-surface px-3 py-2' : 'bg-transparent py-1'
      }`}
    />
  );
}
