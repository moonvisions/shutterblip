/* ShutterBlip service worker.
 *
 * Two jobs, and it deliberately does not try to do more:
 *   1. Make the game installable and playable with no signal (the whole game
 *      is one HTML file, so "offline" costs one cache entry).
 *   2. Never let a cached response stand in for live data. Anything under
 *      /v1/ is network-only: a stale leaderboard or a cached duel result
 *      would be worse than an honest error, and the client already degrades
 *      gracefully when a call fails.
 *
 * Bump CACHE when you deploy a new index.html, or returning players will
 * keep the old one until their browser evicts it.
 */
const CACHE = 'shutterblip-v5';
const SHELL = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', e => {
  // addAll fails the whole install if any single entry 404s, which would
  // leave the app uninstallable; add them individually and tolerate misses.
  e.waitUntil(caches.open(CACHE).then(c =>
    Promise.all(SHELL.map(u => c.add(u).catch(() => {})))
  ).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                      // never cache writes

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;       // leave third parties alone
  if (url.pathname.startsWith('/v1/')) return;           // API: always live

  // Navigations: network first so a deploy is picked up immediately, with
  // the cached shell as the offline fallback.
  if (req.mode === 'navigate'){
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('/index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/index.html').then(r => r || caches.match('/')))
    );
    return;
  }

  // Everything else (icons, manifest): cache first, refresh in the background.
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.status === 200){
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
