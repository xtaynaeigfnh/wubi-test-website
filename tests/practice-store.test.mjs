import assert from "node:assert/strict";
import test from "node:test";

import {
  addError,
  addHesitationQueueItem,
  clearKeyUsage,
  clearPracticeHistory,
  deferSpacedReviewTarget,
  getCustomArticles,
  getErrors,
  getPhraseOpportunities,
  getProgress,
  getSessions,
  readHesitationQueue,
  readSpacedReviewState,
  recordPhraseOpportunities,
  saveHesitationPracticeOutcome,
  savePracticeOutcome,
  saveSession,
  startHesitationQueueItem,
  syncSpacedReviewState,
  updateErrorMastery,
} from "../app/practice-store.ts";
import { buildCustomArticle } from "../app/practice-schema.ts";
import { STORAGE } from "../app/storage.ts";
import { generateDailyTrainingPlan } from "../app/training-plan.ts";
import {
  articleProgress,
  hesitationSession,
  hesitationTarget,
  reviewItem,
  session,
  trainingArticles,
  trainingEntries,
} from "./v02-fixtures.mjs";

test("custom article reader removes malformed, duplicate, and overflowing local data", () => {
  const valid = Array.from({ length: 22 }, (_, index) =>
    buildCustomArticle(
      `custom-${index}`,
      `自定义文章 ${index + 1}`,
      `这是第${index + 1}篇用于校验本地数据边界的自定义文章。`,
    ),
  );
  assert.ok(valid.every(Boolean));
  const stored = [null, valid[0], valid[0], ...valid.slice(1)];
  let current = JSON.stringify(stored);
  globalThis.window = {
    localStorage: {
      getItem: (key) => key === STORAGE.customTexts ? current : null,
      setItem: (key, value) => {
        if (key === STORAGE.customTexts) current = value;
      },
      removeItem: () => {},
    },
  };
  try {
    const articles = getCustomArticles();
    assert.equal(articles.length, 18);
    assert.equal(new Set(articles.map((article) => article.id)).size, articles.length);
    assert.deepEqual(JSON.parse(current), articles);
  } finally {
    delete globalThis.window;
  }
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
        codingErrors: 5,
        hesitationPoints: 0,
        correctionCount: 0,
        seenCount: 1,
        correctStreak: 1,
        mastery: 3,
        lastSeen: "2026-07-29T09:00:00.000Z",
        lastCorrect: updated[0].lastCorrect,
      },
    ]);

    addError("测");
    const stored = JSON.parse(values.get(STORAGE.errors));
    assert.equal(stored.length, 1);
    assert.equal(stored[0].count, 6);
    assert.equal(stored[0].code, "imyt");
    assert.equal(stored[0].mastery, 2);
  } finally {
    delete globalThis.window;
  }
});

test("spaced review storage migrates legacy weaknesses and reports failed writes", () => {
  const values = new Map([
    [STORAGE.errors, JSON.stringify([{
      text: "测",
      code: "imyt",
      count: 3,
      lastSeen: "2026-08-28T08:00:00.000Z",
    }])],
    [STORAGE.phraseOpportunities, JSON.stringify([{
      text: "输入法",
      code: "lty",
      characterCount: 3,
      savedKeys: 2,
      opportunityCount: 2,
      practiceCount: 0,
      correctCount: 0,
      lastSeen: "2026-08-28T08:00:00.000Z",
    }])],
  ]);
  let rejectReviewWrite = false;
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => values.delete(key),
      setItem: (key, value) => {
        if (key === STORAGE.reviewState && rejectReviewWrite) throw new Error("quota");
        values.set(key, value);
      },
    },
  };
  try {
    const migrated = syncSpacedReviewState(new Date("2026-08-29T09:00:00.000Z"));
    assert.ok(migrated);
    assert.deepEqual(
      migrated.items.map((item) => [item.targetType, item.targetId]),
      [["character", "测"], ["phrase", "输入法"]],
    );
    assert.deepEqual(readSpacedReviewState(), migrated);
    values.delete(STORAGE.reviewState);
    rejectReviewWrite = true;
    assert.equal(syncSpacedReviewState(new Date("2026-08-29T09:00:00.000Z")), null);
    assert.equal(values.has(STORAGE.reviewState), false);
  } finally {
    delete globalThis.window;
  }
});

test("deferring a due item atomically reconciles or regenerates the pending review task", () => {
  const now = new Date("2026-08-29T09:00:00.000Z");
  const state = {
    version: 1,
    items: [
      reviewItem(),
      reviewItem({ targetId: "人", text: "人", code: "w" }),
    ],
  };
  const plan = generateDailyTrainingPlan({
    date: "2026-08-29",
    now,
    articles: trainingArticles,
    progress: [],
    sessions: [],
    weakItems: [],
    entries: trainingEntries,
    dueReviewItems: [["测", "imyt", 4], ["人", "w", 1]],
    preferredLength: "all",
  });
  const values = new Map([
    [STORAGE.reviewState, JSON.stringify(state)],
    [STORAGE.trainingPlan, JSON.stringify(plan)],
  ]);
  let failPlanWrite = false;
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => values.delete(key),
      setItem: (key, value) => {
        if (key === STORAGE.trainingPlan && failPlanWrite) {
          failPlanWrite = false;
          throw new Error("quota");
        }
        values.set(key, value);
      },
    },
  };
  try {
    const before = new Map(values);
    failPlanWrite = true;
    assert.equal(
      deferSpacedReviewTarget("character", "测", now),
      null,
    );
    assert.deepEqual(values, before);

    const deferred = deferSpacedReviewTarget("character", "测", now);
    assert.ok(deferred);
    assert.ok(Date.parse(deferred.items[0].dueAt) > now.getTime());
    const storedPlan = JSON.parse(values.get(STORAGE.trainingPlan));
    const reviewTask = storedPlan.tasks.find((task) => task.type === "review");
    assert.equal(reviewTask.items.some(([text]) => text === "测"), false);
    assert.equal(reviewTask.items[0][0], "人");

    const lonePlan = structuredClone(plan);
    const loneTask = lonePlan.tasks.find((task) => task.type === "review");
    loneTask.items = [["测", "imyt", 4]];
    values.set(STORAGE.reviewState, JSON.stringify({
      version: 1,
      items: [reviewItem()],
    }));
    values.set(STORAGE.trainingPlan, JSON.stringify(lonePlan));
    assert.ok(deferSpacedReviewTarget("character", "测", now));
    assert.equal(JSON.parse(values.get(STORAGE.trainingPlan)), null);
  } finally {
    delete globalThis.window;
  }
});

test("clearing key usage reports storage failures without pretending success", () => {
  globalThis.window = {
    localStorage: {
      getItem: () => JSON.stringify({ KeyA: 3 }),
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    },
  };
  try {
    assert.equal(clearKeyUsage(), false);
  } finally {
    delete globalThis.window;
  }
});

test("hesitation queue validates targets, deduplicates, caps at five and resets daily", () => {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
  try {
    const now = new Date(2026, 7, 19, 10, 0);
    assert.deepEqual(readHesitationQueue(now), {
      version: 1,
      date: "2026-08-19",
      items: [],
    });
    const first = addHesitationQueueItem(hesitationTarget(), now);
    assert.equal(first.result, "added");
    assert.equal(
      addHesitationQueueItem(hesitationTarget({ id: "other-id" }), now).result,
      "duplicate",
    );
    const started = startHesitationQueueItem(first.queue.items[0].id, now);
    assert.equal(started.items[0].status, "in-progress");

    for (let index = 1; index < 5; index += 1) {
      const target = hesitationTarget({
        id: `hesitation-target-${index}`,
        text: `五笔输入练习需要稳定节${index}`,
      });
      assert.equal(addHesitationQueueItem(target, now).result, "added");
    }
    assert.equal(
      addHesitationQueueItem(
        hesitationTarget({ id: "overflow", text: "五笔输入练习需要稳定节点" }),
        now,
      ).result,
      "full",
    );
    assert.equal(
      addHesitationQueueItem(
        hesitationTarget({ text: "超过十五个字符的卡顿片段不可加入" }),
        now,
      ).result,
      "invalid",
    );
    assert.deepEqual(
      readHesitationQueue(new Date(2026, 7, 20, 0, 1)),
      { version: 1, date: "2026-08-20", items: [] },
    );
  } finally {
    delete globalThis.window;
  }
});

test("practice outcome saves weakness and task completion in one transaction", () => {
  const plan = generateDailyTrainingPlan({
    date: "2026-08-19",
    now: new Date("2026-08-19T10:00:00+08:00"),
    articles: trainingArticles,
    progress: [],
    sessions: [],
    weakItems: [],
    entries: trainingEntries,
    preferredLength: "all",
  });
  const review = plan.tasks.find((task) => task.type === "review");
  review.status = "in-progress";
  review.startedAt = "2026-08-19T10:00:00+08:00";
  const values = new Map([
    [STORAGE.sessions, JSON.stringify([])],
    [STORAGE.errors, JSON.stringify([])],
    [STORAGE.trainingPlan, JSON.stringify(plan)],
  ]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
  try {
    const result = session({
      id: "review-result",
      type: "review",
      articleId: undefined,
      trainingTaskId: review.id,
    });
    assert.equal(savePracticeOutcome(result, [
      { text: "我", code: "q", kind: "coding-error" },
    ]), true);
    assert.equal(JSON.parse(values.get(STORAGE.sessions))[0].id, "review-result");
    assert.equal(JSON.parse(values.get(STORAGE.errors))[0].codingErrors, 1);
    const storedPlan = JSON.parse(values.get(STORAGE.trainingPlan));
    assert.equal(storedPlan.tasks.find((task) => task.type === "review").status, "completed");
    const storedReview = JSON.parse(values.get(STORAGE.reviewState));
    assert.equal(storedReview.items[0].targetId, "我");
    assert.equal(storedReview.items[0].lastOutcome, "incorrect");
    assert.equal(storedReview.items[0].intervalDays, 1);
  } finally {
    delete globalThis.window;
  }
});

test("correct observations only advance existing review targets", () => {
  const values = new Map([
    [STORAGE.sessions, JSON.stringify([])],
    [STORAGE.errors, JSON.stringify([])],
    [STORAGE.reviewState, JSON.stringify({
      version: 1,
      items: [reviewItem()],
    })],
  ]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
  try {
    assert.equal(savePracticeOutcome(session({
      id: "correct-existing-review",
      date: "2026-08-30T09:00:00+08:00",
    }), [
      { text: "新", code: "us", kind: "correct" },
      { text: "测", code: "imyt", kind: "correct" },
    ]), true);
    const storedReview = JSON.parse(values.get(STORAGE.reviewState));
    assert.deepEqual(storedReview.items.map((item) => item.targetId), ["测"]);
    assert.equal(storedReview.items[0].lastOutcome, "correct");
    assert.equal(storedReview.items[0].intervalDays, 2);
  } finally {
    delete globalThis.window;
  }
});

test("standalone review clears a pending plan whose last item was handled", () => {
  const now = new Date("2026-08-29T09:00:00.000Z");
  const plan = generateDailyTrainingPlan({
    date: "2026-08-29",
    now,
    articles: trainingArticles,
    progress: [],
    sessions: [],
    weakItems: [],
    entries: trainingEntries,
    dueReviewItems: [["测", "imyt", 4]],
    preferredLength: "all",
  });
  const review = plan.tasks.find((task) => task.type === "review");
  review.items = [["测", "imyt", 4]];
  const values = new Map([
    [STORAGE.sessions, JSON.stringify([])],
    [STORAGE.errors, JSON.stringify([])],
    [STORAGE.reviewState, JSON.stringify({ version: 1, items: [reviewItem()] })],
    [STORAGE.trainingPlan, JSON.stringify(plan)],
  ]);
  let failPlanWrite = true;
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        if (key === STORAGE.trainingPlan && failPlanWrite) {
          failPlanWrite = false;
          throw new Error("quota");
        }
        values.set(key, value);
      },
      removeItem: (key) => values.delete(key),
    },
  };
  try {
    const result = session({
      id: "standalone-review",
      type: "review",
      articleId: undefined,
      date: now.toISOString(),
    });
    const observations = [
      { text: "测", code: "imyt", kind: "correct" },
    ];
    const before = new Map(values);
    assert.equal(savePracticeOutcome(result, observations), false);
    assert.deepEqual(values, before);

    assert.equal(savePracticeOutcome(result, observations), true);
    assert.equal(JSON.parse(values.get(STORAGE.trainingPlan)), null);
  } finally {
    delete globalThis.window;
  }
});

test("hesitation outcome atomically saves one idempotent session, weakness and queue", () => {
  const now = new Date("2026-08-19T10:00:00+08:00");
  const target = hesitationTarget();
  const values = new Map([
    [STORAGE.sessions, JSON.stringify([])],
    [STORAGE.errors, JSON.stringify([])],
  ]);
  let failQueueOnce = false;
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        if (key === STORAGE.hesitationQueue && failQueueOnce) {
          failQueueOnce = false;
          throw new Error("quota");
        }
        values.set(key, value);
      },
      removeItem: (key) => values.delete(key),
    },
  };
  try {
    const added = addHesitationQueueItem(target, now);
    const queueId = added.queue.items[0].id;
    assert.ok(startHesitationQueueItem(queueId, now));
    const beforeQueue = values.get(STORAGE.hesitationQueue);
    const result = hesitationSession(target);
    const observations = [
      { text: "练", code: "xan", kind: "coding-error" },
    ];

    failQueueOnce = true;
    assert.equal(
      saveHesitationPracticeOutcome(result, observations, queueId),
      false,
    );
    assert.equal(values.get(STORAGE.sessions), JSON.stringify([]));
    assert.equal(values.get(STORAGE.errors), JSON.stringify([]));
    assert.equal(values.get(STORAGE.hesitationQueue), beforeQueue);

    assert.equal(
      saveHesitationPracticeOutcome(result, observations, queueId),
      true,
    );
    assert.equal(JSON.parse(values.get(STORAGE.sessions)).length, 1);
    assert.equal(JSON.parse(values.get(STORAGE.errors))[0].codingErrors, 1);
    assert.equal(values.has(STORAGE.progress), false);
    const completed = readHesitationQueue(now);
    assert.equal(completed.items[0].status, "completed");
    assert.equal(completed.items[0].sessionId, result.id);
    assert.equal(completed.items[0].outcome, "mastered");
    const storedReview = JSON.parse(values.get(STORAGE.reviewState));
    const hesitationReview = storedReview.items.find(
      (item) => item.targetType === "hesitation",
    );
    assert.equal(hesitationReview.targetId, target.fingerprint);
    assert.equal(hesitationReview.lastOutcome, "correct");
    assert.equal(hesitationReview.intervalDays, 2);

    const restarted = startHesitationQueueItem(queueId, now);
    assert.equal(restarted.items[0].status, "in-progress");
    assert.equal(restarted.items[0].completedAt, undefined);
    assert.equal(restarted.items[0].sessionId, undefined);
    assert.equal(restarted.items[0].outcome, undefined);

    assert.equal(
      saveHesitationPracticeOutcome(result, observations, queueId),
      true,
    );
    assert.equal(JSON.parse(values.get(STORAGE.sessions)).length, 1);
    assert.equal(JSON.parse(values.get(STORAGE.errors))[0].codingErrors, 1);
  } finally {
    delete globalThis.window;
  }
});

test("hesitation outcome rolls back when any participating storage key fails", () => {
  const now = new Date("2026-08-19T10:00:00+08:00");
  const target = hesitationTarget();
  const result = hesitationSession(target);
  const observations = [
    { text: "练", code: "xan", kind: "coding-error" },
  ];

  for (const failedKey of [
    STORAGE.sessions,
    STORAGE.errors,
    STORAGE.reviewState,
    STORAGE.hesitationQueue,
  ]) {
    const values = new Map([
      [STORAGE.sessions, JSON.stringify([])],
      [STORAGE.errors, JSON.stringify([])],
    ]);
    let shouldFail = false;
    globalThis.window = {
      localStorage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
          if (key === failedKey && shouldFail) {
            shouldFail = false;
            throw new Error("quota");
          }
          values.set(key, value);
        },
        removeItem: (key) => values.delete(key),
      },
    };
    const added = addHesitationQueueItem(target, now);
    const queueId = added.queue.items[0].id;
    assert.ok(startHesitationQueueItem(queueId, now));
    const before = new Map(values);
    shouldFail = true;

    assert.equal(
      saveHesitationPracticeOutcome(result, observations, queueId),
      false,
      `expected ${failedKey} to fail`,
    );
    assert.deepEqual(values, before);
  }
  delete globalThis.window;
});

test("hesitation outcome saved across midnight keeps the queue and lands the session", () => {
  const now = new Date("2026-08-19T10:00:00+08:00");
  const target = hesitationTarget();
  const values = new Map([
    [STORAGE.sessions, JSON.stringify([])],
    [STORAGE.errors, JSON.stringify([])],
  ]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
  try {
    const added = addHesitationQueueItem(target, now);
    const queueId = added.queue.items[0].id;
    assert.ok(startHesitationQueueItem(queueId, now));
    const result = hesitationSession(target, {
      date: "2026-08-20T23:35:00+08:00",
    });

    assert.equal(saveHesitationPracticeOutcome(result, [], queueId), true);
    assert.equal(JSON.parse(values.get(STORAGE.sessions)).length, 1);
    const completed = readHesitationQueue(now);
    assert.equal(completed.items[0].status, "completed");
    assert.equal(completed.items[0].sessionId, result.id);
  } finally {
    delete globalThis.window;
  }
});

test("hesitation outcome still saves once the queue has rolled over to a new day", () => {
  const now = new Date("2026-08-19T10:00:00+08:00");
  const nextDay = new Date("2026-08-20T23:30:00+08:00");
  const target = hesitationTarget();
  const values = new Map([
    [STORAGE.sessions, JSON.stringify([])],
    [STORAGE.errors, JSON.stringify([])],
  ]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
  try {
    const added = addHesitationQueueItem(target, now);
    const queueId = added.queue.items[0].id;
    assert.ok(startHesitationQueueItem(queueId, now));
    const rolledOver = readHesitationQueue(nextDay);
    assert.equal(rolledOver.items.length, 0);
    const queueAfterRoll = values.get(STORAGE.hesitationQueue);
    const result = hesitationSession(target, {
      id: "hesitation-result-late",
      date: "2026-08-20T23:35:00+08:00",
    });

    assert.equal(saveHesitationPracticeOutcome(result, [], queueId), true);
    assert.equal(JSON.parse(values.get(STORAGE.sessions)).length, 1);
    assert.equal(values.get(STORAGE.hesitationQueue), queueAfterRoll);
  } finally {
    delete globalThis.window;
  }
});

test("duplicate article progress merges accumulated errors", () => {
  const values = new Map([
    [
      STORAGE.progress,
      JSON.stringify([
        articleProgress({
          attempts: 2,
          bestSpeed: 80,
          errors: 3,
          lastPracticed: "2026-07-29T09:00:00.000Z",
        }),
        articleProgress({
          attempts: 1,
          bestSpeed: 95,
          errors: 5,
          lastPracticed: "2026-07-30T09:00:00.000Z",
        }),
      ]),
    ],
  ]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
  try {
    const progress = getProgress();
    assert.equal(progress.length, 1);
    assert.equal(progress[0].attempts, 3);
    assert.equal(progress[0].errors, 8);
    assert.equal(progress[0].bestSpeed, 95);
    assert.equal(progress[0].lastPracticed, "2026-07-30T09:00:00.000Z");
  } finally {
    delete globalThis.window;
  }
});

test("new phrase opportunities replace mastered records at the storage limit", () => {
  const values = new Map();
  const mastered = Array.from({ length: 120 }, (_, index) => ({
    text: `甲${String.fromCodePoint(0x4e00 + index)}`,
    code: "aaaa",
    characterCount: 2,
    savedKeys: 4,
    opportunityCount: 100,
    practiceCount: 100,
    correctCount: 100,
    lastSeen: "2026-01-01T00:00:00.000Z",
  }));
  values.set(STORAGE.phraseOpportunities, JSON.stringify(mastered));
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => values.delete(key),
      setItem: (key, value) => values.set(key, value),
    },
  };
  try {
    assert.equal(
      recordPhraseOpportunities(
        [{ text: "输入法", code: "lty", characterCount: 3, savedKeys: 2 }],
        "2026-08-24T10:00:00.000Z",
      ),
      true,
    );
    assert.equal(getPhraseOpportunities().length, 120);
    assert.ok(getPhraseOpportunities().some((item) => item.text === "输入法"));
  } finally {
    delete globalThis.window;
  }
});

test("practice sessions and phrase opportunities save atomically", () => {
  const oldSessions = JSON.stringify([session({ id: "old" })]);
  const oldPhrases = JSON.stringify([]);
  const values = new Map([
    [STORAGE.sessions, oldSessions],
    [STORAGE.phraseOpportunities, oldPhrases],
  ]);
  let failPhraseWrite = true;
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => values.delete(key),
      setItem: (key, value) => {
        if (key === STORAGE.phraseOpportunities && failPhraseWrite) {
          failPhraseWrite = false;
          throw new Error("quota");
        }
        values.set(key, value);
      },
    },
  };
  try {
    assert.equal(
      savePracticeOutcome(
        session({ id: "new" }),
        [],
        [{ text: "输入法", code: "lty", characterCount: 3, savedKeys: 2 }],
      ),
      false,
    );
    assert.equal(values.get(STORAGE.sessions), oldSessions);
    assert.equal(values.get(STORAGE.phraseOpportunities), oldPhrases);
    assert.equal(
      savePracticeOutcome(
        session({ id: "phrase-round", type: "review" }),
        [],
        [],
        [{ entry: ["效率", "uj", 0], correct: false }],
      ),
      true,
    );
    assert.equal(getPhraseOpportunities()[0].text, "效率");
    assert.equal(getPhraseOpportunities()[0].practiceCount, 1);
  } finally {
    delete globalThis.window;
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

test("saving after article progress repair updates the sole record", () => {
  const values = new Map([[
    STORAGE.progress,
    JSON.stringify([
      articleProgress({ attempts: 2, bestSpeed: 90, errors: 7 }),
      articleProgress({
        attempts: 3,
        bestSpeed: 120,
        completed: true,
        lastPracticed: "2026-08-02T09:00:00.000Z",
        errors: 2,
      }),
    ]),
  ]]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
  try {
    assert.equal(saveSession(session({
      id: "progress-after-repair",
      articleId: "article-a",
      date: "2026-09-01T09:00:00.000Z",
      speed: 110,
      errors: 4,
    })), true);
    assert.deepEqual(JSON.parse(values.get(STORAGE.progress)), [{
      articleId: "article-a",
      attempts: 6,
      bestSpeed: 120,
      completed: true,
      lastPracticed: "2026-09-01T09:00:00.000Z",
      errors: 13,
    }]);
  } finally {
    delete globalThis.window;
  }
});

test("article progress repair discards invalid rows and bounds oversized data", () => {
  const records = Array.from({ length: 500 }, (_, index) => articleProgress({
    articleId: `article-${index}`,
  }));
  records.push(
    articleProgress({ articleId: "invalid-date", lastPracticed: "not-a-date" }),
    articleProgress({ articleId: "invalid-attempts", attempts: -1 }),
    articleProgress({ articleId: "article-0", attempts: 1_000_000 }),
    articleProgress({ articleId: "ignored-extra-article" }),
  );
  const values = new Map([[STORAGE.progress, JSON.stringify(records)]]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
  try {
    const repaired = getProgress();
    assert.equal(repaired.length, 500);
    assert.equal(repaired.some((item) => item.articleId === "invalid-date"), false);
    assert.equal(repaired.some((item) => item.articleId === "invalid-attempts"), false);
    assert.equal(repaired.some((item) => item.articleId === "ignored-extra-article"), false);
    assert.equal(repaired.find((item) => item.articleId === "article-0").attempts, 1_000_000);
    assert.deepEqual(JSON.parse(values.get(STORAGE.progress)), repaired);
  } finally {
    delete globalThis.window;
  }
});

test("failed article progress repair preserves the original stored value", () => {
  const raw = JSON.stringify([
    articleProgress({ attempts: 2 }),
    articleProgress({ attempts: 3 }),
  ]);
  const values = new Map([[STORAGE.progress, raw]]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: (key) => values.delete(key),
    },
  };
  try {
    assert.deepEqual(getProgress(), [articleProgress({ attempts: 5, errors: 6 })]);
    assert.equal(values.get(STORAGE.progress), raw);
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

test("clearing practice history rolls back every key after storage failure", () => {
  const keys = [
    STORAGE.sessions,
    STORAGE.progress,
    STORAGE.errors,
    STORAGE.phraseOpportunities,
    STORAGE.trainingPlan,
    STORAGE.hesitationQueue,
    STORAGE.advancedSeason,
    STORAGE.reviewState,
  ];
  const values = new Map(keys.map((key, index) => [key, `old-${index}`]));
  const before = new Map(values);
  let failOnce = true;
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => values.delete(key),
      setItem: (key, value) => {
        if (key === STORAGE.errors && failOnce) {
          failOnce = false;
          throw new Error("denied");
        }
        values.set(key, value);
      },
    },
  };
  try {
    assert.equal(clearPracticeHistory(), false);
    assert.deepEqual(values, before);
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

test("duplicate error entries merge mastery by keeping the higher stage", () => {
  const values = new Map([
    [
      STORAGE.errors,
      JSON.stringify([
        {
          text: "数",
          code: "ovg",
          count: 2,
          lastSeen: "2026-07-29T09:00:00.000Z",
          mastery: 3,
        },
        {
          text: "数",
          code: "ovg",
          count: 1,
          lastSeen: "2026-07-28T09:00:00.000Z",
          mastery: 2,
        },
      ]),
    ],
  ]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
  try {
    const errors = getErrors();
    assert.equal(errors.length, 1);
    assert.equal(errors[0].mastery, 3);
    assert.equal(errors[0].count, 3);
  } finally {
    delete globalThis.window;
  }
});

test("duplicate progress sums attempts and errors, keeps best speed and completion", () => {
  const raw = JSON.stringify([
    articleProgress({
      attempts: 2,
      bestSpeed: 90,
      errors: 7,
    }),
    articleProgress({
      attempts: 3,
      bestSpeed: 120,
      completed: true,
      lastPracticed: "2026-08-02T09:00:00.000Z",
      errors: 2,
    }),
  ]);
  const values = new Map([[STORAGE.progress, raw]]);
  let progressWrites = 0;
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        if (key === STORAGE.progress) progressWrites += 1;
        values.set(key, value);
      },
      removeItem: (key) => values.delete(key),
    },
  };
  try {
    const expected = [{
      articleId: "article-a",
      attempts: 5,
      bestSpeed: 120,
      completed: true,
      lastPracticed: "2026-08-02T09:00:00.000Z",
      errors: 9,
    }];
    assert.deepEqual(getProgress(), expected);
    assert.deepEqual(JSON.parse(values.get(STORAGE.progress)), expected);
    assert.equal(progressWrites, 1);

    assert.deepEqual(getProgress(), expected);
    assert.equal(progressWrites, 1);
  } finally {
    delete globalThis.window;
  }
});

test("practice completion notifies only after a successful new save, including retry", () => {
  const values = new Map();
  const events = [];
  let fail = true;
  globalThis.window = {
    dispatchEvent: (event) => { events.push(event); return true; },
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        if (fail) throw new Error("quota");
        values.set(key, value);
      },
      removeItem: (key) => values.delete(key),
    },
  };
  try {
    const result = session();
    assert.equal(savePracticeOutcome(result), false);
    assert.equal(events.length, 0);
    fail = false;
    assert.equal(savePracticeOutcome(result), true);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "wubi:practice-saved");
    assert.equal(events[0].detail.sessionId, result.id);
    assert.equal(savePracticeOutcome(result), true);
    assert.equal(events.length, 1);
  } finally {
    delete globalThis.window;
  }
});
