/* Offline-capable service worker: precaches the app shell and every asset index.html references,
   then serves cache-first and refreshes entries in the background. Bump VERSION to invalidate. */
const VERSION = 'v2';
const CACHE = `starship-survivor-${VERSION}`;
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      try {
        const html = await (await fetch('./index.html', { cache: 'reload' })).text();
        const urls = new Set();
        const re = /(?:src|href)="([^"]+\.(?:js|css|png|webp|json|mp3|ogg))"/g;
        let m;
        while ((m = re.exec(html)) !== null) {
          const url = new URL(m[1], self.registration.scope);
          if (url.origin === self.location.origin) {
            urls.add(url.href);
          }
        }
        await Promise.all([...urls].map((u) => cache.add(u).catch(() => undefined)));
      } catch {
        // Offline during install: the runtime cache fills on first use.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('starship-survivor-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return;
  }
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => undefined);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      const res = await network;
      if (res) {
        return res;
      }
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html');
        if (shell) {
          return shell;
        }
      }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    })(),
  );
});
