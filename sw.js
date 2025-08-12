const CACHE_NAME = 'hypolab-cache-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/hypolab-local.html',
  '/manifest.webmanifest',
  '/icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle GET
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then((res) => res || fetch(req).then((net) => {
      // Cache best-effort
      const copy = net.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(()=>{});
      return net;
    }).catch(() => caches.match('/hypolab-local.html')))
  );
});

