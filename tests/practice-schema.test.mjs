import assert from "node:assert/strict";
import test from "node:test";

import * as legacy from "../app/lib.ts";
import * as schema from "../app/practice-schema.ts";

function articleProgress(overrides = {}) {
  return {
    articleId: "article-a",
    attempts: 1,
    bestSpeed: 80,
    completed: false,
    lastPracticed: "2026-07-29T09:00:00.000Z",
    errors: 3,
    ...overrides,
  };
}

function session(overrides = {}) {
  return {
    id: "article-session",
    type: "article",
    title: "测试文章",
    date: "2026-07-29T09:00:00+08:00",
    durationSeconds: 2,
    correctChars: 10,
    attemptedChars: 10,
    speed: 300,
    kps: 2,
    codeLength: 2.4,
    accuracy: 100,
    errors: 0,
    ...overrides,
  };
}

test("旧入口保留迁出的纯函数和默认值", () => {
  for (const name of [
    "defaultSettings",
    "defaultCustomTheme",
    "defaultDailyGoal",
    "normalizeCustomTheme",
    "isValidHexColor",
    "buildCustomArticle",
    "normalizeCustomText",
    "utf8ByteLength",
    "MAX_SPACED_REVIEW_STATE_BYTES",
  ]) {
    assert.notEqual(schema[name], undefined, name);
    assert.strictEqual(legacy[name], schema[name], name);
  }
});

test("纯校验与规范化在无浏览器和浏览器访问被拒绝时都可用", async (context) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  context.after(() => {
    if (original) Object.defineProperty(globalThis, "window", original);
    else delete globalThis.window;
  });
  delete globalThis.window;
  assert.equal(schema.isSessionResult(session()), true);
  assert.deepEqual(schema.normalizeArticleProgress([articleProgress()]), [articleProgress()]);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    get() {
      throw new DOMException("blocked", "SecurityError");
    },
  });
  const isolated = await import("../app/practice-schema.ts?restricted-browser");
  assert.equal(isolated.isSessionResult(session()), true);
  assert.deepEqual(isolated.normalizeDailyGoalValue({}), schema.defaultDailyGoal);
  assert.deepEqual(isolated.normalizeArticleProgress([articleProgress()]), [articleProgress()]);
});

test("本地进度允许修复坏记录和重复记录，备份仍严格拒绝原始数据", () => {
  const raw = [
    Object.freeze(articleProgress({ attempts: 999999, errors: 999999 })),
    Object.freeze(articleProgress({
      attempts: 3,
      errors: 2,
      bestSpeed: 120,
      completed: true,
      lastPracticed: "2026-08-02T09:00:00.000Z",
    })),
    Object.freeze(articleProgress({ articleId: "broken", attempts: -1 })),
    null,
  ];
  Object.freeze(raw);
  const normalized = schema.normalizeArticleProgress(raw);
  assert.deepEqual(normalized, [articleProgress({
    attempts: 1000000,
    errors: 1000000,
    bestSpeed: 120,
    completed: true,
    lastPracticed: "2026-08-02T09:00:00.000Z",
  })]);
  assert.equal(schema.isValidArticleProgressCollection(normalized), true);
  for (const invalid of [raw, raw.slice(0, 2), [raw[2]]]) {
    assert.equal(schema.isValidArticleProgressCollection(invalid), false);
    assert.throws(() => legacy.parseBackupPayload(legacy.createBackupPayload({
      [legacy.STORAGE.progress]: invalid,
    })), /格式不正确/);
  }
});

test("每日目标本地兼容修复与备份严格校验保留不同边界", () => {
  const partial = { targetChars: 700 };
  const expected = { targetChars: 700, targetMinutes: 15, targetRounds: 2 };
  assert.deepEqual(schema.normalizeDailyGoalValue(partial), expected);
  assert.deepEqual(schema.normalizeBackupDailyGoal(partial), expected);
  for (const [raw, repaired] of [
    [{ targetChars: 500.5, targetMinutes: 15.4, targetRounds: 2.2 }, { targetChars: 501, targetMinutes: 15, targetRounds: 2 }],
    [{ targetChars: 99, targetMinutes: 181, targetRounds: 0 }, schema.defaultDailyGoal],
    [{ targetChars: 500, unknown: true }, schema.defaultDailyGoal],
  ]) {
    assert.deepEqual(schema.normalizeDailyGoalValue(raw), repaired);
    assert.equal(schema.normalizeBackupDailyGoal(raw), null);
    assert.throws(() => legacy.parseBackupPayload(legacy.createBackupPayload({
      [legacy.STORAGE.dailyGoal]: raw,
    })), /格式不正确/);
  }
});

test("旧成绩兼容缺省大对象，新成绩仍校验热力图和幽灵时间线边界", () => {
  const heatmap = {
    version: 1,
    text: "甲𠮷\n乙",
    baselineMs: 480,
    thresholdMs: 1000,
    segments: [{ start: 2, length: 1, delayMs: 2200 }],
  };
  const ghostTimeline = {
    version: 1,
    articleKey: "builtin:short-001",
    articleVersion: 2,
    contentFingerprint: "10-example",
    characterCount: 10,
    step: 5,
    samples: [[5, 1000], [10, 2000]],
  };
  assert.equal(schema.isSessionResult(session()), true);
  assert.equal(schema.isSessionResult(session({ heatmap, ghostTimeline })), true);
  for (const invalid of [
    session({ heatmap: { ...heatmap, segments: [{ start: 3, length: 1, delayMs: 2200 }] } }),
    session({ heatmap: { ...heatmap, text: "甲".repeat(5001) } }),
    session({ ghostTimeline, type: "review" }),
    session({ ghostTimeline, durationSeconds: 4 }),
    session({ ghostTimeline: { ...ghostTimeline, samples: [[5, 2000], [10, 1000]] } }),
  ]) {
    assert.equal(schema.isSessionResult(invalid), false);
  }
});
