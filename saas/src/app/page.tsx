import Link from 'next/link';

export default async function Landing({ searchParams }: { searchParams: Promise<{ cuenta?: string }> }) {
  const { cuenta } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-8 px-4 py-16 pt-safe">
      {cuenta === 'borrada' && <p className="card text-sm">Tu cuenta y todos tus datos se han borrado.</p>}
      <div className="space-y-4">
        <p className="text-sm font-semibold tracking-widest text-accent uppercase">Habitos</p>
        <h1 className="text-4xl leading-tight font-bold tracking-tight">Pequeños hábitos, cada día.</h1>
        <p className="text-lg text-muted">
          Marca tus hábitos en un toque, haz un repaso rápido cada noche, organiza tus tareas y escribe tu diario.
          Todo sincronizado en el móvil y el ordenador.
        </p>
      </div>
      <ul className="grid gap-3 text-sm">
        {[
          ['✓', 'Repaso diario', 'Una pregunta por hábito: sí, no o saltar. Menos de 30 segundos.'],
          ['▦', 'Calendario', 'Tu historial, tus tareas y tus notas en una sola vista.'],
          ['↻', 'Siempre sincronizado', 'Tus datos en la nube, protegidos y solo para ti.'],
        ].map(([icon, title, text]) => (
          <li key={title} className="card flex gap-3">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
              {icon}
            </span>
            <span>
              <strong className="block">{title}</strong>
              <span className="text-muted">{text}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/login?mode=signup" className="btn-primary flex-1">
          Crear cuenta gratis
        </Link>
        <Link href="/login" className="btn-ghost flex-1">
          Ya tengo cuenta
        </Link>
      </div>
    </main>
  );
}
