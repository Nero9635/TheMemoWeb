// オフラインでも開けるよう、アプリの部品を端末に置いておく。
// ファイルを変えたら VERSION を上げる(古い部品が残らないように)
const VERSION = 'thememo-v4';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/ai.js',
  './js/backup.js',
  './js/db.js',
  './js/detail.js',
  './js/home.js',
  './js/icons.js',
  './js/settings.js',
  './js/store.js',
  './js/ui.js',
  './js/util.js',
  './vendor/preact-htm.js',
  './vendor/jszip.min.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// 自分のファイルは、つながる時は最新を取って端末の分も更新し、圏外の時だけ端末の分を使う。
// AI など外への通信はそのまま
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    try {
      const res = await fetch(e.request, { cache: 'no-cache' });
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    } catch {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      return cached || Response.error();
    }
  }));
});
