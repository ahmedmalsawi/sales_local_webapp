/* Golden Cala Sales Analytics - Service Worker for offline support */
const CACHE_NAME = 'golden-cala-v1';
const LOCAL_URLS = [
  './',
  './index.html',
  './css/styles.css',
  './js/helpers.js',
  './js/db.js',
  './js/auth.js',
  './js/excel.js',
  './js/core.js',
  './js/app.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(LOCAL_URLS)).then(() => self.skipWaiting()).catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((r) => {
      if (r && r.status === 200 && r.url.startsWith('http')) {
        const clone = r.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
      }
      return r;
    }))
  );
});
