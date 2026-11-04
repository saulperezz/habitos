// Service worker mínimo de Mis Hábitos.
// Solo muestra el aviso diario del repaso; no guarda nada en caché.
// El texto es fijo y genérico: nunca incluye datos del usuario.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  // event.data puede ser null: el push llega sin contenido.
  event.waitUntil(
    self.registration.showNotification('Mis Hábitos', {
      body: '¿Qué tal hoy? Haz el repaso de tus hábitos',
      tag: 'repaso-diario',
      icon: 'iconos/icono-192.png',
      badge: 'iconos/icono-192.png'
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const ventana of ventanas) {
      if ('focus' in ventana) {
        await ventana.focus();
        ventana.postMessage({ tipo: 'abrir-repaso' });
        return;
      }
    }
    await self.clients.openWindow('./?repaso=1');
  })());
});

// pushsubscriptionchange: no se gestiona aquí porque el service worker no puede leer
// localStorage (hora y zona). La app detecta el endpoint nuevo al abrirse y lo registra.
