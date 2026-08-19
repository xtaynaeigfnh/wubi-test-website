import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

import {
  addError,
  buildReviewPool,
  buildRootPool,
  buildTrendSeries,
  calculateDailyProgress,
  calculateStreak,
  createBackupPayload,
  getErrors,
  getProgress,
  getSessions,
  parseBackupPayload,
  recordKeyUsage,
  restoreBackupPayload,
  saveSession,
  STORAGE,
  updateErrorMastery,
} from "../app/lib.ts";

function session(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    type: "article",
    title: "测试文章",
    date: "2026-07-29T09:00:00+08:00",
    durationSeconds: 120,
    correctChars: 200,
    attemptedChars: 205,
    speed: 100,
    kps: 2,
    codeLength: 2.4,
    theoreticalCodeLength: 1.8,
    accuracy: 97.5,
    keyAccuracy: 95.2,
    errors: 5,
    keyCount: 240,
    backspaceCount: 2,
    correctionCount: 1,
    enterCount: 0,
    selectionCount: 3,
    phraseRate: 42.5,
    leftHandKeys: 120,
    rightHandKeys: 115,
    pauseCount: 1,
    pauseSeconds: 3.5,
    retryCount: 0,
    ...overrides,
  };
}

test("daily goals and streak use completed local sessions", () => {
  const now = new Date("2026-07-29T12:00:00+08:00");
  const sessions = [
    session(),
    session({
      id: "review",
      type: "review",
      correctChars: 18,
      durationSeconds: 60,
    }),
    session({
      id: "yesterday",
      date: "2026-07-28T20:00:00+08:00",
      correctChars: 300,
    }),
  ];

  assert.deepEqual(calculateDailyProgress(sessions, now), {
    date: "2026-07-29",
    chars: 200,
    minutes: 3,
    rounds: 2,
    articleSessions: 1,
    trainingSessions: 1,
  });
  assert.equal(calculateStreak(sessions, now), 2);
});

test("trend series produces daily speed and accuracy summaries", () => {
  const points = buildTrendSeries(
    [
      session({ correctChars: 200, durationSeconds: 120, accuracy: 98 }),
      session({
        id: "second",
        correctChars: 100,
        durationSeconds: 60,
        accuracy: 94,
      }),
    ],
    7,
    new Date("2026-07-29T12:00:00+08:00"),
  );
  const today = points.at(-1);
  assert.equal(today.sessions, 2);
  assert.equal(today.chars, 300);
  assert.equal(today.minutes, 3);
  assert.equal(today.speed, 100);
  assert.equal(today.accuracy, 96);
});

test("all trend range includes sessions older than one year", () => {
  const now = new Date("2026-07-29T12:00:00+08:00");
  const oldDate = new Date(now);
  oldDate.setDate(oldDate.getDate() - 400);
  const points = buildTrendSeries(
    [session({ id: "old", date: oldDate.toISOString() })],
    "all",
    now,
  );

  assert.equal(points.length, 401);
  assert.equal(points[0].sessions, 1);
  assert.equal(points.reduce((sum, point) => sum + point.sessions, 0), 1);
});

test("review and root pools reuse preferred Wubi codes", () => {
  const entries = [
    ["测", "imj", 200000],
    ["测", "im", 150000],
    ["横", "amw", 200000],
    ["竖", "jcu", 200000],
  ];
  const review = buildReviewPool(
    [
      { text: "测", count: 3, mastery: 0, lastSeen: "2026-07-29" },
      { text: "缺", code: "rmnw", count: 1, lastSeen: "2026-07-29" },
    ],
    entries,
  );

  assert.deepEqual(review[0], ["测", "im", 150000]);
  assert.ok(review.some(([text, code]) => text === "缺" && code === "rmnw"));
  assert.deepEqual(buildRootPool(entries, "asdfg"), [["横", "amw", 200000]]);
});

test("review pool rejects invalid backup codes and deduplicates repeated text", () => {
  const review = buildReviewPool(
    [
      { text: "测", count: 3, mastery: 1, lastSeen: "2026-07-29" },
      {
        text: "测",
        code: "IMJ",
        count: 2,
        mastery: 0,
        lastSeen: "2026-07-29",
      },
      {
        text: "坏",
        code: "../x",
        count: 99,
        mastery: 0,
        lastSeen: "2026-07-29",
      },
      {
        text: "五个字符无效",
        code: "abcd",
        count: 99,
        mastery: 0,
        lastSeen: "2026-07-29",
      },
    ],
    [["测", "im", 150000]],
  );

  assert.deepEqual(review, [["测", "im", 150000]]);
});

test("error mastery merges legacy records for the same text", () => {
  const values = new Map([
    [
      STORAGE.errors,
      JSON.stringify([
        {
          text: "测",
          count: 2,
          mastery: 1,
          lastSeen: "2026-07-28T09:00:00.000Z",
        },
        {
          text: "测",
          code: "imyt",
          count: 3,
          mastery: 2,
          lastSeen: "2026-07-29T09:00:00.000Z",
        },
      ]),
    ],
  ]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };
  try {
    const updated = updateErrorMastery("测", "imyt", true);
    assert.deepEqual(updated, [
      {
        text: "测",
        code: "imyt",
        count: 5,
        mastery: 4,
        lastSeen: "2026-07-29T09:00:00.000Z",
        lastCorrect: updated[0].lastCorrect,
      },
    ]);

    addError("测");
    const stored = JSON.parse(values.get(STORAGE.errors));
    assert.equal(stored.length, 1);
    assert.equal(stored[0].count, 6);
    assert.equal(stored[0].code, "imyt");
    assert.equal(stored[0].mastery, 3);
  } finally {
    delete globalThis.window;
  }
});

test("backup format only accepts known versioned storage keys", () => {
  const payload = createBackupPayload(
    {
      [STORAGE.sessions]: [session()],
      [STORAGE.settings]: {
        fontSize: 30,
        preferredLength: "all",
        showCodeHints: false,
        sound: false,
        theme: "dark",
        autoNext: false,
      },
      [STORAGE.keyUsage]: { KeyQ: 12, KeyW: 8 },
      unrelated: "discard me",
    },
    new Date("2026-07-29T12:00:00+08:00"),
  );
  assert.equal(payload.format, "wubi-test-backup");
  assert.deepEqual(Object.keys(payload.data).sort(), [
    STORAGE.sessions,
    STORAGE.settings,
    STORAGE.keyUsage,
  ].sort());
  assert.deepEqual(parseBackupPayload(payload), payload);
  assert.throws(
    () =>
      parseBackupPayload({
        ...payload,
        data: { ...payload.data, "unknown:key": true },
      }),
    /无法识别/,
  );
  assert.throws(
    () =>
      parseBackupPayload({
        ...payload,
        data: { [STORAGE.errors]: { text: "不是数组" } },
      }),
    /格式不正确/,
  );
  assert.throws(
    () =>
      parseBackupPayload({
        ...payload,
        data: { [STORAGE.keyUsage]: { KeyQ: -1, Unknown: 3 } },
      }),
    /格式不正确/,
  );
  assert.throws(
    () =>
      parseBackupPayload({
        ...payload,
        data: {
          [STORAGE.customTexts]: Array.from({ length: 21 }, (_, index) => ({
            id: `custom-${index}`,
            title: "测试",
            length: "short",
            topic: "自定义",
            wordCount: 10,
            version: 1,
            text: "这是至少十个字符的自定义正文。",
            kind: "custom",
          })),
        },
      }),
    /格式不正确/,
  );
  assert.deepEqual(
    parseBackupPayload({
      ...payload,
      data: { [STORAGE.settings]: { theme: "dark" } },
    }).data[STORAGE.settings],
    {
      fontSize: 30,
      preferredLength: "all",
      showCodeHints: false,
      sound: false,
      theme: "dark",
      autoNext: false,
    },
  );
});

test("backup validates optional typing heatmaps without changing the format version", () => {
  const heatmap = {
    version: 1,
    text: "甲乙\n丙丁",
    baselineMs: 480,
    thresholdMs: 1000,
    segments: [{ start: 2, length: 1, delayMs: 2200 }],
  };
  const payload = createBackupPayload({
    [STORAGE.sessions]: [session({ heatmap })],
  });
  assert.equal(payload.version, 2);
  assert.deepEqual(parseBackupPayload(payload), payload);

  for (const invalidHeatmap of [
    { ...heatmap, text: "" },
    { ...heatmap, segments: [{ start: 4, length: 1, delayMs: 2200 }] },
    { ...heatmap, segments: Array.from({ length: 33 }, () => ({ start: 0, length: 1, delayMs: 2200 })) },
    { ...heatmap, segments: [{ start: 0, length: 1, delayMs: 700000 }] },
  ]) {
    assert.throws(
      () =>
        parseBackupPayload(
          createBackupPayload({
            [STORAGE.sessions]: [session({ heatmap: invalidHeatmap })],
          }),
        ),
      /格式不正确/,
    );
  }
});

test("local session history keeps heatmaps for only the newest 50 rounds", () => {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };
  try {
    for (let index = 0; index < 55; index += 1) {
      saveSession(
        session({
          id: `heatmap-${index}`,
          heatmap: {
            version: 1,
            text: "甲乙丙丁",
            baselineMs: 500,
            thresholdMs: 1000,
            segments: [{ start: 2, length: 1, delayMs: 2400 }],
          },
        }),
      );
    }
    const stored = JSON.parse(values.get(STORAGE.sessions));
    assert.equal(stored.length, 55);
    assert.equal(stored.filter((item) => item.heatmap).length, 50);
    assert.equal(stored[0].id, "heatmap-54");
    assert.equal(stored[50].heatmap, undefined);
  } finally {
    delete globalThis.window;
  }
});

test("local history readers discard malformed records and self-heal storage", () => {
  const values = new Map([
    [STORAGE.sessions, JSON.stringify([{}, session({ id: "valid" })])],
    [STORAGE.progress, JSON.stringify([{}, {
      articleId: "article-1",
      attempts: 1,
      bestSpeed: 80,
      completed: true,
      lastPracticed: "2026-07-29T09:00:00.000Z",
      errors: 0,
    }])],
    [STORAGE.errors, JSON.stringify([{}, {
      text: "测",
      code: "imj",
      count: 1,
      lastSeen: "2026-07-29T09:00:00.000Z",
    }])],
  ]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
  try {
    assert.equal(getSessions().length, 1);
    assert.equal(getProgress().length, 1);
    assert.equal(getErrors().length, 1);
    assert.equal(JSON.parse(values.get(STORAGE.sessions)).length, 1);
    assert.equal(JSON.parse(values.get(STORAGE.progress)).length, 1);
    assert.equal(JSON.parse(values.get(STORAGE.errors)).length, 1);
  } finally {
    delete globalThis.window;
  }
});

test("session and article progress writes roll back together after storage failure", () => {
  const oldSessions = JSON.stringify([session({ id: "old" })]);
  const oldProgress = JSON.stringify([]);
  const values = new Map([
    [STORAGE.sessions, oldSessions],
    [STORAGE.progress, oldProgress],
  ]);
  let failProgress = true;
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => values.delete(key),
      setItem: (key, value) => {
        if (key === STORAGE.progress && failProgress) {
          failProgress = false;
          throw new Error("quota");
        }
        values.set(key, value);
      },
    },
  };
  try {
    assert.equal(saveSession(session({ id: "new", articleId: "article-1" })), false);
    assert.equal(values.get(STORAGE.sessions), oldSessions);
    assert.equal(values.get(STORAGE.progress), oldProgress);
  } finally {
    delete globalThis.window;
  }
});

test("session saving reports inaccessible storage without throwing", () => {
  let reads = 0;
  globalThis.window = {
    localStorage: {
      getItem: () => {
        reads += 1;
        if (reads > 2) throw new Error("denied");
        return JSON.stringify([]);
      },
      removeItem() {},
      setItem() {},
    },
  };
  try {
    assert.equal(saveSession(session({ articleId: "article-1" })), false);
  } finally {
    delete globalThis.window;
  }
});

test("backup restore rolls back every key after a storage failure", () => {
  const originalSettings = JSON.stringify({ theme: "light" });
  const originalErrors = JSON.stringify([]);
  const values = new Map([
    [STORAGE.settings, originalSettings],
    [STORAGE.errors, originalErrors],
  ]);
  let failOnce = true;
  const localStorage = {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => {
      if (key === STORAGE.errors && failOnce) {
        failOnce = false;
        throw new Error("quota");
      }
      values.set(key, value);
    },
  };
  globalThis.window = { localStorage };
  try {
    const payload = createBackupPayload({
      [STORAGE.settings]: {
        fontSize: 32,
        preferredLength: "all",
        showCodeHints: false,
        sound: false,
        theme: "dark",
        autoNext: false,
      },
      [STORAGE.errors]: [],
    });
    assert.throws(() => restoreBackupPayload(payload), /恢复未生效/);
    assert.equal(values.get(STORAGE.settings), originalSettings);
    assert.equal(values.get(STORAGE.errors), originalErrors);
  } finally {
    delete globalThis.window;
  }
});

test("backup restore cannot be overwritten by a pending key-usage write", () => {
  const values = new Map();
  const timers = new Map();
  let nextTimer = 1;
  const localStorage = {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
  globalThis.window = {
    localStorage,
    setTimeout: (callback) => {
      const id = nextTimer;
      nextTimer += 1;
      timers.set(id, callback);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  try {
    recordKeyUsage("KeyA");
    const pendingWrite = timers.values().next().value;
    assert.equal(typeof pendingWrite, "function");

    restoreBackupPayload(
      createBackupPayload({ [STORAGE.keyUsage]: { KeyQ: 9 } }),
    );
    assert.deepEqual(JSON.parse(values.get(STORAGE.keyUsage)), { KeyQ: 9 });

    pendingWrite();
    assert.deepEqual(JSON.parse(values.get(STORAGE.keyUsage)), { KeyQ: 9 });
  } finally {
    delete globalThis.window;
  }
});

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
  assert.match(worker, /wubi-test-v07/);
  assert.match(pwa, /updateViaCache: "none"/);
  assert.match(pwa, /controllerchange/);
  assert.match(pwa, /window\.location\.reload\(\)/);
  assert.doesNotMatch(worker.match(/const PRECACHE = \[[\s\S]*?\]\.map/)?.[0] ?? "", /wubi86/);
});

test("service worker creates valid cached audio range responses", async () => {
  const worker = await readFile(
    new URL("../public/sw.js", import.meta.url),
    "utf8",
  );
  const listeners = new Map();
  const cacheEntries = new Map();
  const cacheKey = (request) =>
    typeof request === "string"
      ? new URL(request, "https://example.com").toString()
      : request.url;
  const cache = {
    addAll: async () => undefined,
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
});

test("Vinext lifecycle scripts stay cross-platform", async () => {
  const [packageText, viteConfig] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageText);

  assert.equal(packageJson.scripts.dev, "vinext dev");
  assert.equal(packageJson.scripts.build, "vinext build");
  assert.equal(packageJson.scripts.start, "vinext start");
  assert.ok(
    viteConfig.indexOf("process.env.WRANGLER_LOG_PATH ??=") <
      viteConfig.indexOf('await import("@cloudflare/vite-plugin")'),
  );
});

test("all nine v0.2 feature surfaces stay wired into the product", async () => {
  const [app, training, management, trends, pwa, share] = await Promise.all([
    readFile(new URL("../app/components/WubiApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/TrainingCenter.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/DataManagement.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/TrendPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/PwaControl.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/share-card.ts", import.meta.url), "utf8"),
  ]);

  assert.match(management, /备份与恢复/);
  assert.match(management, /自定义文章管理/);
  assert.match(management, /multiple/);
  assert.match(management, /取消收藏/);
  assert.match(training, /高频错题复练/);
  assert.match(training, /智能推荐/);
  assert.match(training, /training-card-header/);
  assert.match(training, /training-card-stat/);
  assert.match(training, /连续/);
  assert.match(training, /五码根专项/);
  assert.match(trends, /速度与字准/);
  assert.match(pwa, /serviceWorker/);
  assert.match(share, /canvas\.toDataURL/);
  assert.match(app, /downloadShareCard/);
  assert.match(app, /TrainingCenter/);
  assert.match(app, /KeySummary/);
});
