// Service Worker SIP-FNC (skill fnc-pwa-webpush): push + cache-first de
// estáticos. Nunca intercepta /api/* (siempre red).
const STATIC_CACHE = 'fnc-static-v1';

self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  var title = data.title || 'SIP-FNC';
  var options = {
    body: data.body || '',
    icon: '/icons/app-icon-192.png',
    badge: '/icons/app-icon-192.png',
    data: { url: data.url || '/dashboard' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
  try {
    if ('setAppBadge' in self.navigator && self.navigator.setAppBadge) {
      event.waitUntil(self.navigator.setAppBadge(1).catch(function () {}));
    }
  } catch (e) { /* badge opcional */ }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  try {
    if ('clearAppBadge' in self.navigator && self.navigator.clearAppBadge) {
      event.waitUntil(self.navigator.clearAppBadge().catch(function () {}));
    }
  } catch (e) { /* noop */ }
  var url = (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf(url) !== -1 && 'focus' in list[i]) return list[i].focus();
    }
    if (clients.openWindow) return clients.openWindow(url);
    return null;
  }));
});

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(STATIC_CACHE).then(function (cache) {
    return cache.addAll(['/icons/app-icon-192.png', '/icons/app-icon-512.png']).catch(function () {});
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.indexOf('/api/') === 0) return;
  if (url.origin !== location.origin) return;
  event.respondWith(caches.match(event.request).then(function (hit) {
    if (hit) return hit;
    return fetch(event.request).then(function (res) {
      var copy = res.clone();
      caches.open(STATIC_CACHE).then(function (cache) { cache.put(event.request, copy); }).catch(function () {});
      return res;
    });
  }));
});
