import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

test("PWA files declare offline routes and data caches", async () => {
  const [manifestText, worker, pwa] = await Promise.all([
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/components/PwaControl.tsx", import.meta.url), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, ".");
  assert.match(worker, /"\/training"/);
  assert.match(worker, /"\/summary"/);
  assert.match(worker, /"\/advanced"/);
  assert.match(worker, /\[path, `\$\{path\}\/`\]/);
  assert.match(worker, /\/data\/common-characters\.json/);
  assert.match(worker, /\/data\/music-catalog\.json/);
  assert.doesNotMatch(worker, /audioAssets/);
  assert.match(worker, /shellAssets/);
  assert.match(worker, /_next/);
  assert.match(worker, /assets/);
  assert.match(worker, /matchNavigationCache/);
  assert.match(worker, /createAudioRangeResponse/);
  assert.match(worker, /request\.headers\.get\("Range"\)/);
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /url\.pathname\.startsWith\(withBase\("\/data\/"\)\)/);
  assert.match(worker, /event\.waitUntil/);
  assert.match(worker, /wubi-test-v18/);
  assert.match(worker, /\/data\/wubi86\.json/);
  assert.match(worker, /\/data\/wubi86-challenge\.json/);
  assert.match(pwa, /updateViaCache: "none"/);
  assert.match(pwa, /controllerchange/);
  assert.match(pwa, /window\.location\.reload\(\)/);
  assert.match(worker.match(/const PRECACHE = \[[\s\S]*?\]\.map/)?.[0] ?? "", /wubi86/);
});

test("service worker creates valid cached audio range responses", async () => {
  const worker = await readFile(
    new URL("../public/sw.js", import.meta.url),
    "utf8",
  );
  const listeners = new Map();
  const cacheEntries = new Map();
  let precacheRequests = [];
  const cacheKey = (request) =>
    typeof request === "string"
      ? new URL(request, "https://example.com").toString()
      : request.url;
  const cache = {
    addAll: async (requests) => {
      precacheRequests = requests;
      for (const request of requests) {
        cacheEntries.set(cacheKey(request), new Response("cached"));
      }
    },
    match: async (request) => cacheEntries.get(cacheKey(request))?.clone(),
    put: async (request, response) =>
      cacheEntries.set(cacheKey(request), response.clone()),
  };
  const context = {
    caches: {
      delete: async () => true,
      keys: async () => [],
      match: cache.match,
      open: async () => cache,
    },
    fetch: async (request) =>
      request.headers.get("Range")
        ? new Response(Uint8Array.from([0, 1]), { status: 206 })
        : new Response(Uint8Array.from([0, 1, 2, 3, 4, 5]), {
            headers: { "Content-Type": "audio/mpeg" },
          }),
    Headers,
    Request,
    Response,
    URL,
    self: {
      addEventListener: (type, listener) => listeners.set(type, listener),
      clients: { claim: () => undefined },
      location: { origin: "https://example.com" },
      registration: { scope: "https://example.com/wubi/" },
      skipWaiting: () => undefined,
    },
  };
  runInNewContext(worker, context);

  let installPromise;
  listeners.get("install")({
    waitUntil: (promise) => {
      installPromise = promise;
    },
  });
  await installPromise;
  assert.ok(precacheRequests.includes("/wubi/data/wubi86.json"));
  assert.ok(precacheRequests.includes("/wubi/data/wubi86-challenge.json"));
  assert.equal(
    await (
      await cache.match("https://example.com/wubi/data/wubi86.json")
    ).text(),
    "cached",
  );

  const fullResponse = new Response(Uint8Array.from([0, 1, 2, 3, 4, 5]), {
    headers: { "Content-Type": "audio/mpeg" },
  });
  const partial = await context.createAudioRangeResponse(
    fullResponse,
    "bytes=2-4",
  );
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("Content-Range"), "bytes 2-4/6");
  assert.equal(partial.headers.get("Content-Length"), "3");
  assert.deepEqual(
    Array.from(new Uint8Array(await partial.arrayBuffer())),
    [2, 3, 4],
  );

  const invalid = await context.createAudioRangeResponse(
    new Response(Uint8Array.from([0, 1, 2])),
    "bytes=9-10",
  );
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get("Content-Range"), "bytes */3");

  cacheEntries.set(
    "https://example.com/wubi/history/",
    new Response("history page"),
  );
  cacheEntries.delete("https://example.com/wubi/history");
  const cachedRoute = await context.matchNavigationCache(
    new Request("https://example.com/wubi/history"),
  );
  assert.equal(await cachedRoute.text(), "history page");

  const fetchListener = listeners.get("fetch");
  let responsePromise;
  let cachePromise;
  fetchListener({
    request: new Request(
      "https://example.com/wubi/audio/tracks/example.mp3",
      { headers: { Range: "bytes=0-1" } },
    ),
    respondWith: (promise) => {
      responsePromise = promise;
    },
    waitUntil: (promise) => {
      cachePromise = promise;
    },
  });
  assert.equal((await responsePromise).status, 206);
  await cachePromise;
  const cachedFullAudio = cacheEntries.get(
    "https://example.com/wubi/audio/tracks/example.mp3",
  );
  assert.equal((await cachedFullAudio.clone().arrayBuffer()).byteLength, 6);

  context.fetch = async () => {
    throw new Error("offline");
  };
  fetchListener({
    request: new Request(
      "https://example.com/wubi/audio/tracks/example.mp3",
      { headers: { Range: "bytes=2-4" } },
    ),
    respondWith: (promise) => {
      responsePromise = promise;
    },
    waitUntil: (promise) => {
      cachePromise = promise;
    },
  });
  const offlineAudio = await responsePromise;
  await cachePromise;
  assert.equal(offlineAudio.status, 206);
  assert.deepEqual(
    Array.from(new Uint8Array(await offlineAudio.arrayBuffer())),
    [2, 3, 4],
  );

  context.fetch = async () => new Response("missing", { status: 404 });
  fetchListener({
    request: {
      method: "GET",
      mode: "navigate",
      url: "https://example.com/wubi/missing",
      headers: new Headers(),
    },
    respondWith: (promise) => {
      responsePromise = promise;
    },
    waitUntil: (promise) => {
      cachePromise = promise;
    },
  });
  const missingNavigation = await responsePromise;
  await cachePromise;
  assert.equal(missingNavigation.status, 404);
  assert.equal(await missingNavigation.text(), "missing");
});
