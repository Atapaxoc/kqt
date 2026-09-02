// sw.js — Service Worker
// Caches the application shell + SheetJS library immediately, and caches
// the Excel data files opportunistically after their first successful
// network fetch (spec section 6). Registration failure (e.g. unsupported
// browser) is handled gracefully by app.js — the app continues without
// offline support in that case.

const CACHE_VERSION = 'ttf-exam-app-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/state.js',
  './js/ui.js',
  './js/quiz.js',
  './js/timer.js',
  './js/excel.js',
  './js/settings.js',
  './js/storage.js',
  './js/utils.js',
  './vendor/xlsx.full.min.js',
];

const DATA_ASSETS = [
  './data/qkumite.xlsx',
  './data/qkata.xlsx',
  './data/mini-affirmations.xlsx',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch((err) => {
        // Do not fail installation hard if one optional asset is missing;
        // the app must still work without full offline caching.
        console.error('[sw] install caching error', err);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isDataAsset = DATA_ASSETS.some((path) => url.pathname.endsWith(path.replace('./', '/')));

  if (isDataAsset) {
    // Network-first for data files so freshly-edited Excel files are picked
    // up when online, but fall back to cache (and populate it) otherwise.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for the app shell / library for fast, offline-capable loads.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => cached);
    })
  );
});
