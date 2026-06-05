const CACHE_NAME = "alex-app-v5";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon.svg",
];

// On install: cache assets and skip waiting to activate immediately
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting(); // activate new SW immediately, don't wait for old tabs to close
});

// On activate: delete all old caches and claim all clients immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim()) // take control of all open tabs immediately
  );
});

// Fetch strategy: Network-first for HTML/CSS/JS (always get latest),
// Cache-first for everything else (images, fonts, etc.)
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) return;

  const isCore =
    event.request.mode === "navigate" ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".webmanifest");

  if (isCore) {
    // Network-first: always try network, fall back to cache if offline
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Update cache with fresh response
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          return networkResponse;
        })
        .catch(() => caches.match(event.request)) // offline fallback
    );
  } else {
    // Cache-first for assets (icons, images, fonts)
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
