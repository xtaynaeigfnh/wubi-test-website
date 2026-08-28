import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildRhythmSummary,
  isRhythmSummary,
  MAX_PHYSICAL_RHYTHM_SAMPLES,
  MAX_RHYTHM_CURVE_SESSIONS,
  pruneRhythmCurves,
} from "../app/rhythm-lab.ts";
import {
  archiveFinishedSeason,
  buildAdvancedScenarioLibrary,
  completeAdvancedSeasonDay,
  createAdvancedSeason,
  expireAdvancedSeason,
  isAdvancedSeasonArchive,
  isValidScenario,
  selectWeakestScenarioCategory,
  seasonComparison,
} from "../app/advanced-training.ts";
import {
  parseBackupPayload,
  saveAdvancedPracticeOutcome,
  STORAGE,
} from "../app/lib.ts";

function session(overrides = {}) {
  return {
    id: "advanced-session",
    type: "rhythm",
    title: "节奏练习",
    date: "2026-08-25T08:00:00.000Z",
    durationSeconds: 60,
    correctChars: 100,
    attemptedChars: 100,
    speed: 100,
    kps: 3,
    codeLength: 2.8,
    accuracy: 98,
    errors: 2,
    rhythmSummary: buildRhythmSummary({
      text: "安静练习".repeat(25),
      delays: Array.from({ length: 100 }, (_, index) => 180 + (index % 7) * 20),
      physicalSamples: [
        { elapsedMs: 0, hand: "left" },
        { elapsedMs: 120, hand: "left" },
        { elapsedMs: 250, hand: "right" },
        { elapsedMs: 360, hand: "left" },
      ],
    }),
    ...overrides,
  };
}

test("rhythm summary compresses timing without preserving raw key events", () => {
  const summary = buildRhythmSummary({
    text: "春风经过窗边，纸页轻轻翻动。".repeat(12),
    delays: Array.from({ length: 180 }, (_, index) => index === 90 ? 2400 : 160 + (index % 9) * 18),
    physicalSamples: [
      { elapsedMs: 0, hand: "left" },
      { elapsedMs: 100, hand: "left" },
      { elapsedMs: 240, hand: "right" },
      { elapsedMs: 360, hand: "left" },
    ],
  });

  assert.equal(summary.version, 1);
  assert.ok(summary.curve.length > 0 && summary.curve.length <= 32);
  assert.ok(summary.weakSegments.length <= 3);
  assert.equal(summary.sameHandMedianMs, 100);
  assert.equal(summary.crossHandMedianMs, 130);
  assert.ok(summary.fastestTenCpm > 0);
  assert.equal("physicalSamples" in summary, false);
  assert.equal("delays" in summary, false);
  assert.equal(isRhythmSummary(summary), true);
});

test("empty and single timing samples degrade without invented values", () => {
  const empty = buildRhythmSummary({ text: "安静", delays: [] });
  assert.equal(empty.medianIntervalMs, null);
  assert.equal(empty.variationPercent, null);
  assert.equal(empty.recoveryMs, null);
  assert.equal(empty.fastestTenCpm, null);

  const one = buildRhythmSummary({ text: "安静", delays: [800] });
  assert.equal(one.startupMs, 800);
  assert.equal(one.fastestTenCpm, null);

  const sparse = buildRhythmSummary({
    text: "安静练习保持节奏完成",
    delays: [Number.NaN, 800],
  });
  assert.equal(sparse.startupMs, 800);
  assert.equal(sparse.fastestTenCpm, null);
  assert.ok(sparse.curve.every((point) => Number.isFinite(point.intervalMs)));
  assert.equal(MAX_PHYSICAL_RHYTHM_SAMPLES, 10_000);
});

test("rhythm summary rejects duplicate curve indexes and weak segments past the text", () => {
  const summary = buildRhythmSummary({
    text: "安静练习保持节奏完成",
    delays: Array.from({ length: 10 }, () => 200),
  });
  assert.equal(isRhythmSummary({
    ...summary,
    curve: [
      { characterCount: 2, intervalMs: 200 },
      { characterCount: 2, intervalMs: 210 },
    ],
  }), false);
  assert.equal(isRhythmSummary({
    ...summary,
    weakSegments: [{ start: 3, text: "安静练习保持节奏", delayMs: 500 }],
  }), false);
});

test("rhythm curves are pruned before summaries", () => {
  const rows = Array.from({ length: MAX_RHYTHM_CURVE_SESSIONS + 4 }, (_, index) =>
    session({ id: `session-${index}`, date: new Date(Date.UTC(2026, 7, 25, 8, 0, index)).toISOString() }),
  );
  const pruned = pruneRhythmCurves(rows);
  assert.ok(pruned.filter((item) => item.rhythmSummary.curve.length > 0).length <= MAX_RHYTHM_CURVE_SESSIONS);
  assert.ok(pruned.every((item) => item.rhythmSummary.medianIntervalMs !== null));
});

test("scenario library produces three pure-Chinese categories with stable identities", async () => {
  const groups = await Promise.all(
    ["short", "medium", "long"].map(async (length) => {
      const rows = JSON.parse(await readFile(new URL(`../public/data/articles-${length}.json`, import.meta.url), "utf8"));
      return rows.map((row) => ({
        ...row,
        title: row.id,
        length,
        topic: "测试",
        wordCount: Array.from(row.text).length,
        version: 1,
      }));
    }),
  );
  const scenarios = buildAdvancedScenarioLibrary(groups.flat());
  assert.equal(scenarios.length, 6);
  assert.deepEqual(new Set(scenarios.map((item) => item.category)), new Set(["daily", "office", "literature"]));
  assert.equal(new Set(scenarios.map((item) => item.id)).size, scenarios.length);
  assert.equal(new Set(scenarios.map((item) => item.text)).size, scenarios.length);
  assert.ok(scenarios.every(isValidScenario));
  assert.ok(scenarios.every((item) => /^[\p{Script=Han}\s，。！？]+$/u.test(item.text)));
});

test("fourteen-day plan advances once, expires after twenty-one days, and keeps six archives", () => {
  const started = new Date("2026-08-01T08:00:00.000Z");
  const season = createAdvancedSeason("season-one", started);
  assert.equal(season.days.length, 14);
  assert.equal(season.currentDay, 1);

  const completed = completeAdvancedSeasonDay(
    season,
    session({ seasonId: season.id, seasonDay: 1 }),
    new Date("2026-08-02T08:00:00.000Z"),
  );
  assert.equal(completed.currentDay, 2);
  assert.equal(completed.baseline.speed, 100);
  assert.equal(
    completeAdvancedSeasonDay(
      completed,
      session({ id: "advanced-session-two", seasonId: season.id, seasonDay: 2 }),
      new Date("2026-08-03T08:00:00.000Z"),
    ).currentDay,
    3,
  );

  const expired = expireAdvancedSeason(season, new Date("2026-08-23T09:00:00.000Z"));
  assert.equal(expired.status, "expired");
  let archive = { version: 1, active: null, history: [] };
  for (let index = 0; index < 8; index += 1) {
    archive = archiveFinishedSeason(archive, { ...expired, id: `expired-${index}` });
  }
  assert.equal(archive.history.length, 6);
  assert.equal(isAdvancedSeasonArchive(archive), true);
});

test("season comparison protects accuracy instead of rewarding unsafe speed", () => {
  const baseline = {
    speed: 100,
    accuracy: 98,
    variationPercent: 18,
    startupMs: 900,
    recoveryMs: 1200,
  };
  const result = seasonComparison(baseline, session({ speed: 115, accuracy: 94 }));
  assert.equal(result.accuracyProtected, false);
  assert.equal(result.speedPercent, 15);
});

test("adaptive day selects the weakest of the three completed scenarios", () => {
  const season = createAdvancedSeason("adaptive-season");
  season.days[6].sessionId = "daily";
  season.days[7].sessionId = "office";
  season.days[8].sessionId = "literature";
  const rows = [
    session({ id: "daily", rhythmSummary: { ...session().rhythmSummary, startupMs: 2000, recoveryMs: 1800 } }),
    session({ id: "office", accuracy: 99.5, codeLength: 2.2 }),
    session({ id: "literature", rhythmSummary: { ...session().rhythmSummary, variationPercent: 8, firstHalfMedianMs: 200, secondHalfMedianMs: 210 } }),
  ];
  assert.equal(selectWeakestScenarioCategory(season, rows), "daily");
});

test("advanced outcome rolls sessions and season back when either write fails", () => {
  const season = createAdvancedSeason("atomic-season");
  const result = session({ seasonId: season.id, seasonDay: 1 });
  const completed = completeAdvancedSeasonDay(
    season,
    { ...result, seasonId: season.id, seasonDay: 1 },
    new Date(result.date),
  );
  const archive = { version: 1, active: completed, history: [] };
  const values = new Map([
    [STORAGE.sessions, JSON.stringify([])],
    [STORAGE.advancedSeason, JSON.stringify({ version: 1, active: season, history: [] })],
  ]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        if (key === STORAGE.advancedSeason) throw new Error("quota");
        values.set(key, value);
      },
      removeItem: (key) => values.delete(key),
    },
  };
  try {
    assert.equal(saveAdvancedPracticeOutcome(result, archive), false);
    assert.deepEqual(JSON.parse(values.get(STORAGE.sessions)), []);
    assert.equal(JSON.parse(values.get(STORAGE.advancedSeason)).active.currentDay, 1);
  } finally {
    delete globalThis.window;
  }
});

test("backup v2 accepts advanced sessions and versioned season state", () => {
  const season = createAdvancedSeason("season-backup", new Date("2026-08-01T08:00:00.000Z"));
  const parsed = parseBackupPayload({
    format: "wubi-test-backup",
    version: 2,
    exportedAt: "2026-08-25T08:00:00.000Z",
    data: {
      [STORAGE.sessions]: [session()],
      [STORAGE.advancedSeason]: { version: 1, active: season, history: [] },
    },
  });
  assert.equal(parsed.data[STORAGE.sessions].length, 1);
  assert.equal(parsed.data[STORAGE.advancedSeason].active.id, "season-backup");
});

test("season archive rejects altered schedules and active history entries", () => {
  const active = createAdvancedSeason("strict-season");
  assert.equal(isAdvancedSeasonArchive({ version: 1, active, history: [] }), true);
  assert.equal(isAdvancedSeasonArchive({
    version: 1,
    active: { ...active, days: active.days.map((day, index) => index === 9 ? { ...day, focus: "daily" } : day) },
    history: [],
  }), false);
  assert.equal(isAdvancedSeasonArchive({ version: 1, active: null, history: [active] }), false);
});

test("advanced page exposes accessible tabs and quiet copy", async () => {
  const component = await readFile(new URL("../app/components/AdvancedCenter.tsx", import.meta.url), "utf8");
  assert.match(component, /role="tablist"/);
  assert.match(component, /aria-selected=\{tab === item\.id\}/);
  assert.match(component, /不催促，只看见节奏/);
  assert.match(component, /日常、办公与文学/);
  assert.match(component, /十四日静流计划/);
  assert.match(component, /onPaste=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(component, /value=\{inputValue\}/);
  assert.match(component, /shouldDeferInputCommit\([\s\S]*composingRef\.current,[\s\S]*nativeEvent\.isComposing/);
  assert.match(component, /setInputValue\(next\);[\s\S]*return;/);
  assert.match(component, /compositionCommitTimerRef\.current = window\.setTimeout/);
  assert.match(component, /commitValue\(inputRef\.current\?\.value \?\? endedValue\)/);
  assert.match(component, /countCommittedAttempts\(previous, committed, cleanTarget\)/);
  assert.match(component, /physicalRef\.current\.length < MAX_PHYSICAL_RHYTHM_SAMPLES/);
  assert.match(component, /if \(event\.ctrlKey \|\| event\.metaKey \|\| event\.altKey\) return;/);
  assert.match(component, />重试保存<\/button>/);
  assert.match(component, /retrySaveLockRef/);
  assert.match(component, /disabled=\{paused \|\| saveFailed\}/);
  assert.doesNotMatch(component, /if \(!onSave\(session\)\) \{\s*finishedRef\.current = false;/);
  assert.match(component, /startedAtRef\.current === null \|\|[\s\S]*pauseAtRef\.current !== null/);
  assert.doesNotMatch(component, /排行榜|段位|失败动画|强制连击/);
});
