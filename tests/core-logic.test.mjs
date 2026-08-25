import assert from "node:assert/strict";
import test from "node:test";

import {
  applyTypingDelaySample,
  buildCommonPracticeArticle,
  buildChallengePool,
  buildMinimumCodeLengthIndex,
  buildCustomArticle,
  buildTypingHeatmap,
  calculateActiveDurationSeconds,
  calculateAccuracy,
  calculateKeyAccuracy,
  calculatePhraseRate,
  calculateRemainingSeconds,
  calculateTheoreticalMinimumCodeLength,
  calculateTypingTransitionMs,
  calculateTypingMetrics,
  canCompleteTyping,
  classifyWubiHand,
  commonCharacterPresets,
  countCommittedAttempts,
  countCommittedEdit,
  formatCommonCharacterText,
  getCommonCharacterSlice,
  getHesitationLevel,
  getCommittedEditRange,
  isCommonPracticeArticle,
  isWubiLetterKey,
  isImeSelectionKey,
  preferShortestWubiCodes,
  selectInitialArticle,
  shuffleCharacters,
  shouldDeferInputCommit,
} from "../app/lib.ts";
import {
  incrementKeyUsage,
  normalizeKeyUsage,
  summarizeKeyUsage,
} from "../app/key-usage.ts";
import {
  getAdjacentTrackIndex,
  parseMusicCatalog,
  parseMusicPreferences,
  withBasePath,
} from "../app/music.ts";
import {
  analyzeCodeLengthCoach,
  buildCodeLengthCoachIndex,
} from "../app/code-length-coach.ts";
import {
  buildGhostTimeline,
  compareGhostSegments,
  getGhostArticleIdentity,
  getGhostElapsedAtProgress,
  getGhostPositionAtElapsed,
  ghostTimelineByteLength,
  MAX_GHOST_TIMELINE_STORAGE_BYTES,
  MAX_GHOST_TIMELINES,
  pruneGhostTimelines,
  selectGhostSessions,
} from "../app/ghost-race.ts";

function ghostSession(id, date, durationSeconds, ghostTimeline) {
  return {
    id,
    type: "article",
    title: "幽灵测试",
    date,
    durationSeconds,
    correctChars: ghostTimeline.characterCount,
    attemptedChars: ghostTimeline.characterCount,
    speed: Math.round(ghostTimeline.characterCount / (durationSeconds / 60)),
    kps: 2,
    codeLength: 2.5,
    accuracy: 100,
    errors: 0,
    ghostTimeline,
  };
}

test("typing accuracy keeps corrected mistakes in the denominator", () => {
  const target = "中国";
  const wrong = countCommittedAttempts("", "错", target);
  const erase = countCommittedAttempts("错", "", target);
  const firstCorrect = countCommittedAttempts("", "中", target);
  const secondCorrect = countCommittedAttempts("中", "中国", target);

  const attempts =
    wrong.attempts +
    erase.attempts +
    firstCorrect.attempts +
    secondCorrect.attempts;
  const correct =
    wrong.correct +
    erase.correct +
    firstCorrect.correct +
    secondCorrect.correct;

  assert.equal(attempts, 3);
  assert.equal(correct, 2);
  assert.ok(Math.abs(calculateAccuracy(correct, attempts) - 200 / 3) < 1e-10);
  assert.equal(calculateAccuracy(0, 0), 100);
});

test("typing completes at full length even when answers contain mistakes", () => {
  assert.equal(canCompleteTyping("中国", "中国"), true);
  assert.equal(canCompleteTyping("中错", "中国"), true);
  assert.equal(canCompleteTyping("中", "中国"), false);
  assert.equal(canCompleteTyping("", ""), false);
});

test("ghost identities exclude generated practice and invalidate changed content", () => {
  const builtIn = {
    id: "short-001",
    title: "内置",
    length: "short",
    topic: "测试",
    wordCount: 10,
    version: 2,
    text: "一二三四五六七八九十",
  };
  const identity = getGhostArticleIdentity(builtIn);
  assert.equal(identity.articleKey, "builtin:short-001");
  assert.equal(identity.articleVersion, 2);
  assert.equal(
    getGhostArticleIdentity({ ...builtIn, kind: "common" }),
    null,
  );
  assert.notEqual(
    getGhostArticleIdentity({ ...builtIn, text: "一二三四五六七八九甲" })
      .contentFingerprint,
    identity.contentFingerprint,
  );
  assert.equal(
    getGhostArticleIdentity({ ...builtIn, id: "custom-1", kind: "custom" })
      .articleKey,
    "custom:custom-1",
  );
});

test("ghost timelines stay compressed, cover the finish, and interpolate", () => {
  const identity = {
    articleKey: "builtin:test",
    articleVersion: 1,
    contentFingerprint: "20-test",
    characterCount: 20,
  };
  const timeline = buildGhostTimeline(identity, [
    { characterCount: 3, elapsedMs: 700 },
    { characterCount: 6, elapsedMs: 1200 },
    { characterCount: 12, elapsedMs: 2500 },
    { characterCount: 10, elapsedMs: 2200 },
    { characterCount: 20, elapsedMs: 5000 },
  ]);
  assert.ok(timeline);
  assert.deepEqual(timeline.samples.at(-1), [20, 5000]);
  assert.ok(timeline.samples.length < 5);
  assert.ok(Math.abs(getGhostPositionAtElapsed(timeline, 2500) - 12) < 0.001);
  assert.ok(Math.abs(getGhostElapsedAtProgress(timeline, 12) - 2500) < 0.001);
  assert.equal(getGhostPositionAtElapsed(timeline, 999999), 20);
  assert.equal(buildGhostTimeline(identity, [{ characterCount: 10, elapsedMs: 1 }]), null);
  const phraseCommitTimeline = buildGhostTimeline(identity, [
    { characterCount: 5, elapsedMs: 1000 },
    { characterCount: 10, elapsedMs: 1000 },
    { characterCount: 20, elapsedMs: 3000 },
  ]);
  assert.equal(getGhostPositionAtElapsed(phraseCommitTimeline, 1000), 10);
});

test("ghost selection matches exact versions and keeps best plus two recent runs", () => {
  const identity = {
    articleKey: "builtin:test",
    articleVersion: 1,
    contentFingerprint: "10-test",
    characterCount: 10,
  };
  const timeline = buildGhostTimeline(identity, [
    { characterCount: 5, elapsedMs: 2000 },
    { characterCount: 10, elapsedMs: 4000 },
  ]);
  const sessions = [
    ghostSession("old-best", "2026-08-20T10:00:00Z", 4, timeline),
    ghostSession("recent-1", "2026-08-23T10:00:00Z", 6, timeline),
    ghostSession("recent-2", "2026-08-22T10:00:00Z", 5, timeline),
    ghostSession("old", "2026-08-19T10:00:00Z", 8, timeline),
  ];
  const selected = selectGhostSessions(sessions, identity);
  assert.equal(selected.best.id, "old-best");
  assert.equal(selected.recent.id, "recent-1");
  const retained = pruneGhostTimelines(sessions);
  assert.deepEqual(
    retained.filter((item) => item.ghostTimeline).map((item) => item.id).sort(),
    ["old-best", "recent-1", "recent-2"],
  );
  assert.equal(
    selectGhostSessions(sessions, { ...identity, articleVersion: 2 }).best,
    null,
  );
  const mixedTimezone = [
    ghostSession("local", "2026-08-25T00:30:00+08:00", 4, timeline),
    ghostSession("utc", "2026-08-24T20:00:00Z", 5, timeline),
  ];
  assert.equal(selectGhostSessions(mixedTimezone, identity).recent.id, "utc");
});

test("ghost timelines have a deterministic global cap and explain segment changes", () => {
  const sessions = Array.from({ length: MAX_GHOST_TIMELINES + 5 }, (_, index) => {
    const identity = {
      articleKey: `builtin:${index}`,
      articleVersion: 1,
      contentFingerprint: `10-${index}`,
      characterCount: 10,
    };
    const timeline = buildGhostTimeline(identity, [
      { characterCount: 5, elapsedMs: 1000 },
      { characterCount: 10, elapsedMs: 2000 },
    ]);
    return ghostSession(
      `session-${index}`,
      new Date(Date.UTC(2026, 7, 1, 0, index)).toISOString(),
      2,
      timeline,
    );
  });
  const pruned = pruneGhostTimelines(sessions);
  assert.equal(
    pruned.filter((item) => item.ghostTimeline).length,
    MAX_GHOST_TIMELINES,
  );
  assert.ok(
    pruned
      .filter((item) => item.ghostTimeline)
      .reduce(
        (sum, item) => sum + ghostTimelineByteLength(item.ghostTimeline),
        0,
      ) <= MAX_GHOST_TIMELINE_STORAGE_BYTES,
  );

  const ghost = sessions.at(-1).ghostTimeline;
  const current = buildGhostTimeline(
    { ...ghost, samples: undefined },
    [
      { characterCount: 5, elapsedMs: 1400 },
      { characterCount: 10, elapsedMs: 2100 },
    ],
  );
  const comparison = compareGhostSegments(current, ghost, [5, 10]);
  assert.equal(comparison[0].result, "lost");
  assert.equal(comparison[1].result, "recovered");
});

test("global ghost eviction keeps each retained article's best timeline", () => {
  const sessions = [];
  for (let articleIndex = 0; articleIndex < 31; articleIndex += 1) {
    const identity = {
      articleKey: `builtin:group-${articleIndex}`,
      articleVersion: 1,
      contentFingerprint: `10-group${articleIndex}`,
      characterCount: 10,
    };
    const timeline = buildGhostTimeline(identity, [
      { characterCount: 5, elapsedMs: 1000 },
      { characterCount: 10, elapsedMs: 2000 },
    ]);
    sessions.push(
      ghostSession(
        `best-${articleIndex}`,
        `2026-08-01T00:${String(articleIndex).padStart(2, "0")}:00Z`,
        2,
        timeline,
      ),
      ghostSession(
        `recent-a-${articleIndex}`,
        `2026-08-23T00:${String(articleIndex).padStart(2, "0")}:00Z`,
        4,
        timeline,
      ),
      ghostSession(
        `recent-b-${articleIndex}`,
        `2026-08-22T00:${String(articleIndex).padStart(2, "0")}:00Z`,
        3,
        timeline,
      ),
    );
  }
  const pruned = pruneGhostTimelines(sessions);
  for (let articleIndex = 0; articleIndex < 31; articleIndex += 1) {
    const identity = sessions[articleIndex * 3].ghostTimeline;
    const selected = selectGhostSessions(pruned, identity);
    if (selected.recent) {
      assert.equal(selected.best.id, `best-${articleIndex}`);
    }
  }

  const duplicateIdTimeline = sessions[0].ghostTimeline;
  const duplicateIds = Array.from({ length: 4 }, (_, index) =>
    ghostSession(
      "duplicate",
      `2026-08-${20 + index}T00:00:00Z`,
      2 + index,
      duplicateIdTimeline,
    ),
  );
  assert.equal(
    pruneGhostTimelines(duplicateIds).filter((item) => item.ghostTimeline).length,
    3,
  );
});

test("active duration excludes overlapping browser inactivity", () => {
  assert.equal(
    calculateActiveDurationSeconds({
      startedAt: 1000,
      now: 11000,
      pausedDurationMs: 2000,
      pausedAt: null,
      inactiveDurationMs: 3000,
      inactiveAt: null,
    }),
    5,
  );
  assert.equal(
    calculateActiveDurationSeconds({
      startedAt: 1000,
      now: 11000,
      pausedDurationMs: 0,
      pausedAt: null,
      inactiveDurationMs: 2000,
      inactiveAt: 9000,
    }),
    6,
  );
});

test("typing result metrics only credit characters that actually match", () => {
  assert.deepEqual(
    calculateTypingMetrics({
      typed: "中错",
      target: "中国",
      durationSeconds: 2,
      keyCount: 6,
      letterKeys: 4,
      attemptCount: 2,
      correctAttemptCount: 1,
    }),
    {
      correctChars: 1,
      correctHanChars: 1,
      attemptedChars: 2,
      speed: 30,
      kps: 3,
      codeLength: 4,
      accuracy: 50,
    },
  );
});

test("typing code length ignores correctly typed punctuation in its denominator", () => {
  const withoutPunctuation = calculateTypingMetrics({
    typed: "中国",
    target: "中国",
    durationSeconds: 2,
    keyCount: 4,
    letterKeys: 4,
    attemptCount: 2,
    correctAttemptCount: 2,
  });
  const withPunctuation = calculateTypingMetrics({
    typed: "中国，",
    target: "中国，",
    durationSeconds: 2,
    keyCount: 5,
    letterKeys: 4,
    attemptCount: 3,
    correctAttemptCount: 3,
  });

  assert.equal(withoutPunctuation.codeLength, 2);
  assert.equal(withPunctuation.codeLength, 2);
  assert.equal(withPunctuation.correctChars, 3);
  assert.equal(withPunctuation.correctHanChars, 2);
});

test("typing code length excludes direct Latin letters in mixed custom text", () => {
  const metrics = calculateTypingMetrics({
    typed: "AI中国",
    target: "AI中国",
    durationSeconds: 2,
    keyCount: 4,
    letterKeys: 4,
    attemptCount: 4,
    correctAttemptCount: 4,
  });

  assert.equal(metrics.codeLength, 1);
  assert.equal(metrics.correctChars, 4);
});

test("typing diagnostics derive correction cost, phrase rate, and hand use", () => {
  assert.equal(
    calculateKeyAccuracy({
      keyCount: 100,
      backspaceCount: 2,
      correctionCount: 3,
      codeLength: 2,
    }),
    92,
  );
  assert.equal(calculateKeyAccuracy({ keyCount: 0, backspaceCount: 0, correctionCount: 0, codeLength: 0 }), 100);
  assert.equal(calculatePhraseRate(40, 80), 50);
  assert.equal(calculatePhraseRate(10, 0), 0);
  assert.deepEqual(countCommittedEdit("中国", "中华人"), {
    removed: 1,
    inserted: 2,
    phraseChars: 2,
  });
  assert.deepEqual(countCommittedEdit("😀中", "😀中国"), {
    removed: 0,
    inserted: 1,
    phraseChars: 0,
  });
  assert.deepEqual(getCommittedEditRange("😀中国", "😀中人"), {
    start: 2,
    removed: 1,
    inserted: 1,
  });
  assert.deepEqual(countCommittedEdit("中国民", "中国人民"), {
    removed: 0,
    inserted: 1,
    phraseChars: 0,
  });
  assert.equal(classifyWubiHand("a", "KeyA"), "left");
  assert.equal(classifyWubiHand("j", "KeyJ"), "right");
  assert.equal(classifyWubiHand("Shift", "ShiftLeft"), null);
  assert.equal(isImeSelectionKey(" "), true);
  assert.equal(isImeSelectionKey("3"), true);
  assert.equal(isImeSelectionKey("0"), false);
});

test("typing delay samples follow Unicode positions, phrase commits, and corrections", () => {
  const target = "😀中华";
  let delays = applyTypingDelaySample({
    previous: "",
    next: "😀中",
    target,
    delayMs: 1200,
    delays: [],
  });
  assert.deepEqual(delays, [600, 600, 0]);

  delays = applyTypingDelaySample({
    previous: "😀中",
    next: "😀",
    target,
    delayMs: 400,
    delays,
  });
  delays = applyTypingDelaySample({
    previous: "😀",
    next: "😀中华",
    target,
    delayMs: 2400,
    delays,
  });
  assert.deepEqual(delays, [600, 2200, 1200]);

  assert.deepEqual(
    applyTypingDelaySample({
      previous: "😀中国民",
      next: "😀中国人民",
      target: "😀中国人民",
      delayMs: 1000,
      delays: [],
    }),
    [0, 0, 0, 1000, 0],
  );
});

test("typing transition timing keeps active time around a manual pause", () => {
  const beforePause = calculateTypingTransitionMs({
    lastActiveAt: 1000,
    now: 1300,
    pendingMs: 0,
  });
  const afterPause = calculateTypingTransitionMs({
    lastActiveAt: 5000,
    now: 5500,
    pendingMs: beforePause,
  });
  assert.equal(beforePause, 300);
  assert.equal(afterPause, 800);
});

test("typing heatmap uses an adaptive threshold, preserves paragraphs, and ranks levels", () => {
  const heatmap = buildTypingHeatmap("甲乙\n丙丁戊", [400, 500, 450, 2000, 4000]);
  assert.equal(heatmap.version, 1);
  assert.equal(heatmap.text, "甲乙\n丙丁戊");
  assert.equal(heatmap.baselineMs, 500);
  assert.equal(heatmap.thresholdMs, 1000);
  assert.deepEqual(heatmap.segments, [
    { start: 3, length: 1, delayMs: 2000 },
    { start: 4, length: 1, delayMs: 4000 },
  ]);
  assert.equal(getHesitationLevel(999, 1000), 0);
  assert.equal(getHesitationLevel(1000, 1000), 1);
  assert.equal(getHesitationLevel(1500, 1000), 2);
  assert.equal(getHesitationLevel(2500, 1000), 3);
});

test("typing heatmap retains only the 32 strongest separated segments", () => {
  const delays = Array.from({ length: 130 }, (_, index) =>
    index % 2 === 0 ? 8000 + index : 200,
  );
  const heatmap = buildTypingHeatmap("字".repeat(130), delays);
  assert.equal(heatmap.segments.length, 32);
  assert.ok(heatmap.segments.every((segment) => segment.start % 2 === 0));
  assert.equal(Math.max(...heatmap.segments.map((segment) => segment.delayMs)), 8128);
});

test("active typing duration excludes completed and current pauses", () => {
  assert.equal(
    calculateActiveDurationSeconds({
      startedAt: 1_000,
      now: 11_000,
      pausedDurationMs: 2_000,
      pausedAt: null,
    }),
    8,
  );
  assert.equal(
    calculateActiveDurationSeconds({
      startedAt: 1_000,
      now: 11_000,
      pausedDurationMs: 2_000,
      pausedAt: 9_000,
    }),
    6,
  );
});

test("typing logic counts non-BMP characters as single characters", () => {
  assert.deepEqual(countCommittedAttempts("", "😀𠀀", "😀𠀀"), {
    attempts: 2,
    correct: 2,
  });
  assert.deepEqual(
    calculateTypingMetrics({
      typed: "😀错",
      target: "😀𠀀",
      durationSeconds: 2,
      keyCount: 2,
      letterKeys: 0,
      attemptCount: 2,
      correctAttemptCount: 1,
    }),
    {
      correctChars: 1,
      correctHanChars: 0,
      attemptedChars: 2,
      speed: 30,
      kps: 1,
      codeLength: 0,
      accuracy: 50,
    },
  );
  assert.equal(canCompleteTyping("😀", "😀𠀀"), false);
  assert.equal(canCompleteTyping("😀𠀀", "😀𠀀"), true);
});

test("theoretical minimum code length chooses the cheapest phrase segmentation", () => {
  const index = buildMinimumCodeLengthIndex([
    ["中", "k", 100],
    ["国", "lgyi", 100],
    ["人", "wwww", 100],
    ["民", "nnnn", 100],
    ["中国", "kh", 100],
    ["中国人民", "klww", 100],
  ]);

  assert.equal(calculateTheoreticalMinimumCodeLength("中国人民", index), 1);
  assert.equal(
    calculateTheoreticalMinimumCodeLength("中国，人民！", index),
    2.5,
  );
});

test("theoretical minimum code length ignores non-Han text and reports gaps", () => {
  const index = buildMinimumCodeLengthIndex([
    ["中", "k", 100],
    ["国", "l", 100],
    ["中国", "kh", 100],
  ]);

  assert.equal(calculateTheoreticalMinimumCodeLength("A中1国。", index), 1);
  assert.equal(calculateTheoreticalMinimumCodeLength("ABC 123", index), null);
  assert.equal(calculateTheoreticalMinimumCodeLength("中缺", index), null);
});

test("code length coach returns an optimal segmentation whose keys match the minimum", () => {
  const index = buildCodeLengthCoachIndex([
    ["输", "lw", 100],
    ["入", "ty", 100],
    ["法", "ifcy", 100],
    ["练", "xan", 100],
    ["习", "nud", 100],
    ["输入", "lty", 100],
    ["输入法", "lti", 100],
    ["练习", "xnu", 100],
  ]);
  const analysis = analyzeCodeLengthCoach("输入法，练习！", index);

  assert.equal(analysis.theoreticalMinimumKeys, 6);
  assert.equal(analysis.singleCharacterBaselineKeys, 14);
  assert.equal(analysis.potentialSavedKeys, 8);
  assert.equal(
    analysis.optimalSegments.reduce(
      (total, segment) => total + segment.codeLength,
      0,
    ),
    analysis.theoreticalMinimumKeys,
  );
  assert.deepEqual(
    analysis.optimalSegments.map(({ text, kind }) => ({ text, kind })),
    [
      { text: "输入法", kind: "phrase" },
      { text: "，", kind: "ignored" },
      { text: "练习", kind: "phrase" },
      { text: "！", kind: "ignored" },
    ],
  );
});

test("code length coach finds beneficial two, three, and four character opportunities", () => {
  const index = buildCodeLengthCoachIndex([
    ["甲", "aaaa", 1],
    ["乙", "bbbb", 1],
    ["丙", "cccc", 1],
    ["丁", "dddd", 1],
    ["甲乙", "ab", 1],
    ["甲乙丙", "abc", 1],
    ["甲乙丙丁", "abcd", 1],
  ]);
  const analysis = analyzeCodeLengthCoach("甲乙丙丁", index, {
    maxRecommendations: 3,
  });

  assert.deepEqual(
    analysis.recommendedOpportunities.map((item) => [
      item.length,
      item.savedKeys,
    ]),
    [
      [4, 12],
      [3, 9],
      [2, 6],
    ],
  );
  assert.deepEqual(
    analysis.highestValueOpportunities.map(({ text, start }) => ({ text, start })),
    [{ text: "甲乙丙丁", start: 0 }],
  );
});

test("code length coach survives ignored text and unknown Han without inventing totals", () => {
  const index = buildCodeLengthCoachIndex([
    ["中", "k", 1],
    ["国", "l", 1],
    ["人民", "w", 1],
    ["人", "w", 1],
    ["民", "n", 1],
  ]);
  const analysis = analyzeCodeLengthCoach("AI中1缺。国人民", index);

  assert.equal(analysis.complete, false);
  assert.equal(analysis.hanCharacterCount, 5);
  assert.equal(analysis.coveredHanCharacterCount, 4);
  assert.equal(analysis.theoreticalMinimumKeys, null);
  assert.equal(analysis.singleCharacterBaselineKeys, null);
  assert.ok(
    analysis.optimalSegments.some(
      (segment) => segment.text === "缺" && segment.kind === "unknown",
    ),
  );
  assert.deepEqual(
    analysis.recommendedOpportunities.map((item) => item.text),
    ["人民"],
  );

  const nonHan = analyzeCodeLengthCoach("AI 2026!", index);
  assert.equal(nonHan.complete, false);
  assert.equal(nonHan.theoreticalMinimumKeys, null);
  assert.equal(nonHan.recommendedOpportunities.length, 0);
});

test("challenge countdown derives from its wall-clock deadline", () => {
  const deadline = 160_000;
  assert.equal(calculateRemainingSeconds(deadline, 100_000), 60);
  assert.equal(calculateRemainingSeconds(deadline, 100_250), 60);
  assert.equal(calculateRemainingSeconds(deadline, 159_100), 1);
  assert.equal(calculateRemainingSeconds(deadline, 170_000), 0);
});

test("custom articles share one normalized construction path", () => {
  const article = buildCustomArticle(
    "custom-1",
    "  标题\u0000  带空格  ",
    "\u0000  这是至少十个字符的自定义正文。  ",
  );

  assert.deepEqual(article, {
    id: "custom-1",
    title: "标题 带空格",
    length: "short",
    topic: "自定义",
    wordCount: 15,
    version: 1,
    text: "这是至少十个字符的自定义正文。",
    kind: "custom",
  });
  assert.equal(buildCustomArticle("custom-2", "", "太短"), null);
});

test("initial article follows the preferred length without losing compatible progress", () => {
  const short = {
    id: "short-1",
    title: "短文",
    length: "short",
    topic: "测试",
    wordCount: 2,
    version: 1,
    text: "短文",
  };
  const water = {
    ...short,
    id: "water-1",
    title: "水文",
    length: "water",
    text: "水文",
  };
  const articles = [short, water];

  assert.equal(
    selectInitialArticle(articles, articles, short.id, "water")?.id,
    water.id,
  );
  assert.equal(
    selectInitialArticle(articles, articles, water.id, "water")?.id,
    water.id,
  );
  assert.equal(
    selectInitialArticle(articles, articles, short.id, "all")?.id,
    short.id,
  );
  assert.equal(
    selectInitialArticle(articles, articles, short.id, "water", true)?.id,
    short.id,
  );
});

test("IME pre-edit buffers are deferred and a repeated final value is not counted twice", () => {
  assert.equal(shouldDeferInputCommit(true, false), true);
  assert.equal(shouldDeferInputCommit(false, true), true);
  assert.equal(shouldDeferInputCommit(false, false), false);

  const target = "中国";
  const firstCommit = countCommittedAttempts("", "中", target);
  const repeatedCommit = countCommittedAttempts("中", "中", target);
  const secondCommit = countCommittedAttempts("中", "中国", target);

  assert.deepEqual(firstCommit, { attempts: 1, correct: 1 });
  assert.deepEqual(repeatedCommit, { attempts: 0, correct: 0 });
  assert.deepEqual(secondCommit, { attempts: 1, correct: 1 });
  assert.deepEqual(countCommittedAttempts("中国民", "中国人民", "中国人民"), {
    attempts: 1,
    correct: 1,
  });
});

test("Wubi letter detection falls back to physical keys for Windows IME events", () => {
  assert.equal(isWubiLetterKey("a"), true);
  assert.equal(isWubiLetterKey("Y"), true);
  assert.equal(isWubiLetterKey("z", "KeyZ"), false);
  assert.equal(isWubiLetterKey("Process", "KeyA"), true);
  assert.equal(isWubiLetterKey("Unidentified", "KeyY"), true);
  assert.equal(isWubiLetterKey("Process", "KeyZ"), false);
  assert.equal(isWubiLetterKey("Process"), false);
});

test("keyboard usage summary groups physical keys by hand, row, finger, and Wubi zone", () => {
  let usage = {};
  for (const code of [
    "KeyQ", "KeyQ", "KeyQ", "KeyQ",
    "KeyA", "KeyA",
    "KeyY", "KeyY", "KeyY",
    "Space", "KeyZ",
  ]) {
    usage = incrementKeyUsage(usage, code);
  }
  assert.equal(incrementKeyUsage(usage, "MediaPlayPause"), usage);

  const summary = summarizeKeyUsage(usage);
  assert.equal(summary.total, 11);
  assert.deepEqual(summary.mostUsed, { label: "Q", count: 4 });
  assert.deepEqual(summary.hands.map(({ label, count }) => [label, count]), [
    ["左手", 7],
    ["右手", 3],
  ]);
  assert.deepEqual(summary.rows.map(({ label, count }) => [label, count]), [
    ["数字排", 0],
    ["上排", 7],
    ["中排", 2],
    ["下排", 1],
  ]);
  assert.deepEqual(summary.zones.map(({ name, count }) => [name, count]), [
    ["撇区", 4],
    ["捺区", 3],
    ["横区", 2],
    ["竖区", 0],
    ["折区", 0],
  ]);
  assert.deepEqual(normalizeKeyUsage({ KeyQ: 3, Unknown: 9, KeyW: -1 }), { KeyQ: 3 });
});

test("shortest Wubi code wins and equal lengths prefer higher weight", () => {
  const preferred = preferShortestWubiCodes([
    ["测", "imj", 100],
    ["测", "im", 80],
    ["测", "ia", 90],
    ["试", "ya", 50],
  ]);

  assert.deepEqual(preferred, [
    ["测", "ia", 90],
    ["试", "ya", 50],
  ]);
});

test("challenge filters eligible codes before choosing the shortest one", () => {
  const pool = buildChallengePool([
    ["睚", "hff", 1],
    ["睚", "hffg", 100000],
    ["五笔", "ggtt", 200000],
    ["低频", "abcd", 99999],
  ], "char");

  assert.deepEqual(pool, [["睚", "hffg", 100000]]);
});

test("common-character presets use exact non-overlapping frequency ranges", () => {
  const characters = Array.from({ length: 1500 }, (_, index) =>
    String.fromCodePoint(0x4e00 + index),
  ).join("");
  const data = {
    version: 1,
    source: { name: "test", url: "https://example.com", retrievedAt: "2026-07-29" },
    characters,
  };

  const first500Groups = commonCharacterPresets
    .slice(0, 10)
    .map(({ id }) => getCommonCharacterSlice(data, id));
  const middle500 = getCommonCharacterSlice(data, "middle-500");
  const last500 = getCommonCharacterSlice(data, "last-500");
  const first1500 = getCommonCharacterSlice(data, "first-1500");

  assert.equal(first500Groups.length, 10);
  assert.ok(first500Groups.every((group) => group.length === 50));
  const first500 = first500Groups.flat();
  assert.equal(first500.length, 500);
  assert.equal(new Set(first500).size, 500);
  assert.equal(middle500.length, 500);
  assert.equal(last500.length, 500);
  assert.deepEqual(
    [...first500, ...middle500, ...last500],
    first1500,
  );
});

test("common-character formatting adds presentation-only groups", () => {
  const characters = Array.from("的一了是不我人有在这国大个中他和你来上要们年为会就地到说出家子发儿生么业也经着得时作以工对多好那学可行");
  const text = formatCommonCharacterText(characters);

  assert.equal(text.replace(/\s/g, ""), characters.join(""));
  assert.equal(text.split("\n")[0].length, 10);
  assert.match(text, /\n\n/);
});

test("common-character shuffle preserves the full set and practice metadata", () => {
  const data = {
    version: 1,
    source: { name: "test", url: "https://example.com", retrievedAt: "2026-07-29" },
    characters: Array.from({ length: 1500 }, (_, index) =>
      String.fromCodePoint(0x4e00 + index),
    ).join(""),
  };
  const ordered = buildCommonPracticeArticle(data, "first-050");
  const shuffled = buildCommonPracticeArticle(
    data,
    "first-050",
    true,
    () => 0,
  );

  assert.equal(ordered.wordCount, 50);
  assert.equal(ordered.shuffled, false);
  assert.equal(shuffled.shuffled, true);
  assert.notEqual(shuffled.text, ordered.text);
  assert.deepEqual(
    [...shuffleCharacters(getCommonCharacterSlice(data, "first-050"), () => 0)].sort(),
    [...getCommonCharacterSlice(data, "first-050")].sort(),
  );
  assert.equal(isCommonPracticeArticle(ordered), true);
  assert.equal(isCommonPracticeArticle(shuffled), true);
  assert.equal(
    isCommonPracticeArticle({ ...shuffled, wordCount: 99 }),
    false,
  );
});

const validMusicTrack = {
  id: "quiet-keys",
  title: "Quiet Keys",
  artist: "Test Artist",
  sources: [
    {
      src: "/audio/tracks/quiet-keys.mp3",
      type: "audio/mpeg",
    },
  ],
  durationSeconds: 180,
  license: "CC0 1.0 Universal",
  sourceUrl: "https://example.com/quiet-keys",
};

test("music catalog accepts local tracks and skips invalid entries", () => {
  const result = parseMusicCatalog({
    version: 1,
    tracks: [
      validMusicTrack,
      {
        ...validMusicTrack,
        id: "remote",
        sources: [
          { src: "https://example.com/a.mp3", type: "audio/mpeg" },
        ],
      },
      {
        ...validMusicTrack,
        id: "traversal",
        sources: [
          { src: "/audio/tracks/../secret.mp3", type: "audio/mpeg" },
        ],
      },
      {
        ...validMusicTrack,
        id: "unsupported",
        sources: [{ src: "/audio/tracks/a.wav", type: "audio/wav" }],
      },
      validMusicTrack,
    ],
  });

  assert.equal(result.catalog.tracks.length, 1);
  assert.equal(result.catalog.tracks[0].id, "quiet-keys");
  assert.equal(result.invalidTrackCount, 4);
});

test("music catalog rejects unsupported versions and empty catalogs", () => {
  assert.throws(
    () => parseMusicCatalog({ version: 2, tracks: [validMusicTrack] }),
    /版本不受支持/,
  );
  assert.throws(
    () =>
      parseMusicCatalog({
        version: 1,
        tracks: [{ ...validMusicTrack, title: "" }],
      }),
    /没有可播放/,
  );
});

test("music preferences recover safely when the catalog changes", () => {
  const tracks = [
    validMusicTrack,
    { ...validMusicTrack, id: "second-track" },
  ];

  assert.deepEqual(
    parseMusicPreferences(
      { trackId: "removed-track", volume: 2, muted: true },
      tracks,
    ),
    { trackId: "quiet-keys", volume: 1, muted: true },
  );
  assert.deepEqual(parseMusicPreferences("broken", tracks), {
    trackId: "quiet-keys",
    volume: 0.35,
    muted: false,
  });
});

test("music navigation wraps and assets preserve the deployment base path", () => {
  assert.equal(getAdjacentTrackIndex(5, 4, 1), 0);
  assert.equal(getAdjacentTrackIndex(5, 0, -1), 4);
  assert.equal(getAdjacentTrackIndex(0, 0, 1), -1);
  assert.equal(
    withBasePath("/audio/tracks/test.mp3", "/wubi-test-website"),
    "/wubi-test-website/audio/tracks/test.mp3",
  );
});
