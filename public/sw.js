const CACHE_NAME = "wubi-test-v11";
const scopePath = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const withBase = (path) => `${scopePath}${path}`;
const ROUTE_PATHS = [
  "/",
  "/training",
  "/challenge",
  "/lookup",
  "/history",
  "/summary",
  "/settings"
];
const ROUTE_VARIANTS = ROUTE_PATHS.flatMap((path) =>
  path === "/" ? [path] : [path, `${path}/`]
);
const PRECACHE = [
  ...ROUTE_VARIANTS,
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
const AUDIO_PATH_PREFIX = withBase("/audio/tracks/");

async function installOfflineBundle() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(PRECACHE);
  const shellAssets = new Set();
  for (const path of ROUTE_VARIANTS.map(withBase)) {
    const response = await cache.match(path);
    if (!response) continue;
    const html = await response.text();
    for (const match of html.matchAll(
      /(?:src|href)="([^"]*\/(?:_next|assets)\/[^"]+)"/g
    )) {
      shellAssets.add(match[1]);
    }
  }
  if (shellAssets.size) await cache.addAll(Array.from(shellAssets));
}

async function matchNavigationCache(request) {
  const direct = await caches.match(request, { ignoreSearch: true });
  if (direct) return direct;

  const alternateUrl = new URL(request.url);
  alternateUrl.pathname = alternateUrl.pathname.endsWith("/")
    ? alternateUrl.pathname.slice(0, -1)
    : `${alternateUrl.pathname}/`;
  return (
    (await caches.match(alternateUrl.toString(), { ignoreSearch: true })) ||
    (await caches.match(withBase("/"), { ignoreSearch: true }))
  );
}

function parseByteRange(rangeHeader, totalBytes) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || totalBytes <= 0) return null;

  const [, startText, endText] = match;
  let start;
  let end;
  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, totalBytes - suffixLength);
    end = totalBytes - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : totalBytes - 1;
  }
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start >= totalBytes ||
    end < start
  ) {
    return null;
  }
  return { start, end: Math.min(end, totalBytes - 1) };
}

async function createAudioRangeResponse(response, rangeHeader) {
  const body = await response.arrayBuffer();
  const range = parseByteRange(rangeHeader, body.byteLength);
  if (!range) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${body.byteLength}` }
    });
  }

  const headers = new Headers(response.headers);
  headers.delete("Content-Encoding");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Length", String(range.end - range.start + 1));
  headers.set(
    "Content-Range",
    `bytes ${range.start}-${range.end}/${body.byteLength}`
  );
  return new Response(body.slice(range.start, range.end + 1), {
    status: 206,
    statusText: "Partial Content",
    headers
  });
}

function handleAudioRangeRequest(event, request, rangeHeader) {
  const headers = new Headers(request.headers);
  headers.delete("Range");
  const fullRequest = new Request(request, { headers });
  const cachedAudio = caches
    .open(CACHE_NAME)
    .then((cache) => cache.match(fullRequest));
  const cacheFullAudio = cachedAudio.then(async (cached) => {
    if (cached) return cached;
    const response = await fetch(fullRequest);
    if (!response.ok || response.status === 206) {
      throw new Error(`HTTP ${response.status}`);
    }
    const cache = await caches.open(CACHE_NAME);
    await cache.put(fullRequest, response.clone());
    return response;
  });

  event.waitUntil(cacheFullAudio.then(() => undefined).catch(() => undefined));
  event.respondWith(
    cachedAudio.then(async (cached) => {
      if (cached) return createAudioRangeResponse(cached, rangeHeader);
      try {
        return await fetch(request);
      } catch {
        try {
          const fullResponse = await cacheFullAudio;
          return createAudioRangeResponse(fullResponse.clone(), rangeHeader);
        } catch {
          return new Response("离线音频尚未缓存。", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
        }
      }
    })
  );
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

  const rangeHeader = request.headers.get("Range");
  if (url.pathname.startsWith(AUDIO_PATH_PREFIX) && rangeHeader) {
    handleAudioRangeRequest(event, request, rangeHeader);
    return;
  }

  if (request.mode === "navigate") {
    const networkResponse = fetch(request).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    });
    event.waitUntil(
      networkResponse
        .then((response) => {
          if (!response.ok) return;
          return caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, response.clone()));
        })
        .catch(() => undefined)
    );
    event.respondWith(
      networkResponse
        .catch(async () => {
          return (
            (await matchNavigationCache(request)) ||
            new Response("离线缓存尚未准备完成。", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" }
            })
          );
        })
    );
    return;
  }

  if (url.pathname.startsWith(withBase("/data/"))) {
    const networkResponse = fetch(request).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    });
    event.waitUntil(
      networkResponse
        .then((response) => {
          if (!response.ok) return;
          return caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, response.clone()));
        })
        .catch(() => undefined)
    );
    event.respondWith(
      networkResponse
        .catch(async () => {
          return (
            (await caches.match(request)) ||
            new Response("离线数据尚未缓存。", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" }
            })
          );
        })
    );
    return;
  }

  const networkResponse = fetch(request);
  event.waitUntil(
    networkResponse
      .then((response) => {
        if (!response.ok) return;
        return caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(request, response.clone()));
      })
      .catch(() => undefined)
  );
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return networkResponse;
    })
  );
});
