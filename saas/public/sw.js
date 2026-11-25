// Service worker de Habitos (spec 004): solo avisos push. Sin caché ni `fetch` (sin modo sin conexión).
// La carga es {"t":"review"} o {"t":"test"}; nunca lleva datos del usuario.

const URL_REPASO = '/review?desde=aviso';
const ICONO = '/icons/icono-192.png';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let tipo = 'review';
  try {
    const datos = event.data ? event.data.json() : null;
    if (datos && datos.t === 'test') tipo = 'test';
  } catch {
    // Carga ausente o ilegible: se muestra el aviso del repaso.
  }
  const opciones =
    tipo === 'test'
      ? { body: 'Los avisos funcionan ✓', tag: 'prueba' }
      : { body: '¿Qué tal hoy? Haz el repaso de tus hábitos', tag: 'repaso-diario', renotify: false };
  // userVisibleOnly: siempre hay que mostrar una notificación.
  event.waitUntil(
    self.registration.showNotification('Habitos', {
      ...opciones,
      icon: ICONO,
      badge: ICONO,
      lang: 'es',
      data: { url: URL_REPASO },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || URL_REPASO;
  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const propia = ventanas.find((v) => new URL(v.url).origin === self.location.origin);
      if (propia) {
        await propia.focus();
        try {
          await propia.navigate(url);
          return;
        } catch {
          // navigate() falla en ventanas no controladas: se abre una nueva.
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
