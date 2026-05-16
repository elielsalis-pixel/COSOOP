const CACHE_NAME = 'cosoop-v31';

const ASSETS_CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
];

const ASSETS_LOCAL = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css',
  './css/login.css',
  './css/menu.css',
  './css/dcpd.css',
  './css/config.css',
  './css/tasas_view.css',
  './css/be.css',
  './css/bp.css',
  './css/pdf_viewer.css',
  './css/sim_view.css',
  './css/pex.css',
  './css/pf.css',
  './css/pda_bp.css',
  './css/pda_be.css',
  './js/app.js',
  './js/auth.js',
  './js/menu.js',
  './js/tasas.js',
  './js/dcpd.js',
  './js/config.js',
  './js/tasas_view.js',
  './js/be.js',
  './js/bp.js',
  './js/pdf_viewer.js',
  './js/sim_view.js',
  './js/pex.js',
  './js/pf.js',
  './js/pda_bp.js',
  './js/pda_be.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache =>
        Promise.all([
          ...ASSETS_LOCAL.map(url =>
            cache.add(url).catch(err => console.warn('[SW] No se pudo cachear:', url, err))
          ),
          ...ASSETS_CDN.map(url =>
            cache.add(url).catch(err => console.warn('[SW] No se pudo cachear CDN:', url, err))
          ),
        ])
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' })))
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  /* CDN — cache-first (URLs con versión, no cambian) */
  if (url.origin !== self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
    return;
  }

  /* Archivos locales — network-first (siempre sirve la versión más nueva) */
  e.respondWith(
    fetch(e.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      })
      .catch(() =>
        caches.match(e.request).then(cached => {
          if (cached) return cached;
          if (e.request.mode === 'navigate') return caches.match('./index.html');
        })
      )
  );
});
