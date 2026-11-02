// PT App service worker. Deliberately tiny: it makes the app installable and
// shows a friendly page when the network is down. It never caches HTML pages,
// /api, server actions or any user data.
// The page registers /sw.js?v=<build id>, so every deploy installs a fresh
// worker with its own cache (re-fetching anything that failed before).
const BUILD_ID = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_NAME = `pt-app-static-${BUILD_ID}`;
const OFFLINE_URL = "/offline";
const ICON_URLS = [
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];
const PRECACHE_URLS = [OFFLINE_URL, ...ICON_URLS];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(PRECACHE_URLS);
        // The offline page needs its own CSS and JS chunks to render styled
        // and hydrate the retry button with no network. They are hashed,
        // immutable build files, never user data.
        const offline = await cache.match(OFFLINE_URL);
        const html = offline ? await offline.text() : "";
        const assets = [
          ...new Set(html.match(/\/_next\/static\/[^"'\\\s)]+/g) ?? []),
        ];
        // One missing chunk must not block installing the worker.
        await Promise.allSettled(assets.map((url) => cache.add(url)));
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  if (request.mode === "navigate") {
    // Network first. Only a thrown fetch (offline) falls back; HTTP errors
    // from the server pass through untouched.
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.match(OFFLINE_URL))
          .then((cached) => cached || Response.error()),
      ),
    );
    return;
  }

  const { pathname } = new URL(request.url);

  if (ICON_URLS.includes(pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request)),
    );
    return;
  }

  if (pathname.startsWith("/_next/static/")) {
    // Network first so online loads and dev chunks are never stale; the cache
    // is used only when the fetch throws (offline).
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((cached) => cached || Response.error()),
      ),
    );
  }
});
