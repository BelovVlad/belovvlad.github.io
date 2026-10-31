// Lets the hub open without the internet. The hub lives at the root of the domain, so this
// worker's scope covers it all, but it answers only for the hub's own files: requests of the
// other sites (/NSU_FP_Y4_S1/, /Department/, /diploma/ — those with their own, more specific
// workers or none) are left to the browser untouched.
const CACHE = 'pweb-hub-v7';
const SHELL = ['', 'index.html', 'styles.css', 'app.js', 'model.js', 'config.js', 'icons.js', 'site-search.js', 'hero.js', 'dots.js', 'install.js', 'manifest.webmanifest',
  'assets/logo.svg', 'assets/logo-launch.svg', 'assets/favicon-16.png', 'assets/favicon-32.png', 'assets/app-192.png', 'assets/app-512.png', 'assets/app-maskable-512.png', 'assets/apple-touch-icon.png', 'assets/fonts/roboto-condensed-cyrillic-wght-normal.woff2', 'assets/fonts/roboto-condensed-latin-wght-normal.woff2',
  'assets/fonts/roboto-condensed-latin-ext-wght-normal.woff2'];
const root = new URL('./', self.location);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(path => new URL(path, root).href))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('pweb-hub-') && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== root.origin) return;
  const path = url.pathname.slice(root.pathname.length);
  if (!SHELL.includes(path)) return;
  const key = new URL(path, root).href;
  // Network first, so the hub is always current online; the copy is for when there is no connection.
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(key, copy))); }
    return response;
  }).catch(() => caches.match(key).then(response => response || Response.error())));
});
