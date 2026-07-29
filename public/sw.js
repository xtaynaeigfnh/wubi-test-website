const CACHE_NAME = "wubi-test-v03";
const scopePath = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const withBase = (path) => `${scopePath}${path}`;
const PRECACHE = [
  "/",
  "/training/",
  "/challenge/",
  "/lookup/",
  "/history/",
  "/settings/",
  "/manifest.webmanifest",
  "/icon.svg",
  "/data/articles-index.json",
  "/data/articles-short.json",
  "/data/articles-medium.json",
  "/data/articles-long.json",
  "/data/articles-water.json",
  "/data/common-characters.json",
  "/data/music-catalog.json",
  "/data/wubi86.json",
  "/data/wubi86-challenge.json"
].map(withBase);

async function installOfflineBundle() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(PRECACHE);
  const shellAssets = new Set();
  for (const path of PRECACHE.filter((item) => item.endsWith("/"))) {
    const response = await cache.match(path);
    if (!response) continue;
    const html = await response.text();
    for (const match of html.matchAll(/(?:src|href)="([^"]*\/_next\/[^"]+)"/g)) {
      shellAssets.add(match[1]);
    }
  }
  if (shellAssets.size) await cache.addAll(Array.from(shellAssets));

  const musicCatalogResponse = await cache.match(withBase("/data/music-catalog.json"));
  if (!musicCatalogResponse) return;
  const musicCatalog = await musicCatalogResponse.json();
  const audioAssets = (musicCatalog.tracks ?? []).flatMap((track) =>
    (track.sources ?? []).map((source) => withBase(source.src))
  );
  await Promise.allSettled(audioAssets.map((path) => cache.add(path)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(installOfflineBundle().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("wubi-test-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          return (
            (await caches.match(request)) ||
            (await caches.match(withBase("/"))) ||
            new Response("离线缓存尚未准备完成。", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" }
            })
          );
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
