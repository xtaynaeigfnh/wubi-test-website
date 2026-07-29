import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildReviewPool,
  buildRootPool,
  buildTrendSeries,
  calculateDailyProgress,
  calculateStreak,
  createBackupPayload,
  parseBackupPayload,
  STORAGE,
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
    accuracy: 97.5,
    errors: 5,
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

test("backup format only accepts known versioned storage keys", () => {
  const payload = createBackupPayload(
    {
      [STORAGE.sessions]: [session()],
      [STORAGE.settings]: { theme: "dark" },
      unrelated: "discard me",
    },
    new Date("2026-07-29T12:00:00+08:00"),
  );
  assert.equal(payload.format, "wubi-test-backup");
  assert.deepEqual(Object.keys(payload.data).sort(), [
    STORAGE.sessions,
    STORAGE.settings,
  ].sort());
  assert.equal(parseBackupPayload(payload), payload);
  assert.throws(
    () =>
      parseBackupPayload({
        ...payload,
        data: { ...payload.data, "unknown:key": true },
      }),
    /无法识别/,
  );
});

test("PWA files declare offline routes and data caches", async () => {
  const [manifestText, worker] = await Promise.all([
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, ".");
  assert.match(worker, /\/training\//);
  assert.match(worker, /\/data\/wubi86\.json/);
  assert.match(worker, /\/data\/common-characters\.json/);
  assert.match(worker, /\/data\/music-catalog\.json/);
  assert.match(worker, /Promise\.allSettled\(audioAssets/);
  assert.match(worker, /shellAssets/);
  assert.match(worker, /_next/);
  assert.match(worker, /request\.mode === "navigate"/);
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
  assert.match(training, /连续/);
  assert.match(training, /五码根专项/);
  assert.match(trends, /速度与准确率/);
  assert.match(pwa, /serviceWorker/);
  assert.match(share, /canvas\.toDataURL/);
  assert.match(app, /downloadShareCard/);
  assert.match(app, /TrainingCenter/);
});
