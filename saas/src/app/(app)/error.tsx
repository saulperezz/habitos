'use client';

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card space-y-3 text-center">
      <p className="font-semibold">Algo ha fallado al cargar esta pantalla.</p>
      <button type="button" className="btn-primary" onClick={reset}>Reintentar</button>
    </div>
  );
}
