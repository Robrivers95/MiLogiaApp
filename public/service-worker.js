const CACHE_NAME = 'mi-logia-v3.6.1';
const urlsToCache = ['/', '/index.html', '/manifest.json', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)).catch(err => console.log('Cache install error:', err)));
  self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then(response => {
    const responseToCache = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache)).catch(err => console.log('Cache put error:', err));
    return response;
  }).catch(() => caches.match(event.request)));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.map(name => name !== CACHE_NAME ? caches.delete(name) : undefined))));
  return self.clients.claim();
});

self.addEventListener('push', event => {
  let notificationData = { title: 'Mi Logia', body: 'Nueva notificación', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: {} };
  if (event.data) {
    try {
      const payload = event.data.json();
      notificationData = {
        title: payload.notification?.title || payload.title || notificationData.title,
        body: payload.notification?.body || payload.body || notificationData.body,
        icon: payload.notification?.icon || payload.icon || notificationData.icon,
        badge: payload.notification?.badge || notificationData.badge,
        data: payload.data || {},
      };
    } catch (_) {
      notificationData.body = event.data.text();
    }
  }
  event.waitUntil(self.registration.showNotification(notificationData.title, {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    vibrate: [200, 100, 200],
    data: notificationData.data,
    actions: [{ action: 'open', title: 'Abrir' }, { action: 'close', title: 'Cerrar' }],
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'close') return;

  const notifData = event.notification.data || {};
  const view = notifData.view || 'home';
  const targetUrl = `/?view=${encodeURIComponent(view)}`;

  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
    for (const client of clientList) {
      if (client.url.includes(self.location.origin) && 'focus' in client) {
        client.postMessage({ type: 'NAVIGATE', view });
        return client.focus();
      }
    }
    return self.clients.openWindow ? self.clients.openWindow(targetUrl) : undefined;
  }));
});
