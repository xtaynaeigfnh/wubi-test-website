import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeeklyReport,
  calculateAbilityDimensions,
  getWeekRange,
} from "../app/weekly-report.ts";

function session(overrides = {}) {
  return {
    id: "session",
    type: "article",
    title: "周报测试",
    date: "2026-08-24T12:00:00",
    durationSeconds: 60,
    correctChars: 100,
    attemptedChars: 100,
    speed: 60,
    kps: 2,
    codeLength: 4,
    theoreticalCodeLength: 3,
    accuracy: 95,
    keyAccuracy: 95,
    errors: 0,
    phraseRate: 30,
    ...overrides,
  };
}

test("周区间以本地时间周一为起点，并使用左闭右开边界", () => {
  const monday = getWeekRange(new Date("2026-08-24T18:30:00"));
  const sunday = getWeekRange(new Date("2026-08-30T23:59:59"));
  const previous = getWeekRange(new Date("2026-08-24T18:30:00"), -1);

  assert.equal(monday.start.getFullYear(), 2026);
  assert.equal(monday.start.getMonth(), 7);
  assert.equal(monday.start.getDate(), 24);
  assert.equal(monday.start.getHours(), 0);
  assert.equal(monday.end.getDate(), 31);
  assert.equal(sunday.start.getTime(), monday.start.getTime());
  assert.equal(previous.start.getDate(), 17);
  assert.equal(previous.end.getDate(), 24);

  const report = buildWeeklyReport({
    sessions: [
      session({ id: "before", date: "2026-08-23T23:59:59" }),
      session({ id: "start", date: "2026-08-24T00:00:00" }),
      session({ id: "end", date: "2026-08-30T23:59:59" }),
      session({ id: "after", date: "2026-08-31T00:00:00" }),
    ],
    errors: [],
    phraseOpportunities: [],
    now: new Date("2026-08-30T23:59:59.999"),
  });

  assert.equal(report.weekStart, "2026-08-24");
  assert.equal(report.weekEnd, "2026-08-30");
  assert.equal(report.sessions, 2);
  assert.equal(report.comparison.sessions, 1);
});

test("六个能力维度使用固定归一化区间并限制在 0–100", () => {
  const abilities = calculateAbilityDimensions([
    session({
      speed: 180,
      correctChars: 180,
      attemptedChars: 240,
      accuracy: 75,
      keyAccuracy: 105,
      theoreticalCodeLength: 2,
      codeLength: 4,
      phraseRate: 90,
    }),
    session({ type: "roots", speed: 0, accuracy: 0, keyAccuracy: 0 }),
  ]);

  assert.deepEqual(
    abilities.map(({ id, score, normalization }) => ({ id, score, normalization })),
    [
      { id: "speed", score: 100, normalization: "0–120 字/分" },
      { id: "characterAccuracy", score: 0, normalization: "80%–100%" },
      { id: "keyAccuracy", score: 100, normalization: "80%–100%" },
      { id: "codeLength", score: 0, normalization: "理论效率 65%–100%" },
      { id: "phrase", score: 100, normalization: "打词率 0%–60%" },
      { id: "stability", score: null, normalization: "速度变异系数 45%–0%" },
    ],
  );
});

test("稳定性按文章速度变异系数计算", () => {
  const stability = calculateAbilityDimensions([
    session({ id: "one", speed: 80 }),
    session({ id: "two", speed: 100 }),
  ]).find((item) => item.id === "stability");

  assert.equal(stability.score, 75);
  assert.equal(stability.rawLabel, "速度波动 11.1%");
});

test("码长能力按总理论键数与实际键数聚合", () => {
  const codeLength = calculateAbilityDimensions([
    session({
      id: "inefficient",
      correctChars: 100,
      correctHanChars: 100,
      theoreticalCodeLength: 2,
      codeLength: 4,
    }),
    session({
      id: "efficient",
      correctChars: 100,
      correctHanChars: 100,
      theoreticalCodeLength: 2,
      codeLength: 2,
    }),
  ]).find((item) => item.id === "codeLength");

  assert.equal(codeLength.rawLabel, "66.7% 理论效率");
  assert.equal(codeLength.score, 5);
});

test("周报统计练习量、周内最长连续天数及上周变化", () => {
  const report = buildWeeklyReport({
    sessions: [
      session({ id: "mon", date: "2026-08-24T09:00:00", durationSeconds: 65, correctChars: 100, speed: 90 }),
      session({ id: "tue", date: "2026-08-25T09:00:00", durationSeconds: 60, correctChars: 120, speed: 110 }),
      session({ id: "thu-1", date: "2026-08-27T09:00:00", durationSeconds: 60, correctChars: 130, speed: 100 }),
      session({ id: "thu-2", date: "2026-08-27T18:00:00", durationSeconds: 60, correctChars: 150, speed: 100 }),
      session({ id: "previous", date: "2026-08-18T09:00:00", durationSeconds: 80, correctChars: 200, speed: 80 }),
    ],
    errors: [],
    phraseOpportunities: [],
    now: new Date("2026-08-28T12:00:00"),
  });

  assert.deepEqual(
    {
      sessions: report.sessions,
      characters: report.characters,
      minutes: report.minutes,
      activeDays: report.activeDays,
      streakDays: report.streakDays,
    },
    { sessions: 4, characters: 500, minutes: 4, activeDays: 3, streakDays: 2 },
  );
  assert.deepEqual(
    {
      sessions: report.comparison.sessions,
      characters: report.comparison.characters,
      minutes: report.comparison.minutes,
      speed: report.comparison.abilities.speed,
    },
    { sessions: 3, characters: 300, minutes: 3, speed: 0 },
  );
});

test("弱项汇总识别最弱键位、字根区、词组类型与掌握状态", () => {
  const errors = [
    { text: "甲", code: "aaaa", count: 3, codingErrors: 3, firstSeen: "2026-08-24T10:00:00", lastSeen: "2026-08-24T10:00:00" },
    { text: "乙", code: "qq", count: 4, codingErrors: 4, firstSeen: "2026-08-25T10:00:00", lastSeen: "2026-08-25T10:00:00" },
    { text: "丙", code: "as", count: 5, firstSeen: "2026-08-26T10:00:00", lastSeen: "2026-08-26T10:00:00" },
    { text: "丁", code: "w", count: 99, lastSeen: "2026-08-16T10:00:00" },
    {
      text: "戊",
      code: "d",
      count: 1,
      lastSeen: "2026-08-10T10:00:00",
      lastCorrect: "2026-08-27T10:00:00",
      correctStreak: 3,
    },
    {
      text: "己",
      code: "n",
      count: 2,
      firstSeen: "2026-08-24T11:00:00",
      lastSeen: "2026-08-24T11:00:00",
      lastCorrect: "2026-08-28T10:00:00",
      mastery: 4,
    },
  ];
  const phraseOpportunities = [
    { text: "二字", code: "ab", characterCount: 2, savedKeys: 4, opportunityCount: 5, practiceCount: 0, correctCount: 4, lastSeen: "2026-08-24T10:00:00" },
    { text: "三字词", code: "abc", characterCount: 3, savedKeys: 2, opportunityCount: 3, practiceCount: 0, correctCount: 0, lastSeen: "2026-08-25T10:00:00" },
    { text: "旧四字词", code: "abcd", characterCount: 4, savedKeys: 10, opportunityCount: 10, practiceCount: 0, correctCount: 0, lastSeen: "2026-08-10T10:00:00" },
  ];

  const report = buildWeeklyReport({
    sessions: [],
    errors,
    phraseOpportunities,
    now: new Date("2026-08-28T12:00:00"),
  });

  assert.equal(report.weakestKey, "A");
  assert.equal(report.weakestZone, "横区");
  assert.equal(report.weakestPhraseType, "3 字词组");
  assert.deepEqual(report.newWeaknesses, ["丙", "乙", "甲", "己"]);
  assert.deepEqual(report.masteredWeaknesses, ["戊", "己"]);
  assert.ok(report.recommendations.some((item) =>
    item.target === "roots" && item.text.includes("横区"),
  ));
});

test("完全解决的词组不会继续被标记为最需留意", () => {
  const report = buildWeeklyReport({
    sessions: [],
    errors: [],
    phraseOpportunities: [
      {
        text: "中国",
        code: "kl",
        characterCount: 2,
        savedKeys: 3,
        opportunityCount: 5,
        practiceCount: 5,
        correctCount: 5,
        lastSeen: "2026-08-25T10:00:00",
      },
    ],
    now: new Date("2026-08-25T12:00:00"),
  });

  assert.equal(report.weakestPhraseType, null);
});

test("分钟同比等于本周与上周展示值之差", () => {
  const report = buildWeeklyReport({
    sessions: [
      session({ id: "current", date: "2026-08-25T09:00:00", durationSeconds: 89.4 }),
      session({ id: "previous", date: "2026-08-18T09:00:00", durationSeconds: 30.6 }),
    ],
    errors: [],
    phraseOpportunities: [],
    now: new Date("2026-08-25T12:00:00"),
  });

  assert.equal(report.minutes, 1);
  assert.equal(report.comparison.minutes, 0);
});

test("夏令时开始周仍显示完整的周日结束日期", () => {
  const originalTimezone = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const report = buildWeeklyReport({
      sessions: [
        session({ id: "sunday", date: "2026-03-08T12:00:00-04:00" }),
      ],
      errors: [],
      phraseOpportunities: [],
      now: new Date("2026-03-08T18:00:00-04:00"),
    });

    assert.equal(report.weekStart, "2026-03-02");
    assert.equal(report.weekEnd, "2026-03-08");
    assert.equal(report.sessions, 1);
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test("空数据稳定降级为无能力分数的首次周报", () => {
  const report = buildWeeklyReport({
    sessions: [],
    errors: [],
    phraseOpportunities: [],
    now: new Date("2026-08-28T12:00:00"),
  });

  assert.equal(report.sessions, 0);
  assert.equal(report.characters, 0);
  assert.equal(report.minutes, 0);
  assert.equal(report.activeDays, 0);
  assert.equal(report.streakDays, 0);
  assert.deepEqual(report.masteredWeaknesses, []);
  assert.deepEqual(report.newWeaknesses, []);
  assert.equal(report.weakestKey, null);
  assert.equal(report.weakestZone, null);
  assert.equal(report.weakestPhraseType, null);
  assert.ok(report.abilities.every((item) => item.score === null));
  assert.deepEqual(report.comparison.abilities, {});
  assert.deepEqual(report.recommendations, [
    {
      text: "先完成 2 次文章测速，建立可比较的周报基线。",
      target: "typing",
    },
  ]);
});
