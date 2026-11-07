'use client';
import { useState, useTransition } from 'react';
import { updateProfileAction } from '@/features/profile/actions';

export function ProfileForm(props: { timezone: string; reviewTime: string; reviewEnabled: boolean }) {
  const [timezone, setTimezone] = useState(props.timezone);
  const [reviewTime, setReviewTime] = useState(props.reviewTime);
  const [reviewEnabled, setReviewEnabled] = useState(props.reviewEnabled);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [props.timezone];

  return (
    <form
      className="card space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateProfileAction({ timezone, reviewTime, reviewEnabled });
          setMsg(r.ok ? { ok: true, text: 'Guardado ✓' } : { ok: false, text: r.error });
        });
      }}
    >
      <p className="label">Repaso diario</p>
      <label className="flex min-h-11 items-center justify-between gap-3">
        <span>Proponer el repaso cada día</span>
        <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={reviewEnabled} onChange={(e) => setReviewEnabled(e.target.checked)} />
      </label>
      <div>
        <label className="label" htmlFor="review-time">A partir de las</label>
        <input id="review-time" type="time" className="input" required value={reviewTime} onChange={(e) => setReviewTime(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="tz">Zona horaria</label>
        <select id="tz" className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {(zones.includes(timezone) ? zones : [timezone, ...zones]).map((z) => (
            <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>Guardar</button>
        {msg && <span className={`text-sm ${msg.ok ? 'text-accent' : 'text-danger'}`} role="status">{msg.text}</span>}
      </div>
    </form>
  );
}
