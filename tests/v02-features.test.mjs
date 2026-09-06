import assert from "node:assert/strict";
import test from "node:test";

import {
  addCustomArticlesWithinLimit,
  buildReviewPool,
  buildRootPool,
  buildTrendSeries,
  buildCustomArticle,
  calculateDailyProgress,
  calculateStreak,
  truncateUnicode,
} from "../app/lib.ts";
import {
  applyWeakObservations,
  buildTrainingSummary,
  generateDailyTrainingPlan,
  regenerateIncompleteTasks,
  scoreWeakItem,
} from "../app/training-plan.ts";
import {
  session,
  trainingArticles,
  trainingEntries,
} from "./v02-fixtures.mjs";



test("custom article capacity never evicts existing content silently", () => {
  const existing = Array.from({ length: 20 }, (_, index) =>
    buildCustomArticle(
      `custom-existing-${index}`,
      `已有文章 ${index + 1}`,
      `这是第${index + 1}篇已有自定义文章的有效正文内容。`,
    ),
  ).filter(Boolean);
  const incoming = buildCustomArticle(
    "custom-incoming",
    "新文章",
    "这是准备新增的一篇自定义文章有效正文。",
  );
  assert.ok(incoming);

  const full = addCustomArticlesWithinLimit(existing, [incoming]);
  assert.deepEqual(full.articles, existing);
  assert.deepEqual(full.added, []);
  assert.deepEqual(full.rejected, [incoming]);

  const partial = addCustomArticlesWithinLimit(existing.slice(0, 19), [
    incoming,
    { ...incoming, id: "custom-incoming-2" },
  ]);
  assert.equal(partial.articles.length, 20);
  assert.deepEqual(partial.articles.slice(1), existing.slice(0, 19));
  assert.equal(partial.added[0].id, incoming.id);
  assert.equal(partial.rejected[0].id, "custom-incoming-2");

  const duplicate = addCustomArticlesWithinLimit(existing.slice(0, 1), [
    { ...incoming, id: existing[0].id },
    incoming,
    { ...incoming },
  ]);
  assert.deepEqual(duplicate.added.map((article) => article.id), [incoming.id]);
  assert.deepEqual(
    duplicate.rejected.map((article) => article.id),
    [existing[0].id, incoming.id],
  );
  assert.equal(new Set(duplicate.articles.map((article) => article.id)).size, 2);
});

test("unicode previews never split non-BMP characters", () => {
  const value = `${"中".repeat(71)}😀末`;
  const truncated = truncateUnicode(value, 72);
  assert.equal(Array.from(truncated).length, 72);
  assert.equal(truncated.endsWith("😀"), true);
  assert.equal(truncated.isWellFormed(), true);
});


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


test("weakness scoring is explainable and consecutive correct answers lower priority", () => {
  const now = new Date("2026-08-19T10:00:00+08:00");
  const coding = {
    text: "我",
    count: 5,
    codingErrors: 5,
    lastSeen: "2026-08-19T09:00:00+08:00",
    mastery: 0,
  };
  const hesitation = {
    text: "人",
    count: 0,
    hesitationPoints: 6,
    lastSeen: "2026-08-19T09:00:00+08:00",
    mastery: 0,
  };
  assert.equal(scoreWeakItem(coding, now).issue, "coding-error");
  assert.equal(scoreWeakItem(hesitation, now).issue, "hesitation");
  assert.ok(scoreWeakItem(coding, now).score > scoreWeakItem(hesitation, now).score);

  const once = applyWeakObservations([coding], [
    { text: "我", code: "q", kind: "correct" },
  ], now);
  const twice = applyWeakObservations(once, [
    { text: "我", code: "q", kind: "correct" },
  ], now);
  assert.ok(scoreWeakItem(once[0], now).score < scoreWeakItem(coding, now).score);
  assert.ok(scoreWeakItem(twice[0], now).score < scoreWeakItem(once[0], now).score);
  const reset = applyWeakObservations(twice, [
    { text: "我", code: "q", kind: "coding-error" },
  ], now);
  assert.equal(reset[0].correctStreak, 0);
});

test("daily training plans are deterministic and provide a complete first-use prescription", () => {
  const input = {
    date: "2026-08-19",
    now: new Date("2026-08-19T10:00:00+08:00"),
    articles: trainingArticles,
    progress: [],
    sessions: [],
    weakItems: [],
    entries: trainingEntries,
    preferredLength: "all",
  };
  const first = generateDailyTrainingPlan(input);
  const second = generateDailyTrainingPlan(input);
  assert.deepEqual(first, second);
  assert.deepEqual(first.tasks.map((task) => task.type), ["article", "review", "roots"]);
  assert.equal(first.tasks[1].items.length, 10);
  assert.equal(first.tasks[2].zoneId, "heng");
  assert.ok(first.estimatedMinutes >= 3);
});

test("daily training plans count one local practice day across UTC dates and timezone offsets", () => {
  const originalTimezone = process.env.TZ;
  process.env.TZ = "Asia/Shanghai";
  try {
    const input = {
      date: "2026-08-19",
      now: new Date("2026-08-19T10:00:00+08:00"),
      articles: trainingArticles,
      progress: [],
      sessions: [
        session({ id: "after-midnight", date: "2026-08-18T12:30:00-04:00" }),
        session({ id: "before-midnight", date: "2026-08-19T15:30:00Z" }),
      ],
      weakItems: [],
      entries: trainingEntries,
      preferredLength: "all",
    };

    const first = generateDailyTrainingPlan(input);
    const second = generateDailyTrainingPlan(input);

    assert.deepEqual(first, second);
    assert.equal(first.tasks.find((task) => task.type === "roots").zoneId, "shu");
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test("daily training plans count practice days on both sides of local midnight", () => {
  const originalTimezone = process.env.TZ;
  process.env.TZ = "Asia/Shanghai";
  try {
    const plan = generateDailyTrainingPlan({
      date: "2026-08-19",
      now: new Date("2026-08-19T10:00:00+08:00"),
      articles: trainingArticles,
      progress: [],
      sessions: [
        session({ id: "before-midnight", date: "2026-08-18T15:30:00Z" }),
        session({ id: "after-midnight", date: "2026-08-18T16:30:00Z" }),
      ],
      weakItems: [],
      entries: trainingEntries,
      preferredLength: "all",
    });

    assert.equal(plan.tasks.find((task) => task.type === "roots").zoneId, "zhe");
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test("daily training plans place due characters and phrases before ordinary weak items", () => {
  const plan = generateDailyTrainingPlan({
    date: "2026-08-19",
    now: new Date("2026-08-19T10:00:00+08:00"),
    articles: trainingArticles,
    progress: [],
    sessions: [],
    weakItems: [{
      text: "我",
      code: "q",
      count: 5,
      lastSeen: "2026-08-19T09:00:00+08:00",
    }],
    entries: trainingEntries,
    preferredLength: "all",
    dueReviewItems: [
      ["输入法", "lyif", 88],
      ["人", "w", 77],
      ["人", "ww", 20],
    ],
  });

  const review = plan.tasks.find((task) => task.type === "review");
  assert.deepEqual(review.items.slice(0, 2), [
    ["输入法", "lyif", 88],
    ["人", "w", 77],
  ]);
  assert.equal(review.items.filter(([text]) => text === "人").length, 1);
  assert.match(review.reason, /2 个到期字词优先/);
});

test("regrouping preserves completed tasks and training summaries compare snapshots", () => {
  const weakItems = [{
    text: "我",
    code: "q",
    count: 5,
    codingErrors: 5,
    lastSeen: "2026-08-19T09:00:00+08:00",
    mastery: 0,
  }];
  const input = {
    date: "2026-08-19",
    now: new Date("2026-08-19T10:00:00+08:00"),
    articles: trainingArticles,
    progress: [],
    sessions: [],
    weakItems,
    entries: trainingEntries,
    preferredLength: "all",
  };
  const plan = generateDailyTrainingPlan(input);
  plan.tasks[0] = {
    ...plan.tasks[0],
    status: "completed",
    sessionId: "warmup-session",
    completedAt: "2026-08-19T10:10:00+08:00",
  };
  const regrouped = regenerateIncompleteTasks(plan, input);
  assert.deepEqual(regrouped.tasks[0], plan.tasks[0]);
  assert.equal(regrouped.revision, 1);

  const mastered = [{ ...weakItems[0], mastery: 5, correctStreak: 5 }];
  const summary = buildTrainingSummary(
    plan,
    mastered,
    [session({ id: "warmup-session", durationSeconds: 180 })],
    input.now,
  );
  assert.deepEqual(summary.resolved, ["我"]);
  assert.equal(summary.rounds, 1);
  assert.equal(summary.durationSeconds, 180);
});

test("trend series produces daily speed and accuracy summaries", () => {
  const points = buildTrendSeries(
    [
      session({
        correctChars: 200,
        attemptedChars: 200,
        durationSeconds: 120,
        accuracy: 98,
      }),
      session({
        id: "second",
        correctChars: 100,
        attemptedChars: 100,
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
  assert.equal(today.accuracy, 290 / 3);
});

test("trend accuracy weights sessions by attempted characters", () => {
  const points = buildTrendSeries(
    [
      session({ attemptedChars: 1, accuracy: 0 }),
      session({ id: "long", attemptedChars: 999, accuracy: 100 }),
    ],
    7,
    new Date("2026-07-29T12:00:00+08:00"),
  );

  assert.equal(points.at(-1).accuracy, 99.9);
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

test("all trend range stays bounded for implausibly old imported sessions", () => {
  const points = buildTrendSeries(
    [session({ id: "old", date: "1900-01-01T00:00:00.000Z" })],
    "all",
    new Date("2026-07-29T12:00:00+08:00"),
  );

  assert.equal(points.length, 1);
  assert.equal(points[0].date, "1900-01-01");
  assert.equal(points[0].sessions, 1);
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
