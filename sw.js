// Service worker de Mis Hábitos.
// 1) Guarda en caché los archivos de la app para que abra sin conexión.
//    Estrategia «red primero»: si hay internet se carga siempre la última versión publicada;
//    si no, se usa la copia guardada. Los datos del usuario (localStorage) nunca pasan por aquí.
// 2) Muestra el aviso diario del repaso. El texto es fijo y genérico: nunca incluye datos del usuario.

const CACHE = 'habitos-v1';
const ARCHIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './iconos/icono-192.png',
  './iconos/icono-512.png',
  './iconos/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll(ARCHIVOS);
    } catch (e) {
      // Sin conexión al instalar: se rellenará la caché en la próxima visita con red.
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter(n => n.startsWith('habitos-') && n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Solo GET del mismo origen; las llamadas al servicio de avisos (otro origen) no se tocan.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const resp = await fetch(req, { cache: 'no-cache' });
      if (resp && resp.ok && resp.type === 'basic') {
        cache.put(req.mode === 'navigate' ? './' : req, resp.clone());
      }
      return resp;
    } catch (e) {
      const guardada = await cache.match(req.mode === 'navigate' ? './' : req, { ignoreSearch: true });
      if (guardada) return guardada;
      if (req.mode === 'navigate') {
        const inicio = await cache.match('./index.html');
        if (inicio) return inicio;
      }
      throw e;
    }
  })());
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
