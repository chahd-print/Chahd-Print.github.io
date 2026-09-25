/* CHAHD PRINT — Service Worker (PWA)
   Cache versionné : incrémenter VERSION pour forcer la mise à jour. */
const VERSION = '1.1.1';
const STATIC_CACHE = `chahd-static-${VERSION}`;
const RUNTIME_CACHE = `chahd-runtime-${VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/manifest.webmanifest',
  '/pwa/icon-192.png',
  '/pwa/icon-512.png',
  '/pwa/apple-touch-icon.png',
  '/images/logo-transparent-512.webp',
  '/images/banner-1440.webp',
  '/images/benimellal-960.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const fallback = await cache.match('/images/logo-transparent-512.webp');
    if (fallback) return fallback;
    throw err;
  }
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const home = await cache.match('/');
    if (home) return home;
    return new Response(
      '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>CHAHD PRINT</title></head>' +
      '<body style="background:#07110F;color:#F5F2E9;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:24px">' +
      '<div><h1>CHAHD PRINT</h1><p>Vous êtes hors connexion. Réessayez lorsque votre connexion sera rétablie.</p></div></body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // réseaux tiers (cartes OSM, etc.) : réseau direct

  // Assets immuables Next.js : cache-first
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Images, icônes, polices : cache-first
  if (/\.(?:png|jpe?g|webp|avif|svg|gif|ico|woff2?)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Navigations : network-first avec repli cache puis page hors connexion
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Le reste (HTML/statiques same-origin) : stale-while-revalidate
  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(request);
    const network = fetch(request)
      .then((response) => {
        if (response && response.ok && response.type === 'basic') {
          cache.put(request, response.clone());
        }
        return response;
      })
      .catch(() => cached);
    return cached || network;
  })());
});