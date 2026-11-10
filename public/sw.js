// PT App service worker. Deliberately tiny: it makes the app installable,
// shows a friendly page when the network is down and keeps the immutable build
// files (/_next/static/, /stickers/, /icons/) so a reopened app does not
// download them again. It never caches HTML pages, /api, server actions or any
// user data.
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

// The only requests the worker answers from its cache: same-origin GETs of
// files that never change under the same URL. /_next/static/ files are hashed
// by the build, and /stickers/ and /icons/ are public images. Everything else
// (HTML, /api, server actions, photos and any other user data) goes to the
// network untouched.
const IMMUTABLE_PREFIXES = ["/_next/static/", "/stickers/", "/icons/"];

const isImmutableAsset = (url) =>
  url.origin === self.location.origin &&
  IMMUTABLE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));

// Cache first, so reopening the installed app does not download the same JS,
// CSS and images again. A miss goes to the network and only a complete 200
// response is stored (never an error page or a partial 206); the cache is the
// per-deploy CACHE_NAME, so a new deploy starts empty and drops the old one.
// A failed fetch while offline is a plain network error, like before.
const cacheFirst = async (event, request) => {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }
  try {
    const response = await fetch(request);

    if (response.status === 200 && response.type === "basic") {
      event.waitUntil(cache.put(request, response.clone()));
    }
    return response;
  } catch {
    return Response.error();
  }
};

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

  const url = new URL(request.url);

  if (isImmutableAsset(url) && !request.headers.has("range")) {
    event.respondWith(cacheFirst(event, request));
  }
});

// Web push for chat messages (KAN-103 sends, KAN-104 shows). The payload is
// {title, body, url, tag}: the sender name and a message preview.
const DEFAULT_NOTIFICATION = { title: "PT App", body: "Bạn có tin nhắn mới" };

const readPushPayload = (event) => {
  try {
    const data = event.data ? event.data.json() : null;

    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
};

// Only same-origin relative paths; anything else falls back to the home page.
const safeUrl = (value) =>
  typeof value === "string" &&
  value.startsWith("/") &&
  !value.startsWith("//") &&
  !value.includes("\\")
    ? value
    : "/";

self.addEventListener("push", (event) => {
  const data = readPushPayload(event);
  const title =
    typeof data.title === "string" && data.title
      ? data.title
      : DEFAULT_NOTIFICATION.title;
  const body =
    typeof data.body === "string" && data.body
      ? data.body
      : DEFAULT_NOTIFICATION.body;
  const options = {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: safeUrl(data.url) },
  };

  // renotify without a tag makes showNotification throw, so they go together.
  if (typeof data.tag === "string" && data.tag) {
    options.tag = data.tag;
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    safeUrl(event.notification.data && event.notification.data.url),
    self.location.origin,
  );

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windows) => {
        const client = windows.find(
          (candidate) => new URL(candidate.url).origin === target.origin,
        );

        if (client) {
          await client.focus();
          if ("navigate" in client) {
            return client.navigate(target.href);
          }
          return undefined;
        }
        return self.clients.openWindow(target.href);
      }),
  );
});
