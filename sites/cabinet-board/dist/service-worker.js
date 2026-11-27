// Offline support for the web version (PWA). Not used by the Chrome extension.
// Same-origin files: the network comes first, so a new version shows up on the very next launch;
// the cache is only the fallback when there is no connection (or the network is too slow).
// Google and currency requests are never cached.
const CACHE = 'cabinet-v7';
const SHELL = ['./', './index.html', './style.css', './app.js', './manifest.webmanifest', './icons/icon-192.png'];
const TIMEOUT = 4000;

self.addEventListener('install', event => {
  // 'reload' skips the browser's HTTP cache: GitHub Pages lets it keep files for 10 minutes.
  event.waitUntil(caches.open(CACHE)
    .then(cache => cache.addAll(SHELL.map(url => new Request(url, {cache: 'reload'}))))
    .then(() => self.skipWaiting()));
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
    const network = fetch(request.url, {cache: 'no-cache'}).then(response => {
      if (response.ok && response.type === 'basic') cache.put(key, response.clone());
      return response;
    });
    if (!cached) return network;
    // Slow or missing network: show the saved copy and let the download finish in the background.
    event.waitUntil(network.catch(() => {}));
    return Promise.race([
      network.then(response => response.ok ? response : cached, () => cached),
      new Promise(resolve => setTimeout(() => resolve(cached), TIMEOUT)),
    ]);
  }));
});
