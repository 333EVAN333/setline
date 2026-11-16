/**
 * sw.js — the service worker: what makes Setline work offline.
 *
 * A service worker is a script the browser runs in the background, separate
 * from the page. It sits between the app and the network and can answer
 * requests itself. Ours:
 *
 *   install  -> download every app file into a cache named after VERSION
 *   activate -> delete caches from older versions
 *   fetch    -> answer from the cache first (instant + offline); if a file
 *               isn't cached yet, fetch it and keep a copy
 *
 * >>> When you change ANY app file and publish, bump VERSION below. <<<
 * The changed sw.js is how the phone notices there's an update; the app then
 * shows a "New version available" bar (see js/app.js).
 *
 * Your workout data is NOT in here — it's in IndexedDB and is never touched
 * by updates.
 */
const VERSION = 'v1';
const CACHE = `setline-${VERSION}`;

// Every file the app needs. If you add a file, add it here too.
const APP_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/backup.js',
  'js/chart.js',
  'js/db.js',
  'js/format.js',
  'js/seed.js',
  'js/sets.js',
  'js/stats.js',
  'js/store.js',
  'js/ui.js',
  'js/units.js',
  'js/workout.js',
  'js/views/bodyweight.js',
  'js/views/exercise-detail.js',
  'js/views/exercises.js',
  'js/views/history.js',
  'js/views/home.js',
  'js/views/routines.js',
  'js/views/settings.js',
  'js/views/workout.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the browser's HTTP cache so we store fresh copies.
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_FILES.map((f) => new Request(f, { cache: 'reload' })))),
  );
  // Note: no skipWaiting() here. The new version waits until you tap "Reload"
  // so it can't swap files underneath you mid-workout.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('setline-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page sends this when you tap "Reload" on the update bar.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Page loads (e.g. opening the app) always get the cached index.html.
    const key = req.mode === 'navigate' ? 'index.html' : req;
    const cached = await cache.match(key, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      return new Response('Offline and not cached', { status: 503, statusText: 'Offline' });
    }
  })());
});
