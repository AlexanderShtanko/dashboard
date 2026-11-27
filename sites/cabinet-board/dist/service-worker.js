// Offline support for the web version (PWA). Not used by the Chrome extension.
// Same-origin files: served from cache at once and refreshed in the background,
// so a new version appears on the next launch. Google and currency requests are never cached.
const CACHE = 'cabinet-v2';
const SHELL = ['./', './index.html', './style.css', './app.js', './manifest.webmanifest', './icons/icon-192.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const key = request.mode === 'navigate' ? './index.html' : request;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(key, {ignoreSearch: request.mode === 'navigate'});
    const network = fetch(request).then(response => {
      if (response.ok && response.type === 'basic') cache.put(key, response.clone());
      return response;
    });
    if (cached) { event.waitUntil(network.catch(() => {})); return cached; }
    return network;
  }));
});
