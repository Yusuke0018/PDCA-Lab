// GitHub Pagesなどサブパス配信でも動くようにベースパス対応
const VERSION = 'v35'; // 2025-08-23-44 更新 (force cache-bust)
const CACHE_NAME = `hypolab-cache-${VERSION}`;

// ベースURL（例: https://example.com/PDCA-Lab/）
const BASE_URL = new URL(self.registration.scope);

// キャッシュしたいコアアセット（相対パスで定義）
const CORE_ASSETS = [
  // HTML
  'hypolab-local.html',
  // CSS
  'css/hypolab-local.css',
  // JS (main + modules)
  'js/hypolab-local.js',
  'js/modules/hypolab-utils.js',
  'js/modules/hypolab-storage.js',
  'js/modules/hypolab-events.js',
  'js/modules/hypolab-points.js',
  'js/modules/hypolab-domain.js',
  'js/modules/hypolab-router.js',
  // Manifest & icons
  'manifest.webmanifest',
  'icons/icon.svg'
];

// 絶対URLに変換
const toAbs = (path) => new URL(path, BASE_URL).toString();

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 個別にキャッシュを追加し、失敗しても継続
      const promises = CORE_ASSETS.map(async (asset) => {
        try {
          await cache.add(toAbs(asset));
        } catch (error) {
          console.warn(`Failed to cache ${asset}:`, error);
        }
      });
      await Promise.all(promises);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
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

self.addEventListener('message', (event) => {
  if (event && event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
