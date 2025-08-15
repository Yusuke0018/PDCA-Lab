// GitHub Pagesなどサブパス配信でも動くようにベースパス対応
const VERSION = 'v5';
const CACHE_NAME = `hypolab-cache-${VERSION}`;

// ベースURL（例: https://example.com/PDCA-Lab/）
const BASE_URL = new URL(self.registration.scope);

// キャッシュしたいコアアセット（相対パスで定義）
const CORE_ASSETS = [
  // HTML
  'index.html',
  'hypolab-local.html',
  'hypolab.html',
  // CSS
  'css/hypolab-local.css',
  'css/hypolab.css',
  // JS (main + modules)
  'js/hypolab-local.js',
  'js/hypolab.js',
  'js/modules/hypolab-utils.js',
  'js/modules/hypolab-storage.js',
  'js/modules/hypolab-events.js',
  'js/modules/hypolab-points.js',
  // Manifest & icons
  'manifest.webmanifest',
  'icons/icon.svg'
];

// 絶対URLに変換
const toAbs = (path) => new URL(path, BASE_URL).toString();

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS.map(toAbs)))
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
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === BASE_URL.origin;

  // ナビゲーションはネット優先 + オフラインフォールバック
  if (req.mode === 'navigate' && sameOrigin) {
    event.respondWith(
      fetch(req).catch(() => caches.match(toAbs('hypolab-local.html')))
    );
    return;
  }

  // それ以外はキャッシュ優先のstale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchAndCache = fetch(req)
        .then((net) => {
          const copy = net.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          return net;
        })
        .catch(() => cached);
      return cached || fetchAndCache;
    })
  );
});
