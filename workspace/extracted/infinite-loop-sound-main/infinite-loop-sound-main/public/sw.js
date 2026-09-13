// DivergenceIQ Service Worker
// Navigations are network-first (with cache fallback) so deployments propagate;
// hashed static assets are stale-while-revalidate.
const CACHE_NAME = "divergenceiq-v2";
const urlsToCache = ["/", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.allSettled(urlsToCache.map((url) => cache.add(url)))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  // Never intercept dynamic/API traffic
  if (request.url.includes("/api/") || request.url.includes("supabase")) {
    return;
  }

  const url = new URL(request.url);
  const isHashedAsset = /\.[0-9a-f]{8,}\.(js|css|woff2?|png|jpg|jpeg|svg|webp|wasm)$/i.test(
    url.pathname,
  );

  if (request.mode === "navigate") {
    // Network-first for navigations; fall back to cache when offline
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, copy))
            .catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/"))),
    );
    return;
  }

  if (isHashedAsset) {
    // Stale-while-revalidate for content-hashed assets
    event.respondWith(
      caches.match(request).then((cached) => {
        const refresh = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(request, copy))
                .catch(() => {});
            }
            return response;
          })
          .catch(() => cached);
        return cached || refresh;
      }),
    );
    return;
  }

  // Everything else: plain passthrough
});
