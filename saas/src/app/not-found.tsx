import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">Página no encontrada</h1>
      <Link href="/" className="btn-primary">Ir al inicio</Link>
    </main>
  );
}
