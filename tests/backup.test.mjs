import assert from "node:assert/strict";
import test from "node:test";

import {
  getPhraseOpportunities,
  recordKeyUsage,
  recordPhraseOpportunities,
  recordPhrasePractice,
} from "../app/practice-store.ts";
import { readDailyGoal } from "../app/lib.ts";
import {
  createBackupPayload,
  parseBackupPayload,
  readLocalForBackup,
  restoreBackupPayload,
} from "../app/backup.ts";
import {
  buildCustomArticle,
  defaultCustomTheme,
  MAX_SPACED_REVIEW_STATE_BYTES,
} from "../app/practice-schema.ts";
import { STORAGE } from "../app/storage.ts";
import { isOnboardingProgress, reconcileOnboarding } from "../app/onboarding.ts";
import { buildBaseline } from "../app/onboarding-baseline.ts";

test("短测缺失或重复成绩不会伪造完整基线，缺少按键不推荐码长", () => {
  const rows = ["a", "b", "c"].map((id) => ({ ...session, id, type: "article", durationSeconds: 30, attemptedChars: 20, speed: 40, accuracy: 99, codeLength: 5, keyCount: 0 }));
  const progress = { version: 1, status: "active", sessionIds: ["a", "b", "c"] };
  assert.equal(buildBaseline(rows.slice(0, 2), progress), null);
  assert.equal(buildBaseline(rows, { ...progress, sessionIds: ["a", "a", "c"] }), null);
  assert.equal(buildBaseline(rows, progress).metric, "speed");
  assert.equal(buildBaseline(rows.map((r) => ({ ...r, accuracy: 80 })), progress).metric, "characterAccuracy");
  assert.equal(buildBaseline(rows.map((r) => ({ ...r, keyCount: 100 })), progress).metric, "codeLength");
});

test("引导进度可备份恢复并拒绝重复成绩和异常日期", () => {
  const progress = { version: 1, status: "active", sessionIds: ["a", "b", "c"], startedAt: "2026-09-20T00:00:00.000Z" };
  const payload = createBackupPayload({ [STORAGE.onboarding]: progress });
  assert.deepEqual(parseBackupPayload(payload).data[STORAGE.onboarding], progress);
  for (const invalid of [ { ...progress, sessionIds: ["a", "a", "c"] }, { ...progress, startedAt: "bad" }, { ...progress, sessionIds: ["a", "b", "c", "d"] }, { ...progress, goalMetric: "unknown" } ]) {
    assert.equal(isOnboardingProgress(invalid), false);
    assert.throws(() => parseBackupPayload(createBackupPayload({ [STORAGE.onboarding]: invalid })));
  }
  assert.doesNotThrow(() => parseBackupPayload(createBackupPayload({})));
  const previousWindow = globalThis.window;
  const stored = new Map();
  globalThis.window = { localStorage: { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: (key) => stored.delete(key) } };
  try {
    restoreBackupPayload(payload);
    assert.deepEqual(JSON.parse(stored.get(STORAGE.onboarding)), progress);
    restoreBackupPayload(createBackupPayload({}));
    assert.equal(stored.has(STORAGE.onboarding), false);
  } finally { globalThis.window = previousWindow; }
});
import { generateDailyTrainingPlan } from "../app/training-plan.ts";
import {
  articleProgress,
  hesitationTarget,
  reviewItem,
  session,
  trainingArticles,
  trainingEntries,
} from "./v02-fixtures.mjs";

test("backup reads distinguish missing, damaged, and inaccessible local data", () => {
  globalThis.window = {
    localStorage: {
      getItem: (key) =>
        key === "missing"
          ? null
          : key === "damaged"
            ? "{"
            : key === STORAGE.dailyGoal
              ? JSON.stringify({
                  targetChars: 500.5,
                  targetMinutes: 15.4,
                  targetRounds: 2.2,
                })
              : JSON.stringify({ ok: true }),
    },
  };
  try {
    assert.deepEqual(readLocalForBackup("valid"), { ok: true });
    assert.equal(readLocalForBackup("missing"), null);
    assert.throws(() => readLocalForBackup("damaged"), /本机数据已损坏/);
    assert.deepEqual(readLocalForBackup(STORAGE.dailyGoal), {
      targetChars: 501,
      targetMinutes: 15,
      targetRounds: 2,
    });
    window.localStorage.getItem = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    assert.throws(() => readLocalForBackup("valid"), /浏览器拒绝读取/);
  } finally {
    delete globalThis.window;
  }
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

test("backup format only accepts known versioned storage keys", () => {
  const payload = createBackupPayload(
    {
      [STORAGE.sessions]: [session()],
      [STORAGE.settings]: {
        petEnabled: true,
        petSpecies: "cat",
        fontSize: 30,
        preferredLength: "all",
        showCodeHints: false,
        showGhostGap: true,
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
      parseBackupPayload(
        createBackupPayload({
          [STORAGE.customTexts]: [validCustomText, validCustomText],
        }),
      ),
    /格式不正确/,
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
      petEnabled: false,
      petSpecies: "cat",
      fontSize: 30,
      preferredLength: "all",
      showCodeHints: false,
      showGhostGap: true,
      sound: false,
      theme: "dark",
      customTheme: defaultCustomTheme,
      autoNext: false,
    },
  );
});

test("spaced review state is versioned, bounded and strictly validated in backups", () => {
  const state = { version: 1, items: [reviewItem()] };
  const payload = createBackupPayload({ [STORAGE.reviewState]: state });
  assert.deepEqual(parseBackupPayload(payload).data[STORAGE.reviewState], state);
  assert.throws(
    () => parseBackupPayload(createBackupPayload({
      [STORAGE.reviewState]: {
        version: 1,
        items: [reviewItem(), reviewItem({ dueAt: "2026-08-30T00:00:00.000Z" })],
      },
    })),
    /格式不正确/,
  );
  for (const invalid of [
    { ...state, version: 2 },
    { version: 1, items: [reviewItem({ dueAt: "not-a-date" })] },
    { version: 1, items: [reviewItem({ intervalDays: 0 })] },
    { version: 1, items: [reviewItem({ targetType: "phrase", text: "单" })] },
  ]) {
    assert.throws(
      () => parseBackupPayload(createBackupPayload({ [STORAGE.reviewState]: invalid })),
      /格式不正确/,
    );
  }
  const tooMany = {
    version: 1,
    items: Array.from({ length: 361 }, (_, index) =>
      reviewItem({ targetId: `字-${index}`, text: String.fromCodePoint(0x4e00 + index) }),
    ),
  };
  assert.throws(
    () => parseBackupPayload(createBackupPayload({ [STORAGE.reviewState]: tooMany })),
    /格式不正确/,
  );

  const largeTarget = {
    version: 1,
    id: "target-id",
    fingerprint: "片".repeat(500),
    sourceSessionId: "session-id",
    sourceTitle: "来".repeat(200),
    sourceDate: "2026-08-29T00:00:00.000Z",
    text: "一二三四五六七八九十甲乙丙丁戊",
    sourceStart: 0,
    focusOffset: 0,
    focusLength: 1,
    sourceDelayMs: 2000,
    baselineMs: 500,
    thresholdMs: 1000,
  };
  const oversized = {
    version: 1,
    items: Array.from({ length: 360 }, (_, index) =>
      reviewItem({
        targetType: "hesitation",
        targetId: `${index}-${"片".repeat(490)}`,
        text: largeTarget.text,
        code: undefined,
        hesitationTarget: {
          ...largeTarget,
          id: `target-${index}`,
          fingerprint: `${index}-${"段".repeat(490)}`,
        },
      }),
    ),
  };
  assert.ok(Buffer.byteLength(JSON.stringify(oversized), "utf8") > MAX_SPACED_REVIEW_STATE_BYTES);
  assert.throws(
    () => parseBackupPayload(createBackupPayload({ [STORAGE.reviewState]: oversized })),
    /格式不正确/,
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

  const invalidPlans = [
    (candidate) => {
      delete candidate.tasks.find((task) => task.type === "article").articleId;
    },
    (candidate) => {
      candidate.tasks.find((task) => task.type === "review").items = [];
    },
    (candidate) => {
      delete candidate.tasks.find((task) => task.type === "roots").zoneKeys;
    },
    (candidate) => {
      candidate.tasks[0].startedAt = "2026-08-19T10:01:00.000Z";
    },
    (candidate) => {
      candidate.tasks[1].status = "in-progress";
    },
    (candidate) => {
      candidate.tasks[2].status = "completed";
      candidate.tasks[2].startedAt = "2026-08-19T10:02:00.000Z";
      candidate.tasks[2].completedAt = "2026-08-19T10:01:00.000Z";
      candidate.tasks[2].sessionId = "roots-session";
    },
  ];
  for (const corrupt of invalidPlans) {
    const candidate = structuredClone(plan);
    corrupt(candidate);
    assert.throws(
      () => parseBackupPayload(createBackupPayload({ [STORAGE.trainingPlan]: candidate })),
      /格式不正确/,
    );
  }

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
    [STORAGE.sessions, JSON.stringify([session({ id: "stale-session" })])],
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
    assert.equal(values.has(STORAGE.sessions), false);
    assert.equal(values.has(STORAGE.trainingPlan), false);
    assert.equal(values.has(STORAGE.hesitationQueue), false);
  } finally {
    delete globalThis.window;
  }
});

test("backup accepts optional weakness first-seen dates and rejects malformed values", () => {
  const legacy = {
    text: "旧",
    code: "hjx",
    count: 2,
    lastSeen: "2026-08-20T09:00:00.000Z",
  };
  const current = {
    ...legacy,
    text: "新",
    code: "us",
    firstSeen: "2026-08-24T09:00:00.000Z",
    lastSeen: "2026-08-25T09:00:00.000Z",
  };
  const payload = createBackupPayload({ [STORAGE.errors]: [legacy, current] });
  assert.deepEqual(parseBackupPayload(payload).data[STORAGE.errors], [legacy, current]);
  assert.throws(
    () => parseBackupPayload(createBackupPayload({
      [STORAGE.errors]: [{ ...current, firstSeen: "not-a-date" }],
    })),
    /格式不正确/,
  );
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

test("backup accepts old sessions and strictly validates compressed ghost timelines", () => {
  const oldPayload = createBackupPayload({
    [STORAGE.sessions]: [session({ id: "pre-v05" })],
  });
  assert.equal(parseBackupPayload(oldPayload).version, 2);

  const ghostTimeline = {
    version: 1,
    articleKey: "builtin:short-001",
    articleVersion: 2,
    contentFingerprint: "10-example",
    characterCount: 10,
    step: 5,
    samples: [[5, 1000], [10, 2000]],
  };
  const payload = createBackupPayload({
    [STORAGE.sessions]: [session({ id: "v05", durationSeconds: 2, ghostTimeline })],
  });
  assert.deepEqual(
    parseBackupPayload(payload).data[STORAGE.sessions][0].ghostTimeline,
    ghostTimeline,
  );

  for (const invalidTimeline of [
    { ...ghostTimeline, samples: [[5, 1000], [5, 2000], [10, 3000]] },
    { ...ghostTimeline, samples: [[5, 2000], [10, 1000]] },
    { ...ghostTimeline, samples: [[5, 1000]] },
    { ...ghostTimeline, samples: [[5, -1], [10, 2000]] },
    { ...ghostTimeline, articleVersion: 0 },
    { ...ghostTimeline, articleKey: "unknown:short-001" },
    { ...ghostTimeline, step: 4 },
    { ...ghostTimeline, samples: [[5, 1000], [10, 8000]] },
  ]) {
    assert.throws(() =>
      parseBackupPayload(
        createBackupPayload({
          [STORAGE.sessions]: [session({ ghostTimeline: invalidTimeline })],
        }),
      ),
    );
  }
  assert.throws(() =>
    parseBackupPayload(
      createBackupPayload({
        [STORAGE.sessions]: [
          session({ type: "review", durationSeconds: 2, ghostTimeline }),
        ],
      }),
    ),
  );
});

test("backup rejects noncanonical ghost retention and duplicate session IDs", () => {
  const makeTimeline = (articleIndex) => ({
    version: 1,
    articleKey: `builtin:article-${articleIndex}`,
    articleVersion: 1,
    contentFingerprint: `10-item${articleIndex}`,
    characterCount: 10,
    step: 5,
    samples: [[5, 1000], [10, 2000]],
  });
  const tooMany = Array.from({ length: 91 }, (_, index) =>
    session({
      id: `ghost-${index}`,
      date: new Date(Date.UTC(2026, 7, 1, 0, index)).toISOString(),
      durationSeconds: 2,
      ghostTimeline: makeTimeline(index),
    }),
  );
  assert.throws(() =>
    parseBackupPayload(
      createBackupPayload({ [STORAGE.sessions]: tooMany }),
    ),
  );

  const sameArticle = Array.from({ length: 4 }, (_, index) =>
    session({
      id: `same-${index}`,
      date: new Date(Date.UTC(2026, 7, 20 + index)).toISOString(),
      durationSeconds: 2 + index,
      speed: 100 - index,
      ghostTimeline: {
        ...makeTimeline("same"),
        samples: [[5, 1000], [10, (2 + index) * 1000]],
      },
    }),
  );
  assert.throws(() =>
    parseBackupPayload(
      createBackupPayload({ [STORAGE.sessions]: sameArticle }),
    ),
  );
  assert.throws(() =>
    parseBackupPayload(
      createBackupPayload({
        [STORAGE.sessions]: [
          session({ id: "duplicate" }),
          session({ id: "duplicate" }),
        ],
      }),
    ),
  );
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

test("backup rejects duplicate article progress without touching local storage", () => {
  const values = new Map([
    [STORAGE.settings, JSON.stringify({ theme: "light" })],
    [STORAGE.progress, JSON.stringify([articleProgress()])],
  ]);
  const before = new Map(values);
  let writes = 0;
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        writes += 1;
        values.set(key, value);
      },
      removeItem: (key) => {
        writes += 1;
        values.delete(key);
      },
    },
  };
  try {
    const duplicate = articleProgress({
      attempts: 2,
      lastPracticed: "2026-08-01T09:00:00.000Z",
    });
    const payload = createBackupPayload({
      [STORAGE.progress]: [articleProgress(), duplicate],
    });
    assert.throws(() => parseBackupPayload(payload), /格式不正确/);
    assert.throws(() => restoreBackupPayload(payload), /格式不正确/);
    assert.deepEqual(values, before);
    assert.equal(writes, 0);
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

test("pet preferences round trip through backups and old settings gain defaults", () => {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
  try {
    values.set(STORAGE.settings, JSON.stringify({ theme: "dark" }));
    const old = parseBackupPayload(createBackupPayload({ [STORAGE.settings]: readLocalForBackup(STORAGE.settings) })).data[STORAGE.settings];
    assert.equal(old.petEnabled, false);
    assert.equal(old.petSpecies, "cat");
    values.set(STORAGE.settings, JSON.stringify({ ...old, petEnabled: false, petSpecies: "rabbit" }));
    const backup = createBackupPayload({ [STORAGE.settings]: readLocalForBackup(STORAGE.settings) });
    const parsed = parseBackupPayload(backup);
    values.clear();
    restoreBackupPayload(parsed);
    assert.equal(readLocalForBackup(STORAGE.settings).petSpecies, "rabbit");
    assert.equal(readLocalForBackup(STORAGE.settings).petEnabled, false);
    for (const invalid of [{ ...old, petEnabled: 1 }, { ...old, petSpecies: "dragon" }, { ...old, petSpecies: ["cat"] }]) {
      values.set(STORAGE.settings, JSON.stringify(invalid));
      assert.throws(() => parseBackupPayload(createBackupPayload({ [STORAGE.settings]: readLocalForBackup(STORAGE.settings) })));
    }
  } finally {
    delete globalThis.window;
  }
});


test("首次进入展示引导，已有成绩、关闭或跳过后不自动打扰", () => {
  assert.equal(reconcileOnboarding(null, []).open, true);
  assert.equal(reconcileOnboarding(null, [session]).open, false);
  for (const status of ["skipped", "completed"]) {
    const progress = { version: 1, status, sessionIds: [] };
    assert.deepEqual(reconcileOnboarding(progress, []), { progress, open: false });
    assert.equal(reconcileOnboarding(progress, [session]).open, false);
  }
});

test("短测保存或刷新恢复后展示下一步，重复刷新和开始下一段不重新弹出", () => {
  let progress = { version: 1, status: "active", startedAt: "2026-09-20T00:00:00.000Z", sessionIds: [] };
  const rows = [];
  assert.equal(reconcileOnboarding(progress, rows).open, false);
  for (let index = 1; index <= 3; index++) {
    rows.push({ ...session, id: `short-${index}`, type: "article", date: `2026-09-20T00:0${index}:00.000Z`, durationSeconds: 30, attemptedChars: 20 });
    const result = reconcileOnboarding(progress, rows);
    assert.equal(result.open, true);
    assert.equal(result.progress.sessionIds.length, index);
    progress = result.progress;
    assert.equal(reconcileOnboarding(progress, rows).open, false);
  }
  assert.ok(buildBaseline(rows, progress));
  assert.equal(reconcileOnboarding(progress, [...rows, { ...rows[0], id: "fourth", date: "2026-09-20T00:04:00.000Z" }]).open, false);
});

test("旧成绩和非文章练习不推进短测，复练完成只提醒一次且保留短测更新", () => {
  const progress = { version: 1, status: "active", startedAt: "2026-09-20T00:00:00.000Z", sessionIds: [] };
  const old = { ...session, type: "article", date: "2026-09-19T00:00:00.000Z" };
  const practice = { ...session, id: "practice", type: "review", date: "2026-09-20T00:02:00.000Z" };
  assert.equal(reconcileOnboarding(progress, [old, practice]).open, false);
  const article = { ...practice, id: "article", type: "article" };
  const result = reconcileOnboarding({ ...progress, practiceStartedAt: progress.startedAt }, [old, practice, article]);
  assert.equal(result.open, true);
  assert.deepEqual(result.progress.sessionIds, ["article"]);
  assert.equal(result.progress.practiceSessionId, "practice");
  assert.equal(reconcileOnboarding(result.progress, [old, practice, article]).open, false);
});
