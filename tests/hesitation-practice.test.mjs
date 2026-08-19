import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHesitationObservations,
  buildHesitationPracticeResult,
  buildHesitationPracticeTarget,
  buildHesitationSession,
  calculateHesitationImprovement,
  extractHesitationPracticeExcerpt,
  isHesitationPracticeMastered,
} from "../app/hesitation-practice.ts";

const sourceSession = {
  id: "session-source",
  articleId: "article-1",
  title: "节奏测试",
  date: "2026-08-19T08:00:00.000Z",
};

function target(overrides = {}) {
  return {
    version: 1,
    id: "hesitation-test",
    fingerprint: "甲乙丙\u00000\u00003",
    sourceSessionId: sourceSession.id,
    articleId: sourceSession.articleId,
    sourceTitle: sourceSession.title,
    sourceDate: sourceSession.date,
    text: "甲乙丙丁戊己庚辛壬癸子丑",
    sourceStart: 0,
    focusOffset: 0,
    focusLength: 3,
    sourceDelayMs: 3000,
    baselineMs: 500,
    thresholdMs: 1000,
    ...overrides,
  };
}

function attempt(round, durationMs, errorIndexes = [], delaysMs = []) {
  return {
    round,
    durationMs,
    errorIndexes,
    delaysMs,
    completedAt: `2026-08-19T08:00:0${round}.000Z`,
  };
}

test("卡顿片段在文首、文尾和中间均补足到 12 字", () => {
  const text = "一二三四五六七八九十甲乙丙丁戊己庚辛壬癸";
  assert.deepEqual(extractHesitationPracticeExcerpt(text, { start: 0, length: 1 }), {
    text: "一二三四五六七八九十甲乙",
    sourceStart: 0,
    focusOffset: 0,
    focusLength: 1,
  });
  assert.deepEqual(extractHesitationPracticeExcerpt(text, { start: 19, length: 1 }), {
    text: "九十甲乙丙丁戊己庚辛壬癸",
    sourceStart: 8,
    focusOffset: 11,
    focusLength: 1,
  });
  const middle = extractHesitationPracticeExcerpt(text, { start: 10, length: 2 });
  assert.equal(Array.from(middle.text).length, 12);
  assert.equal(middle.sourceStart, 5);
  assert.equal(middle.focusOffset, 5);
  assert.equal(middle.focusLength, 2);
});

test("短文使用全文，超长卡顿段居中截取 15 字", () => {
  assert.deepEqual(
    extractHesitationPracticeExcerpt("甲乙\r\n丙丁戊", { start: 2, length: 1 }),
    {
      text: "甲乙丙丁戊",
      sourceStart: 0,
      focusOffset: 2,
      focusLength: 1,
    },
  );
  const long = extractHesitationPracticeExcerpt("字".repeat(30), {
    start: 5,
    length: 20,
  });
  assert.equal(Array.from(long.text).length, 15);
  assert.equal(long.sourceStart, 7);
  assert.equal(long.focusOffset, 0);
  assert.equal(long.focusLength, 15);
});

test("Unicode 扩展字符按码点统计，换行不占片段索引", () => {
  const excerpt = extractHesitationPracticeExcerpt(
    "𠀀甲乙\n丙丁戊己庚辛壬癸子丑",
    { start: 1, length: 1 },
  );
  assert.equal(Array.from(excerpt.text).length, 12);
  assert.equal(Array.from(excerpt.text)[0], "𠀀");
  assert.equal(excerpt.focusOffset, 1);
  assert.equal(Array.from(excerpt.text).includes("\n"), false);
});

test("相同片段目标产生稳定 ID，焦点变化会改变 fingerprint 和 ID", () => {
  const heatmap = {
    version: 1,
    text: "一二三四五六七八九十甲乙丙丁戊己",
    baselineMs: 500,
    thresholdMs: 1000,
    segments: [],
  };
  const first = buildHesitationPracticeTarget(
    heatmap,
    { start: 6, length: 1, delayMs: 2500 },
    sourceSession,
  );
  const repeated = buildHesitationPracticeTarget(
    heatmap,
    { start: 6, length: 1, delayMs: 2500 },
    { ...sourceSession, id: "another-session" },
  );
  const shifted = buildHesitationPracticeTarget(
    heatmap,
    { start: 6, length: 2, delayMs: 2500 },
    sourceSession,
  );
  assert.equal(first.id, repeated.id);
  assert.equal(first.fingerprint, repeated.fingerprint);
  assert.notEqual(first.id, shifted.id);
  assert.notEqual(first.fingerprint, shifted.fingerprint);
});

test("改善率可为负数并防止首轮零耗时除零", () => {
  assert.equal(calculateHesitationImprovement(1000, 800), 20);
  assert.equal(calculateHesitationImprovement(1000, 1250), -25);
  assert.equal(calculateHesitationImprovement(0, 0), 0);
});

test("暂时掌握要求第三轮零错且提速 20% 或达到文章基线", () => {
  const practiceTarget = target();
  assert.equal(
    isHesitationPracticeMastered(practiceTarget, [
      attempt(1, 10000),
      attempt(2, 9000),
      attempt(3, 8000),
    ]),
    true,
  );
  assert.equal(
    isHesitationPracticeMastered(practiceTarget, [
      attempt(1, 10000),
      attempt(2, 9000),
      attempt(3, 6000),
    ]),
    true,
  );
  assert.equal(
    isHesitationPracticeMastered(practiceTarget, [
      attempt(1, 10000),
      attempt(2, 9000),
      attempt(3, 6000, [0]),
    ]),
    false,
  );
  assert.equal(
    isHesitationPracticeMastered(
      target({ baselineMs: 0 }),
      [attempt(1, 10000), attempt(2, 9000), attempt(3, 8500)],
    ),
    false,
  );
});

test("只用第三轮生成错误、卡顿和焦点正确观察", () => {
  const practiceTarget = target({ focusOffset: 0, focusLength: 4 });
  const result = buildHesitationPracticeResult(
    practiceTarget,
    [
      attempt(1, 10000, [0], [3000]),
      attempt(2, 8000, [1], [0, 3000]),
      attempt(3, 6000, [1, 1], [0, 1600, 2600, 0]),
    ],
    "2026-08-19T08:01:00.000Z",
  );
  assert.deepEqual(
    buildHesitationObservations(result, new Map([["乙", "nnnn"]])),
    [
      {
        text: "乙",
        code: "nnnn",
        kind: "coding-error",
        severity: undefined,
        occurredAt: result.completedAt,
      },
      {
        text: "乙",
        code: "nnnn",
        kind: "hesitation",
        severity: 2,
        occurredAt: result.completedAt,
      },
      {
        text: "丙",
        code: undefined,
        kind: "hesitation",
        severity: 3,
        occurredAt: result.completedAt,
      },
      {
        text: "甲",
        code: undefined,
        kind: "correct",
        severity: undefined,
        occurredAt: result.completedAt,
      },
      {
        text: "丁",
        code: undefined,
        kind: "correct",
        severity: undefined,
        occurredAt: result.completedAt,
      },
    ],
  );
  assert.equal(result.outcome, "needs-review");
});

test("片段成绩累计三轮字数与错误，速度和准确率取第三轮", () => {
  const practiceTarget = target();
  const result = buildHesitationPracticeResult(
    practiceTarget,
    [
      attempt(1, 12000, [0, 1]),
      attempt(2, 9000, [0]),
      attempt(3, 6000),
    ],
    "2026-08-19T08:01:00.000Z",
  );
  const session = buildHesitationSession(result, "hesitation-session");
  assert.equal(session.id, "hesitation-session");
  assert.equal(session.type, "hesitation");
  assert.equal(session.durationSeconds, 27);
  assert.equal(session.attemptedChars, 36);
  assert.equal(session.correctChars, 33);
  assert.equal(session.errors, 3);
  assert.equal(session.speed, 120);
  assert.equal(session.accuracy, 100);
  assert.equal(session.hesitationPractice, result);
});
