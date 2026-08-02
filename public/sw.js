// Hand-written rather than a library (Serwist et al.) because this build
// runs on Turbopack and Serwist's Next.js integration currently requires
// webpack configuration. The offline surface this app actually promises is
// small — saved recipes, the ingredient bank, the active shopping list — so
// a plain service worker covers it without pulling in a bundler-specific
// dependency.

const CACHE_VERSION = "v1";
const SHELL_CACHE = `wfd-shell-${CACHE_VERSION}`;
const PAGE_CACHE = `wfd-pages-${CACHE_VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, PAGE_CACHE];

const SHELL_ASSETS = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Readable offline per the PRD's non-functional requirement: saved recipes,
// the ingredient bank, and the active shopping list. Not the fast path (/)
// or the builder (/build) — both need a live generation call to be useful,
// so there is nothing honest to serve from cache there.
const OFFLINE_ROUTE_PREFIXES = ["/book", "/ingredients", "/shop"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !CURRENT_CACHES.includes(key)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isOfflineRoute(pathname) {
  return OFFLINE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API routes, auth and server actions stay live-only — serving stale JSON
  // for a generation call or an auth check would be worse than an honest
  // network error.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigate(request, url));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(handleStatic(request));
  }
});

// Network-first: always prefer a live page when there is a connection, and
// only fall back to what was last seen (or the offline page) when the fetch
// itself fails. This is not a performance cache — it exists purely so the
// three offline-required sections still open with no signal.
async function handleNavigate(request, url) {
  const cache = await caches.open(PAGE_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok && isOfflineRoute(url.pathname)) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    const offline = await caches.match("/offline");
    return offline ?? Response.error();
  }
}

// Cache-first: Next's build output is content-hashed, so a cached copy is
// never stale by definition.
async function handleStatic(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}
