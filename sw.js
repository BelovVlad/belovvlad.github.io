// Lets the hub open without the internet. The hub lives at the root of the domain, so this
// worker's scope covers it all, but it answers only for the hub's own files: requests of the
// other sites (/NSU_FP_Y4_S1/, /Department/, /diploma/ — those with their own, more specific
// workers or none) are left to the browser untouched.
const CACHE = 'pweb-hub-v22';
const SHELL = ['', 'index.html', 'styles.css', 'app.js', 'model.js', 'config.js', 'icons.js', 'site-search.js', 'hero.js', 'dots.js', 'install.js', 'manifest.webmanifest',
  'assets/logo.svg', 'assets/logo-launch.svg', 'assets/favicon-16.png', 'assets/favicon-32.png', 'assets/app-192.png', 'assets/app-512.png', 'assets/app-maskable-512.png', 'assets/apple-touch-icon.png', 'assets/fonts/roboto-condensed-cyrillic-wght-normal.woff2', 'assets/fonts/roboto-condensed-latin-wght-normal.woff2',
  'assets/fonts/roboto-condensed-latin-ext-wght-normal.woff2'];
const root = new URL('./', self.location);
const WAIT = 250, STALL = 15000;

// Cache only application shell assets. Never cache PDFs, API requests, user files,
// or anything from a different origin. This worker controls all hyle.space paths,
// so it can speed up Helper and Department as well as the home page.
function isShellPath(path) {
  if (SHELL.includes(path)) return true;
  if (/^search\/.*\.(?:js|mjs|css|svg|png|woff2|html)$/.test(path)) return true;
  const site = /^(Helper_PF_NSU|Department)\/(.*)$/.exec(path);
  if (!site) return false;
  const resource = site[2];
  return resource === '' || resource === 'index.html' ||
    resource === 'materials.json' ||
    /^(?:assets|viewer)\/.*\.(?:js|mjs|css|html|woff2|svg|png|json)$/.test(resource);
}
let stalledUntil = 0;
// The response if the network answers within WAIT ms, else the copy. A timeout marks the connection
// as stalled for STALL ms, so the hub's other files do not each wait WAIT ms of their own.
const firstOf = (network, cached) => new Promise(resolve => {
  const timer = setTimeout(() => { stalledUntil = Date.now() + STALL; resolve(cached); }, WAIT);
  network.then(response => { clearTimeout(timer); stalledUntil = 0; resolve(response); }, () => { clearTimeout(timer); resolve(cached); });
});

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
  if (!isShellPath(path)) return;
  const key = new URL(path, root).href;
  // Prefer a fresh response if it arrives immediately. Otherwise show cached HTML,
  // JS, CSS or metadata after 250 ms and refresh them in the background. This avoids
  // waiting seconds on repeated opens during slow GitHub Pages connections.
  const network = fetch(event.request).then(response => {
    if (response.ok && response.type === 'basic' && new URL(response.url).origin === root.origin) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(key, copy)));
    }
    return response;
  });
  event.waitUntil(network.catch(() => {}));
  event.respondWith(caches.match(key).then(cached => {
    if (!cached) return network.catch(() => Response.error());
    return !self.navigator.onLine || Date.now() < stalledUntil ? cached : firstOf(network, cached);
  }));
});
