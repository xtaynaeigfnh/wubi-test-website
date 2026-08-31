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
  buildAdvancedAssessmentIdentity,
  buildAdvancedSeasonEvaluation,
  canCompleteAdvancedSeasonToday,
  buildAdvancedScenarioLibrary,
  cancelAdvancedSeason,
  completeAdvancedSeasonDay,
  createAdvancedSeason,
  expireAdvancedSeason,
  invalidateAdvancedSeasonForContent,
  isAdvancedAssessmentIdentity,
  isCurrentAdvancedAssessmentIdentity,
  isAdvancedSeason,
  isAdvancedSeasonArchive,
  isLegacyAdvancedSeason,
  isValidScenario,
  pauseAdvancedSeason,
  resumeAdvancedSeason,
  selectWeakestScenarioCategory,
  seasonComparison,
  suggestAdvancedGoalRange,
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

function assessmentIdentity(overrides = {}) {
  return {
    ...buildAdvancedAssessmentIdentity({
      id: "fixed-assessment",
      version: 1,
      text: "安静练习保持节奏完成",
    }),
    ...overrides,
  };
}

function assessmentSession(season, day, overrides = {}) {
  return session({
    id: `assessment-${day}`,
    date: new Date(Date.UTC(2026, 7, day, 9)).toISOString(),
    seasonId: season.id,
    seasonDay: day,
    assessmentIdentity: assessmentIdentity(),
    keyAccuracy: 97,
    phraseRate: 36,
    ...overrides,
  });
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
    assessmentSession(season, 1, { date: "2026-08-02T08:00:00.000Z" }),
    new Date("2026-08-02T08:00:00.000Z"),
  );
  assert.equal(completed.currentDay, 2);
  assert.equal(completed.baseline.speed, 100);
  assert.equal(
    completeAdvancedSeasonDay(
      completed,
      assessmentSession(completed, 2, { date: "2026-08-03T08:00:00.000Z" }),
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

test("seven-day and fourteen-day plans use their own schedules and completion windows", () => {
  const started = new Date("2026-08-01T08:00:00.000Z");
  const seven = createAdvancedSeason("seven-days", started, {
    durationDays: 7,
    goalMetric: "keyAccuracy",
  });
  const fourteen = createAdvancedSeason("fourteen-days", started, {
    durationDays: 14,
    goalMetric: "phrase",
  });

  assert.equal(seven.days.length, 7);
  assert.equal(seven.calendarDayPolicy, "one-per-local-day");
  assert.deepEqual(seven.days.map((day) => day.focus), [
    "baseline",
    "startup",
    "stability",
    "recovery",
    "integrated",
    "retest",
    "final",
  ]);
  assert.equal(seven.expiresAt, "2026-08-11T08:00:00.000Z");
  assert.equal(seven.goal.metric, "keyAccuracy");
  assert.equal(fourteen.days.length, 14);
  assert.equal(fourteen.expiresAt, "2026-08-22T08:00:00.000Z");
  assert.equal(fourteen.goal.metric, "phrase");

  let completed = seven;
  for (let day = 1; day <= 7; day += 1) {
    completed = completeAdvancedSeasonDay(
      completed,
      assessmentSession(completed, day),
      new Date(Date.UTC(2026, 7, day, 9)),
    );
  }
  assert.equal(completed.status, "completed");
  assert.equal(completed.currentDay, 7);
  assert.equal(completed.days.every((day) => day.completedAt), true);
  assert.equal(isAdvancedSeason(completed), true);
});

test("all six goal metrics receive bounded suggestions from the baseline", () => {
  assert.deepEqual(suggestAdvancedGoalRange("speed", 100), { targetMin: 103, targetMax: 108 });
  assert.deepEqual(suggestAdvancedGoalRange("characterAccuracy", 98), { targetMin: 98.5, targetMax: 100 });
  assert.deepEqual(suggestAdvancedGoalRange("keyAccuracy", 99.5), { targetMin: 100, targetMax: 100 });
  assert.deepEqual(suggestAdvancedGoalRange("codeLength", 2.8), { targetMin: 2.65, targetMax: 2.75 });
  assert.deepEqual(suggestAdvancedGoalRange("phrase", 40), { targetMin: 42, targetMax: 48 });
  assert.deepEqual(suggestAdvancedGoalRange("stability", 20), { targetMin: 17, targetMax: 19 });
  assert.equal(suggestAdvancedGoalRange("speed", null), null);
  assert.equal(suggestAdvancedGoalRange("speed", Number.POSITIVE_INFINITY), null);
});

test("assessment identity fingerprints normalized content and preserves version identity", () => {
  const spaced = buildAdvancedAssessmentIdentity({
    id: "fixed-assessment",
    version: 1,
    text: "安 静\n练习",
  });
  const compact = buildAdvancedAssessmentIdentity({
    id: "fixed-assessment",
    version: 2,
    text: "安静练习",
  });
  const changed = buildAdvancedAssessmentIdentity({
    id: "fixed-assessment",
    version: 1,
    text: "安静复测",
  });

  assert.equal(spaced.contentFingerprint, compact.contentFingerprint);
  assert.equal(spaced.characterCount, 4);
  assert.equal(compact.scenarioVersion, 2);
  assert.notEqual(spaced.contentFingerprint, changed.contentFingerprint);
  assert.equal(isAdvancedAssessmentIdentity(spaced), true);
  assert.deepEqual(spaced.conditions, {
    version: 1,
    textNormalization: "nfc-without-whitespace",
    timingPolicy: "active-foreground-time",
    completionPolicy: "full-text",
  });
  assert.equal(isAdvancedAssessmentIdentity({ ...spaced, contentFingerprint: "forged" }), false);
  assert.equal(isAdvancedAssessmentIdentity({ ...spaced, characterCount: 0 }), false);
  assert.equal(isAdvancedAssessmentIdentity({ ...spaced, conditions: { ...spaced.conditions, version: 2 } }), false);
  const legacyIdentity = { ...spaced };
  delete legacyIdentity.conditions;
  assert.equal(isAdvancedAssessmentIdentity(legacyIdentity), true);
  assert.equal(isCurrentAdvancedAssessmentIdentity(legacyIdentity), false);
  assert.equal(isCurrentAdvancedAssessmentIdentity(spaced), true);
});

test("season validation rejects malformed goals, snapshots, schedules, and status timestamps", () => {
  const season = createAdvancedSeason("strict-v08", new Date("2026-08-01T08:00:00.000Z"));
  const identity = assessmentIdentity();
  const completedDay = completeAdvancedSeasonDay(
    season,
    assessmentSession(season, 1),
    new Date("2026-08-01T09:00:00.000Z"),
  );
  assert.equal(isAdvancedSeason(completedDay), true);
  assert.equal(isAdvancedSeason({
    ...season,
    goal: { version: 1, metric: "unknown" },
  }), false);
  assert.equal(isAdvancedSeason({
    ...season,
    goal: { version: 1, metric: "speed", targetMin: -1 },
  }), false);
  assert.equal(isAdvancedSeason({
    ...season,
    goal: { version: 1, metric: "speed", baselineValue: 100, targetMin: 108, targetMax: 103 },
  }), false);
  assert.equal(isAdvancedSeason({
    ...season,
    assessment: {
      version: 1,
      snapshots: [
        completedDay.assessment.snapshots[0],
        { ...completedDay.assessment.snapshots[0], sessionId: "duplicate-day" },
      ],
    },
  }), false);
  assert.equal(isAdvancedSeason({
    ...season,
    assessment: {
      version: 1,
      snapshots: [{
        ...completedDay.assessment.snapshots[0],
        identity: { ...identity, characterCount: 6000 },
      }],
    },
  }), false);
  assert.equal(isAdvancedSeason({
    ...season,
    days: season.days.map((day, index) => index === 3 ? { ...day, title: "被篡改" } : day),
  }), false);
  assert.equal(isAdvancedSeason({ ...season, status: "paused" }), false);
  assert.equal(isAdvancedSeason({
    ...season,
    status: "completed",
    completedAt: undefined,
  }), false);
  assert.equal(isAdvancedSeason({
    ...completedDay,
    currentDay: 1,
  }), false);
  assert.equal(isAdvancedSeason({
    ...completedDay,
    days: completedDay.days.map((day, index) => index === 1
      ? { ...day, completedAt: completedDay.days[0].completedAt, sessionId: "second-session" }
      : day),
    currentDay: 3,
    assessment: {
      version: 1,
      snapshots: [
        completedDay.assessment.snapshots[0],
        { ...completedDay.assessment.snapshots[0], day: 2, sessionId: "second-session" },
      ],
    },
  }), false);
  assert.equal(isAdvancedSeason({
    ...completedDay,
    days: completedDay.days.map((day, index) => index === 1
      ? { ...day, completedAt: "2026-08-02T09:00:00.000Z", sessionId: completedDay.days[0].sessionId }
      : day),
    currentDay: 3,
  }), false);
  assert.equal(isAdvancedSeason({
    ...completedDay,
    completedAt: "2026-07-31T09:00:00.000Z",
    status: "cancelled",
  }), false);
  assert.equal(isAdvancedSeason({
    ...completedDay,
    completedAt: "2026-08-01T08:30:00.000Z",
    status: "cancelled",
  }), false);
  assert.equal(isAdvancedSeason({
    ...completedDay,
    assessment: {
      ...completedDay.assessment,
      snapshots: completedDay.assessment.snapshots.map((snapshot) => ({
        ...snapshot,
        recordedAt: "2026-08-01T09:00:01.000Z",
      })),
    },
  }), false);
});

test("each season day requires a different local calendar day", () => {
  const season = createAdvancedSeason("daily-boundary", new Date(2026, 7, 1, 8));
  const dayOneTime = new Date(2026, 7, 1, 9);
  const dayOne = completeAdvancedSeasonDay(
    season,
    assessmentSession(season, 1, { date: dayOneTime.toISOString() }),
    dayOneTime,
  );
  assert.equal(dayOne.currentDay, 2);
  assert.equal(canCompleteAdvancedSeasonToday(dayOne, new Date(2026, 7, 1, 23, 59)), false);

  const blocked = completeAdvancedSeasonDay(
    dayOne,
    assessmentSession(dayOne, 2, { date: new Date(2026, 7, 1, 23, 59).toISOString() }),
    new Date(2026, 7, 1, 23, 59),
  );
  assert.equal(blocked, dayOne);
  assert.equal(canCompleteAdvancedSeasonToday(dayOne, new Date(2026, 7, 2, 0, 1)), true);
});

test("new seasons reject missing assessment identity and legacy active seasons close read-only", () => {
  const started = new Date("2026-08-01T08:00:00.000Z");
  const season = createAdvancedSeason("identity-required", started);
  const missingIdentity = session({
    seasonId: season.id,
    seasonDay: 1,
    date: "2026-08-02T08:00:00.000Z",
  });
  assert.equal(
    completeAdvancedSeasonDay(season, missingIdentity, new Date(missingIdentity.date)),
    season,
  );

  const legacy = {
    ...season,
    durationDays: undefined,
    goal: undefined,
    assessment: undefined,
    pausedDurationMs: undefined,
    baseline: { speed: 90, accuracy: 98, variationPercent: null, startupMs: null, recoveryMs: null },
  };
  assert.equal(isLegacyAdvancedSeason(legacy), true);
  assert.equal(isAdvancedSeason(legacy), true);
  const closed = completeAdvancedSeasonDay(
    legacy,
    { ...missingIdentity, assessmentIdentity: assessmentIdentity() },
    new Date(missingIdentity.date),
  );
  assert.equal(closed.status, "invalidated");
  assert.equal(closed.assessment, undefined);
  assert.equal(buildAdvancedSeasonEvaluation(closed).status, "legacy");
  const retiredOnLoad = invalidateAdvancedSeasonForContent(
    legacy,
    assessmentIdentity(),
    new Date(missingIdentity.date),
  );
  assert.equal(retiredOnLoad.status, "invalidated");
  assert.equal(buildAdvancedSeasonEvaluation(retiredOnLoad).status, "legacy");
});

test("pre-condition v0.8 identities remain loadable but are no longer comparable", () => {
  const initial = createAdvancedSeason("old-v08", new Date("2026-08-01T00:00:00.000Z"), {
    durationDays: 7,
  });
  const completed = completeAdvancedSeasonDay(
    initial,
    assessmentSession(initial, 1),
    new Date("2026-08-01T09:00:00.000Z"),
  );
  const oldSnapshot = structuredClone(completed.assessment.snapshots[0]);
  delete oldSnapshot.identity.conditions;
  const stored = {
    ...completed,
    assessment: { version: 1, snapshots: [oldSnapshot] },
  };
  assert.equal(isAdvancedSeason(stored), true);
  assert.equal(buildAdvancedSeasonEvaluation(stored, assessmentIdentity()).status, "invalidated");

  const oldIdentity = structuredClone(assessmentIdentity());
  delete oldIdentity.conditions;
  const blocked = completeAdvancedSeasonDay(
    initial,
    assessmentSession(initial, 1, { assessmentIdentity: oldIdentity }),
    new Date("2026-08-01T09:00:00.000Z"),
  );
  assert.equal(blocked, initial);

  const secondSnapshot = {
    ...completed.assessment.snapshots[0],
    day: 2,
    sessionId: "old-same-day-two",
    recordedAt: "2026-08-01T10:00:00.000Z",
  };
  const oldSameDay = {
    ...completed,
    calendarDayPolicy: undefined,
    currentDay: 3,
    days: completed.days.map((day) => day.day === 2
      ? { ...day, completedAt: secondSnapshot.recordedAt, sessionId: secondSnapshot.sessionId }
      : day),
    assessment: {
      version: 1,
      snapshots: [completed.assessment.snapshots[0], secondSnapshot],
    },
  };
  assert.equal(isAdvancedSeason(oldSameDay), true);
  assert.equal(isAdvancedSeason({ ...oldSameDay, calendarDayPolicy: "one-per-local-day" }), false);
});

test("pause and resume exclude background time by extending expiration", () => {
  const season = createAdvancedSeason("pause-season", new Date("2026-08-01T08:00:00.000Z"));
  const paused = pauseAdvancedSeason(season, new Date("2026-08-05T08:00:00.000Z"));
  const resumed = resumeAdvancedSeason(paused, new Date("2026-08-08T20:00:00.000Z"));

  assert.equal(paused.status, "paused");
  assert.equal(paused.pausedAt, "2026-08-05T08:00:00.000Z");
  assert.equal(resumed.status, "active");
  assert.equal(resumed.expiresAt, "2026-08-25T20:00:00.000Z");
  assert.equal(resumed.pausedDurationMs, 3.5 * 24 * 60 * 60 * 1000);
  assert.equal(resumed.pausedAt, undefined);
  assert.equal(isAdvancedSeason(resumed), true);
  assert.equal(expireAdvancedSeason(resumed, new Date("2026-08-23T00:00:00.000Z")).status, "active");
});

test("cancelling a plan preserves completed session records and closes only the season", () => {
  const season = createAdvancedSeason("cancel-season", new Date("2026-07-31T08:00:00.000Z"));
  const result = assessmentSession(season, 1);
  const completedDay = completeAdvancedSeasonDay(season, result, new Date(result.date));
  const sessions = [result];
  const cancelled = cancelAdvancedSeason(completedDay, new Date("2026-08-03T08:00:00.000Z"));

  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.days[0].sessionId, result.id);
  assert.equal(cancelled.assessment.snapshots[0].sessionId, result.id);
  assert.deepEqual(sessions, [result]);
  assert.equal(isAdvancedSeason(cancelled), true);
});

test("evaluation compares baseline, process, and same-content retests with tradeoff costs", () => {
  let season = createAdvancedSeason("evaluation-season", new Date("2026-08-01T00:00:00.000Z"), {
    durationDays: 7,
    goalMetric: "speed",
  });
  const speeds = [100, 105, 110, 115, 120, 112, 108];
  for (let day = 1; day <= 7; day += 1) {
    const isComparableDay = day === 1 || day >= 5;
    season = completeAdvancedSeasonDay(
      season,
      assessmentSession(season, day, {
        speed: speeds[day - 1],
        accuracy: day === 7 ? 96.9 : 98,
        keyAccuracy: day === 7 ? 96 : 97,
        codeLength: day === 7 ? 2.86 : 2.8,
        assessmentIdentity: isComparableDay
          ? assessmentIdentity()
          : assessmentIdentity({ scenarioId: `process-${day}` }),
      }),
      new Date(Date.UTC(2026, 7, day, 9)),
    );
  }

  const evaluation = buildAdvancedSeasonEvaluation(season, assessmentIdentity());
  assert.equal(evaluation.status, "comparable");
  assert.equal(evaluation.baseline.day, 1);
  assert.equal(evaluation.final.day, 7);
  assert.equal(evaluation.stageRetest.day, 6);
  assert.deepEqual(evaluation.retests.map((item) => item.day), [5, 6, 7]);
  assert.equal(evaluation.processSampleCount, 5);
  assert.equal(evaluation.processAverage, 112.4);
  assert.equal(evaluation.primaryBaseline, 100);
  assert.equal(evaluation.primaryFinal, 108);
  assert.equal(evaluation.primaryDelta, 8);
  assert.equal(evaluation.targetReached, true);
  assert.equal(evaluation.confidence, "moderate");
  assert.deepEqual(evaluation.tradeoffs, {
    characterAccuracy: "cost",
    keyAccuracy: "protected",
    codeLength: "cost",
  });
});

test("goal result must fall inside both ends of the observation range", () => {
  let season = createAdvancedSeason("strict-range", new Date("2026-08-01T00:00:00.000Z"), {
    durationDays: 7,
    goalMetric: "speed",
  });
  for (let day = 1; day <= 7; day += 1) {
    season = completeAdvancedSeasonDay(
      season,
      assessmentSession(season, day, { speed: day === 7 ? 200 : 100 }),
      new Date(Date.UTC(2026, 7, day, 9)),
    );
  }
  assert.deepEqual(
    { min: season.goal.targetMin, max: season.goal.targetMax },
    { min: 103, max: 108 },
  );
  assert.equal(buildAdvancedSeasonEvaluation(season, assessmentIdentity()).targetReached, false);
});

test("forged stage conditions cannot advance or become a comparable retest", () => {
  const base = createAdvancedSeason("stage-retest", new Date("2026-08-01T00:00:00.000Z"), {
    durationDays: 7,
  });
  let season = base;
  for (let day = 1; day <= 6; day += 1) {
    season = completeAdvancedSeasonDay(
      season,
      assessmentSession(season, day, {
        assessmentIdentity: day === 6
          ? assessmentIdentity({
              conditions: { ...assessmentIdentity().conditions, timingPolicy: "forged" },
            })
          : assessmentIdentity(),
      }),
      new Date(Date.UTC(2026, 7, day, 9)),
    );
  }
  // Day six is rejected before it can enter the season archive.
  assert.equal(season.currentDay, 6);
  assert.equal(isAdvancedSeason(season), true);
  assert.equal(buildAdvancedSeasonEvaluation(season, assessmentIdentity()).stageRetest, null);
});

test("content changes invalidate old assessment evidence instead of claiming improvement", () => {
  const initial = createAdvancedSeason("content-change", new Date("2026-08-01T00:00:00.000Z"), {
    durationDays: 7,
  });
  const withBaseline = completeAdvancedSeasonDay(
    initial,
    assessmentSession(initial, 1),
    new Date("2026-08-01T09:00:00.000Z"),
  );
  const changedIdentity = buildAdvancedAssessmentIdentity({
    id: "fixed-assessment",
    version: 2,
    text: "安静练习保持节奏完成并复测",
  });
  const invalidated = invalidateAdvancedSeasonForContent(
    withBaseline,
    changedIdentity,
    new Date("2026-08-02T09:00:00.000Z"),
  );
  const evaluation = buildAdvancedSeasonEvaluation(invalidated, changedIdentity);

  assert.equal(invalidated.status, "invalidated");
  assert.equal(invalidated.completedAt, "2026-08-02T09:00:00.000Z");
  assert.equal(invalidated.assessment.invalidatedAt, "2026-08-02T09:00:00.000Z");
  assert.match(invalidated.assessment.invalidationReason, /正文/);
  assert.equal(evaluation.status, "invalidated");
  assert.equal(evaluation.targetReached, null);
  assert.match(evaluation.message, /只读摘要/);
  assert.equal(isAdvancedSeason(invalidated), true);
});

test("assessment condition changes invalidate an otherwise identical text", () => {
  const initial = createAdvancedSeason("condition-change", new Date("2026-08-01T00:00:00.000Z"), {
    durationDays: 7,
  });
  const withBaseline = completeAdvancedSeasonDay(
    initial,
    assessmentSession(initial, 1),
    new Date("2026-08-01T09:00:00.000Z"),
  );
  const currentIdentity = assessmentIdentity({
    conditions: { ...assessmentIdentity().conditions, timingPolicy: "wall-clock-time" },
  });
  const invalidated = invalidateAdvancedSeasonForContent(
    withBaseline,
    currentIdentity,
    new Date("2026-08-02T09:00:00.000Z"),
  );
  assert.equal(invalidated.status, "invalidated");
  assert.equal(buildAdvancedSeasonEvaluation(invalidated, currentIdentity).status, "invalidated");
});

test("evaluation reports missing or limited samples without inventing a conclusion", () => {
  const empty = createAdvancedSeason("empty-evaluation", new Date("2026-08-01T00:00:00.000Z"), {
    durationDays: 7,
  });
  const missing = buildAdvancedSeasonEvaluation(empty);
  assert.equal(missing.status, "missing-baseline");
  assert.equal(missing.confidence, "insufficient");
  assert.equal(missing.targetReached, null);
  assert.match(missing.message, /暂不判断提升/);

  const withBaseline = completeAdvancedSeasonDay(
    empty,
    assessmentSession(empty, 1),
    new Date("2026-08-01T09:00:00.000Z"),
  );
  const baselineSnapshot = withBaseline.assessment.snapshots[0];
  const finalSnapshot = {
    ...baselineSnapshot,
    day: 7,
    sessionId: "single-final",
    recordedAt: "2026-08-07T09:00:00.000Z",
    metrics: { ...baselineSnapshot.metrics, speed: 106 },
  };
  const oneRetest = {
    ...withBaseline,
    assessment: {
      version: 1,
      snapshots: [baselineSnapshot, finalSnapshot],
    },
  };
  const limited = buildAdvancedSeasonEvaluation(oneRetest, assessmentIdentity());
  assert.equal(limited.status, "comparable");
  assert.equal(limited.confidence, "limited");
  assert.equal(limited.processSampleCount, 0);
  assert.equal(limited.processAverage, null);
  assert.match(limited.message, /样本较少/);

  const noOptionalMetrics = buildAdvancedSeasonEvaluation({
    ...oneRetest,
    assessment: {
      version: 1,
      snapshots: [baselineSnapshot, {
        ...finalSnapshot,
        metrics: {
          ...finalSnapshot.metrics,
          keyAccuracy: null,
          codeLength: null,
        },
      }],
    },
  });
  assert.equal(noOptionalMetrics.tradeoffs.keyAccuracy, "unavailable");
  assert.equal(noOptionalMetrics.tradeoffs.codeLength, "unavailable");
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
  const season = createAdvancedSeason("atomic-season", new Date("2026-07-31T08:00:00.000Z"));
  const result = assessmentSession(season, 1);
  const completed = completeAdvancedSeasonDay(
    season,
    result,
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

test("a repeated saved session still repairs its missing season write", () => {
  const season = createAdvancedSeason("idempotent-season", new Date("2026-07-31T08:00:00.000Z"));
  const result = assessmentSession(season, 1);
  const completed = completeAdvancedSeasonDay(season, result, new Date(result.date));
  const repairedArchive = { version: 1, active: completed, history: [] };
  const values = new Map([
    [STORAGE.sessions, JSON.stringify([result])],
    [STORAGE.advancedSeason, JSON.stringify({ version: 1, active: season, history: [] })],
  ]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
  try {
    assert.equal(saveAdvancedPracticeOutcome(result, repairedArchive), true);
    assert.equal(JSON.parse(values.get(STORAGE.sessions)).length, 1);
    assert.equal(JSON.parse(values.get(STORAGE.advancedSeason)).active.currentDay, 2);
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
  assert.match(component, /阶段目标与评测/);
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

test("advanced page exposes the complete v0.8 goal and assessment contract", async () => {
  const component = await readFile(new URL("../app/components/AdvancedCenter.tsx", import.meta.url), "utf8");

  assert.match(component, /\{ id: "season", label: "阶段目标", note: "7 或 14 日同条件评测" \}/);
  assert.match(
    component,
    /const goalMetricOrder: AdvancedGoalMetric\[\] = \[\s*"speed",\s*"characterAccuracy",\s*"keyAccuracy",\s*"codeLength",\s*"phrase",\s*"stability",\s*\]/,
  );
  assert.match(component, /role="group" aria-label="阶段训练主目标"/);
  assert.match(component, /goalMetricOrder\.map\(\(metric\) => \([\s\S]*aria-pressed=\{goalMetric === metric\}[\s\S]*setGoalMetric\(metric\)[\s\S]*ADVANCED_GOAL_LABELS\[metric\]/);
  assert.match(component, /useState<7 \| 14>\(14\)/);
  assert.match(component, /\(\[7, 14\] as const\)\.map\(\(duration\) =>/);
  assert.match(component, /aria-label="训练周期长度"/);
  assert.match(component, /duration === 7 \? "最多 10 天完成" : "最多 21 天完成"/);
  assert.match(component, /createAdvancedSeason\(createLocalId\(\), new Date\(\), \{\s*durationDays,\s*goalMetric,\s*\}\)/);

  assert.match(component, /archive\.active\.status === "paused" \? "继续目标" : "暂停目标"/);
  assert.match(component, /updateSeason\(\(season\) => resumeAdvancedSeason\(season\), "计划已继续，暂停时间不会占用完成窗口。"\)/);
  assert.match(component, /updateSeason\(\(season\) => pauseAdvancedSeason\(season\), "计划已暂停，已有成绩和基线均会保留。"\)/);
  assert.match(component, /确定取消当前阶段目标吗？已有练习成绩会保留/);
  assert.match(component, /updateSeason\(\(season\) => cancelAdvancedSeason\(season\), "阶段目标已取消；已有成绩没有删除。"\)/);

  assert.match(component, /invalidateAdvancedSeasonForContent\(\s*current\.active,\s*currentIdentity,\s*\)/);
  assert.match(component, /评测正文已经变化，旧周期已转为只读摘要。/);
  assert.match(component, /latestSeason\.status === "invalidated" \? "正文变化后失效"/);
  assert.match(component, /<h3 id=\{`season-evaluation-\$\{season\.id\}`\}>基线、过程与复测<\/h3>/);
  assert.match(component, /<span>阶段复测<\/span><strong>\{formatGoalValue\(metric, stageRetestValue\)\}<\/strong>/);
  assert.match(component, /canCompleteAdvancedSeasonToday\(archive\.active, new Date\(seasonClock\)\)/);
  assert.match(component, /下一训练日明天开放/);
  assert.match(component, /字准：\{tradeoffLabel\(evaluation\.tradeoffs\.characterAccuracy, "未见明显代价", "出现下降代价"\)\}/);
  assert.match(component, /键准：\{tradeoffLabel\(evaluation\.tradeoffs\.keyAccuracy, "未见明显代价", "出现下降代价"\)\}/);
  assert.match(component, /码长：\{tradeoffLabel\(evaluation\.tradeoffs\.codeLength, "未见明显代价", "出现上升代价"\)\}/);
  assert.match(component, /可比样本较少，结果不代表长期水平。/);
  assert.match(component, /数据不足时不会生成提升结论。/);

  assert.match(component, /assessmentIdentity: buildAdvancedAssessmentIdentity\(identitySource\)/);
  assert.match(component, /assessmentIdentity: target\.assessmentIdentity/);
  assert.match(component, /seasonId: target\.season\?\.id,\s*seasonDay: target\.seasonDay/);
});
