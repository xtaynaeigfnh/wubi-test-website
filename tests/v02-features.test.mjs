import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

import {
  addHesitationQueueItem,
  addError,
  buildReviewPool,
  buildRootPool,
  buildTrendSeries,
  buildCustomArticle,
  calculateDailyProgress,
  calculateStreak,
  createBackupPayload,
  defaultCustomTheme,
  getErrors,
  getPhraseOpportunities,
  getProgress,
  getSessions,
  parseBackupPayload,
  readHesitationQueue,
  readDailyGoal,
  readSettings,
  recordKeyUsage,
  recordPhraseOpportunities,
  recordPhrasePractice,
  restoreBackupPayload,
  saveHesitationPracticeOutcome,
  savePracticeOutcome,
  saveSession,
  STORAGE,
  startHesitationQueueItem,
  updateErrorMastery,
} from "../app/lib.ts";
import {
  applyWeakObservations,
  buildTrainingSummary,
  generateDailyTrainingPlan,
  regenerateIncompleteTasks,
  scoreWeakItem,
} from "../app/training-plan.ts";

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

function hesitationTarget(overrides = {}) {
  const target = {
    version: 1,
    id: "hesitation-target-a",
    sourceSessionId: "article-source",
    articleId: "article-a",
    sourceTitle: "练习文章甲",
    sourceDate: "2026-08-19T09:00:00+08:00",
    text: "五笔输入练习需要稳定节奏",
    sourceStart: 3,
    focusOffset: 4,
    focusLength: 2,
    sourceDelayMs: 2100,
    baselineMs: 500,
    thresholdMs: 1000,
    ...overrides,
  };
  return {
    ...target,
    fingerprint:
      overrides.fingerprint ??
      `${target.text}\u0000${target.focusOffset}\u0000${target.focusLength}`,
  };
}

function hesitationResult(target = hesitationTarget(), overrides = {}) {
  const completedAt = "2026-08-19T10:03:00+08:00";
  return {
    version: 1,
    target,
    attempts: [
      {
        round: 1,
        durationMs: 9000,
        errorIndexes: [4],
        delaysMs: Array.from({ length: 12 }, () => 700),
        completedAt: "2026-08-19T10:01:00+08:00",
      },
      {
        round: 2,
        durationMs: 7800,
        errorIndexes: [],
        delaysMs: Array.from({ length: 12 }, () => 600),
        completedAt: "2026-08-19T10:02:00+08:00",
      },
      {
        round: 3,
        durationMs: 7000,
        errorIndexes: [],
        delaysMs: Array.from({ length: 12 }, () => 500),
        completedAt,
      },
    ],
    outcome: "mastered",
    completedAt,
    ...overrides,
  };
}

function hesitationSession(target = hesitationTarget(), overrides = {}) {
  return session({
    id: "hesitation-result",
    type: "hesitation",
    articleId: target.articleId,
    title: "卡顿片段三连练",
    date: "2026-08-19T10:03:00+08:00",
    durationSeconds: 23.8,
    correctChars: 35,
    attemptedChars: 36,
    speed: 103,
    kps: 0,
    codeLength: 0,
    accuracy: 97.2,
    errors: 1,
    hesitationPractice: hesitationResult(target),
    ...overrides,
  });
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

test("daily goals normalize legacy decimal values before backup", () => {
  const values = new Map([
    [
      STORAGE.dailyGoal,
      JSON.stringify({
        targetChars: 500.5,
        targetMinutes: 15.4,
        targetRounds: 2.2,
      }),
    ],
  ]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
    },
  };
  try {
    const normalized = readDailyGoal();
    assert.deepEqual(normalized, {
      targetChars: 501,
      targetMinutes: 15,
      targetRounds: 2,
    });
    assert.deepEqual(
      parseBackupPayload(
        createBackupPayload({ [STORAGE.dailyGoal]: normalized }),
      ).data[STORAGE.dailyGoal],
      normalized,
    );
  } finally {
    delete globalThis.window;
  }
});

const trainingEntries = [
  ["我", "q", 1477224452],
  ["人", "w", 850000],
  ["中", "k", 800000],
  ["国", "l", 780000],
  ["一", "g", 760000],
  ["上", "h", 740000],
  ["学", "i", 720000],
  ["习", "n", 700000],
  ["文", "y", 680000],
  ["字", "p", 660000],
  ["打", "r", 640000],
  ["输", "lwg", 620000],
  ["法", "ifc", 600000],
  ["练", "xan", 580000],
  ["速", "gkip", 560000],
  ["度", "yac", 540000],
];

const trainingArticles = [
  {
    id: "article-a",
    title: "练习文章甲",
    length: "short",
    topic: "测试",
    wordCount: 100,
    version: 1,
    text: "我们练习中文输入法。",
  },
  {
    id: "article-b",
    title: "练习文章乙",
    length: "short",
    topic: "测试",
    wordCount: 120,
    version: 1,
    text: "打字速度需要稳定训练。",
  },
];

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
        customTheme: defaultCustomTheme,
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
  const validCustomText = buildCustomArticle(
    "custom-valid",
    "合法文章",
    "这是至少十个字符的自定义正文。",
  );
  assert.ok(validCustomText);
  assert.deepEqual(
    parseBackupPayload(
      createBackupPayload({ [STORAGE.customTexts]: [validCustomText] }),
    ).data[STORAGE.customTexts],
    [validCustomText],
  );
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
  for (const customText of [
    {
      id: "custom-empty",
      title: "空文章",
      length: "short",
      topic: "自定义",
      wordCount: 0,
      version: 1,
      text: "",
      kind: "custom",
    },
    {
      id: "custom-wrong-count",
      title: "计数错误",
      length: "short",
      topic: "自定义",
      wordCount: 1,
      version: 1,
      text: "这是至少十个字符的自定义正文。",
      kind: "custom",
    },
  ]) {
    assert.throws(
      () =>
        parseBackupPayload(
          createBackupPayload({ [STORAGE.customTexts]: [customText] }),
        ),
      /格式不正确/,
    );
  }
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
      customTheme: defaultCustomTheme,
      autoNext: false,
    },
  );
});

test("backup validates daily prescriptions and old restores clear stale plans", () => {
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
  const payload = createBackupPayload({ [STORAGE.trainingPlan]: plan });
  assert.deepEqual(parseBackupPayload(payload).data[STORAGE.trainingPlan], plan);
  assert.throws(
    () => parseBackupPayload(createBackupPayload({
      [STORAGE.trainingPlan]: { ...plan, tasks: plan.tasks.slice(0, 2) },
    })),
    /格式不正确/,
  );

  const staleQueue = {
    version: 1,
    date: "2026-08-19",
    items: [{
      id: "hesitation-target-a",
      target: hesitationTarget(),
      status: "pending",
      estimatedMinutes: 1,
      addedAt: "2026-08-19T10:00:00+08:00",
    }],
  };
  const values = new Map([
    [STORAGE.trainingPlan, JSON.stringify(plan)],
    [STORAGE.hesitationQueue, JSON.stringify(staleQueue)],
  ]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
  try {
    restoreBackupPayload(createBackupPayload({ [STORAGE.errors]: [] }));
    assert.equal(values.has(STORAGE.trainingPlan), false);
    assert.equal(values.has(STORAGE.hesitationQueue), false);
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

test("backup strictly validates hesitation queues without changing version two", () => {
  const queue = {
    version: 1,
    date: "2026-08-19",
    items: [{
      id: "hesitation-target-a",
      target: hesitationTarget(),
      status: "pending",
      estimatedMinutes: 1,
      addedAt: "2026-08-19T10:00:00+08:00",
    }],
  };
  const payload = createBackupPayload({ [STORAGE.hesitationQueue]: queue });
  assert.equal(payload.version, 2);
  assert.deepEqual(
    parseBackupPayload(payload).data[STORAGE.hesitationQueue],
    queue,
  );
  assert.throws(
    () => parseBackupPayload(createBackupPayload({
      [STORAGE.hesitationQueue]: {
        ...queue,
        items: [{
          ...queue.items[0],
          target: { ...hesitationTarget(), text: "一二三四五六七八九十甲乙丙丁戊己" },
        }],
      },
    })),
    /\u683c\u5f0f\u4e0d\u6b63\u786e/,
  );
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

test("settings read old and new themes while normalizing custom colors", () => {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
    },
  };
  try {
    for (const theme of [
      "system",
      "light",
      "dark",
      "bamboo",
      "qingdai",
    ]) {
      values.set(STORAGE.settings, JSON.stringify({ theme }));
      assert.equal(readSettings().theme, theme);
      assert.deepEqual(readSettings().customTheme, defaultCustomTheme);
    }

    values.set(
      STORAGE.settings,
      JSON.stringify({
        fontSize: 34,
        theme: "custom",
        customTheme: { accent: "#12aBcF", canvas: "not-a-color" },
      }),
    );
    assert.deepEqual(readSettings(), {
      fontSize: 34,
      preferredLength: "all",
      showCodeHints: false,
      sound: false,
      theme: "custom",
      customTheme: {
        accent: "#12aBcF",
        canvas: defaultCustomTheme.canvas,
      },
      autoNext: false,
    });

    values.set(
      STORAGE.settings,
      JSON.stringify({ theme: "unknown", customTheme: null }),
    );
    assert.equal(readSettings().theme, "system");
    assert.deepEqual(readSettings().customTheme, defaultCustomTheme);
  } finally {
    delete globalThis.window;
  }
});

test("backup settings preserve valid custom themes and repair invalid theme fields", () => {
  const valid = parseBackupPayload(
    createBackupPayload({
      [STORAGE.settings]: {
        theme: "custom",
        customTheme: { accent: "#123ABC", canvas: "#abcdef" },
      },
    }),
  ).data[STORAGE.settings];
  assert.deepEqual(valid.customTheme, {
    accent: "#123ABC",
    canvas: "#abcdef",
  });
  assert.equal(valid.theme, "custom");

  const oldBackup = parseBackupPayload(
    createBackupPayload({ [STORAGE.settings]: { theme: "bamboo" } }),
  ).data[STORAGE.settings];
  assert.equal(oldBackup.theme, "bamboo");
  assert.deepEqual(oldBackup.customTheme, defaultCustomTheme);

  const repaired = parseBackupPayload(
    createBackupPayload({
      [STORAGE.settings]: {
        fontSize: 36,
        theme: "unsupported",
        customTheme: { accent: "#445566", canvas: "#fff" },
      },
    }),
  ).data[STORAGE.settings];
  assert.equal(repaired.fontSize, 36);
  assert.equal(repaired.theme, "system");
  assert.deepEqual(repaired.customTheme, {
    accent: "#445566",
    canvas: defaultCustomTheme.canvas,
  });
});

test("backup restore saves normalized custom theme settings", () => {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => values.delete(key),
      setItem: (key, value) => values.set(key, value),
    },
  };
  try {
    restoreBackupPayload(
      createBackupPayload({
        [STORAGE.settings]: {
          theme: "custom",
          customTheme: { accent: "invalid", canvas: "#202830" },
        },
      }),
    );
    const restored = JSON.parse(values.get(STORAGE.settings));
    assert.equal(restored.theme, "custom");
    assert.deepEqual(restored.customTheme, {
      accent: defaultCustomTheme.accent,
      canvas: "#202830",
    });
  } finally {
    delete globalThis.window;
  }
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

test("phrase opportunities stay bounded, survive backup validation, and track practice", () => {
  const values = new Map();
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
        [
          { text: "输入法", code: "lwy", characterCount: 3, savedKeys: 5 },
          { text: "练习", code: "xanu", characterCount: 2, savedKeys: 2 },
          { text: "无效五字词", code: "abcd", characterCount: 5, savedKeys: 9 },
        ],
        "2026-08-24T09:00:00.000Z",
      ),
      true,
    );
    assert.equal(recordPhrasePractice("输入法", true), true);
    assert.equal(recordPhrasePractice(["效率", "uj", 0], false), true);
    const stored = getPhraseOpportunities();
    assert.equal(stored.length, 3);
    assert.equal(stored.find((item) => item.text === "效率").practiceCount, 1);
    assert.deepEqual(
      stored.find((item) => item.text === "输入法"),
      {
        text: "输入法",
        code: "lwy",
        characterCount: 3,
        savedKeys: 5,
        opportunityCount: 1,
        practiceCount: 1,
        correctCount: 1,
        lastSeen: stored.find((item) => item.text === "输入法").lastSeen,
      },
    );
    const payload = createBackupPayload({
      [STORAGE.phraseOpportunities]: stored,
    });
    assert.deepEqual(parseBackupPayload(payload), payload);
    assert.throws(
      () =>
        parseBackupPayload(
          createBackupPayload({
            [STORAGE.phraseOpportunities]: [
              { ...stored[0], opportunityCount: -1 },
            ],
          }),
        ),
      /格式不正确/,
    );
    assert.throws(
      () =>
        parseBackupPayload(
          createBackupPayload({
            [STORAGE.phraseOpportunities]: [stored[0], { ...stored[0] }],
          }),
        ),
      /格式不正确/,
    );
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

test("old backups clear phrase opportunities and UTF-8 byte limits are enforced", () => {
  const oversized = createBackupPayload({
    [STORAGE.sessions]: Array.from({ length: 20 }, (_, index) =>
      session({
        id: `large-${index}`,
        errorChars: Array.from({ length: 5000 }, () => "错错错错错错错错"),
      }),
    ),
  });
  assert.throws(() => parseBackupPayload(oversized), /备份文件过大/);

  const values = new Map([
    [STORAGE.phraseOpportunities, JSON.stringify([{
      text: "输入法",
      code: "lty",
      characterCount: 3,
      savedKeys: 2,
      opportunityCount: 1,
      practiceCount: 0,
      correctCount: 0,
      lastSeen: "2026-08-24T09:00:00.000Z",
    }])],
  ]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => values.delete(key),
      setItem: (key, value) => values.set(key, value),
    },
  };
  try {
    restoreBackupPayload(createBackupPayload({ [STORAGE.errors]: [] }));
    assert.equal(values.has(STORAGE.phraseOpportunities), false);
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
  assert.match(worker, /wubi-test-v10/);
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
});

test("build lifecycle stays cross-platform and project-rooted", async () => {
  const [packageText, viteConfig, nextConfig] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageText);

  assert.equal(packageJson.scripts.dev, "vinext dev");
  assert.equal(packageJson.scripts.build, "vinext build");
  assert.equal(packageJson.scripts.start, "vinext start");
  assert.equal(packageJson.scripts.typecheck, "next typegen && tsc --noEmit");
  assert.ok(
    viteConfig.indexOf("process.env.WRANGLER_LOG_PATH ??=") <
      viteConfig.indexOf('await import("@cloudflare/vite-plugin")'),
  );
  assert.match(nextConfig, /turbopack:\s*\{\s*root: process\.cwd\(\)/);
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
  assert.match(training, /自适应训练处方/);
  assert.match(training, /换一组/);
  assert.match(training, /待开始/);
  assert.match(training, /进行中/);
  assert.match(training, /已完成/);
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
