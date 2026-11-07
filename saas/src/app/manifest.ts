import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Habitos',
    short_name: 'Habitos',
    description: 'Hábitos, tareas y diario sincronizados.',
    start_url: '/today',
    display: 'standalone',
    background_color: '#f6f5f1',
    theme_color: '#2f7d5b',
    lang: 'es',
    icons: [
      { src: '/icons/icono-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icono-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
