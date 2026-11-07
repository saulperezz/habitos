import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Habitos', template: '%s · Habitos' },
  description: 'Construye hábitos, organiza tus tareas y escribe tu diario. Sincronizado en todos tus dispositivos.',
  applicationName: 'Habitos',
  appleWebApp: { capable: true, title: 'Habitos', statusBarStyle: 'default' },
  icons: { icon: '/icons/icono-192.png', apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f5f1' },
    { media: '(prefers-color-scheme: dark)', color: '#121311' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
