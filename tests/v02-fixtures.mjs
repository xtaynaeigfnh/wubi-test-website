/* Shared deterministic fixtures for storage, backup, and feature boundary tests. */

function reviewItem(overrides = {}) {
  return {
    targetType: "character",
    targetId: "测",
    text: "测",
    code: "imyt",
    dueAt: "2026-08-29T00:00:00.000Z",
    intervalDays: 1,
    level: 0,
    lastOutcome: null,
    severity: 2,
    expectedBenefit: 4,
    correctStreak: 0,
    createdAt: "2026-08-29T00:00:00.000Z",
    ...overrides,
  };
}

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


export {
  articleProgress,
  hesitationResult,
  hesitationSession,
  hesitationTarget,
  reviewItem,
  session,
  trainingArticles,
  trainingEntries,
};
