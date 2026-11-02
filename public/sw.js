// PT App service worker. Deliberately tiny: it makes the app installable and
// shows a friendly page when the network is down. It never caches HTML pages,
// /api, server actions or any user data.
const CACHE_NAME = "pt-app-static-v1";
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
      .then((cache) => cache.addAll(PRECACHE_URLS))
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
  }
});
