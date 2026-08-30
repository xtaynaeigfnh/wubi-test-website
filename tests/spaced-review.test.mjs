import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_DAILY_REVIEW_LIMIT,
  MAX_SPACED_REVIEW_ITEMS,
  applyReviewOutcome,
  buildDueReviewQueue,
  createEmptySpacedReviewState,
  deferReviewItem,
  isSpacedReviewState,
  migrateLegacyReviewState,
  upsertReviewTargets,
} from "../app/spaced-review.ts";

function at(value) {
  return new Date(value);
}

function localDay(value) {
  const date = new Date(value);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()];
}

function hesitationTarget(overrides = {}) {
  const target = {
    version: 1,
    id: "hesitation-target-a",
    fingerprint: "五笔输入练习需要稳定节奏\u00004\u00002",
    sourceSessionId: "article-source",
    articleId: "article-a",
    sourceTitle: "练习文章甲",
    sourceDate: "2026-08-18T09:00:00+08:00",
    text: "五笔输入练习需要稳定节奏",
    sourceStart: 3,
    focusOffset: 4,
    focusLength: 2,
    sourceDelayMs: 2100,
    baselineMs: 500,
    thresholdMs: 1000,
    ...overrides,
  };
  return target;
}

function dueState(now = at("2026-08-29T10:00:00+08:00")) {
  return upsertReviewTargets(createEmptySpacedReviewState(), [
    { targetType: "character", text: "测", code: "im", severity: 2, expectedBenefit: 2 },
  ], now);
}

test("strict state validation rejects malformed, duplicate and alternate identities", () => {
  const valid = dueState();
  assert.equal(isSpacedReviewState(valid), true);
  assert.equal(isSpacedReviewState({ ...valid, version: 2 }), false);
  assert.equal(isSpacedReviewState({ ...valid, items: [...valid.items, valid.items[0]] }), false);
  assert.equal(isSpacedReviewState({
    ...valid,
    items: [{ ...valid.items[0], targetId: "alternate-id" }],
  }), false);
  assert.equal(isSpacedReviewState({
    ...valid,
    items: [{ ...valid.items[0], dueAt: "not-a-date" }],
  }), false);
  assert.equal(isSpacedReviewState({
    ...valid,
    items: [{ ...valid.items[0], code: undefined }],
  }), false);
  const validHesitation = upsertReviewTargets(createEmptySpacedReviewState(), [{
    targetType: "hesitation",
    text: hesitationTarget().text,
    hesitationTarget: hesitationTarget(),
  }]);
  assert.equal(isSpacedReviewState(validHesitation), true);
  assert.equal(isSpacedReviewState({
    ...validHesitation,
    items: [{
      ...validHesitation.items[0],
      targetId: "forged-fingerprint",
      hesitationTarget: {
        ...validHesitation.items[0].hesitationTarget,
        fingerprint: "forged-fingerprint",
      },
    }],
  }), false);
});

test("target upsert canonicalizes identities, deduplicates and enforces capacity", () => {
  const now = at("2026-08-29T10:00:00+08:00");
  const targets = Array.from({ length: MAX_SPACED_REVIEW_ITEMS + 20 }, (_, index) => {
    const text = `稳定${String.fromCodePoint(0x4e00 + index)}`;
    return {
      targetType: "hesitation",
      targetId: `ignored-${index}`,
      text,
      hesitationTarget: hesitationTarget({
        id: `hesitation-${index}`,
        fingerprint: `${text}\u00000\u00001`,
        text,
        focusOffset: 0,
        focusLength: 1,
      }),
      severity: 1 + (index % 5),
    };
  });
  const state = upsertReviewTargets(createEmptySpacedReviewState(), [
    { targetType: "character", targetId: "first", text: "测", code: "IM", severity: 1 },
    { targetType: "character", targetId: "second", text: "测", code: "im", severity: 5 },
    ...targets,
  ], now);
  assert.equal(state.items.length, MAX_SPACED_REVIEW_ITEMS);
  assert.equal(state.items.filter((item) => item.text === "测").length, 1);
  assert.equal(state.items.find((item) => item.text === "测")?.targetId, "测");
  assert.equal(state.items.find((item) => item.text === "测")?.severity, 5);
});

test("due queue applies daily cap and ranks overdue, severity and benefit stably", () => {
  const now = at("2026-08-29T12:00:00+08:00");
  let state = upsertReviewTargets(createEmptySpacedReviewState(), [
    { targetType: "character", text: "甲", code: "a", severity: 5, expectedBenefit: 10 },
    { targetType: "character", text: "乙", code: "b", severity: 1, expectedBenefit: 1 },
    { targetType: "character", text: "丙", code: "c", severity: 5, expectedBenefit: 20 },
  ], now);
  state = {
    ...state,
    items: state.items.map((item) => ({
      ...item,
      dueAt: item.text === "乙"
        ? "2026-08-26T00:00:00+08:00"
        : "2026-08-28T00:00:00+08:00",
    })),
  };
  const queue = buildDueReviewQueue(state, { now, limit: 2 });
  assert.equal(queue.limit, 2);
  assert.equal(queue.totalDue, 3);
  assert.deepEqual(queue.items.map((item) => item.text), ["乙", "丙"]);
  assert.equal(buildDueReviewQueue(state, { now, limit: 999 }).limit, DEFAULT_DAILY_REVIEW_LIMIT);
});

test("correct outcomes extend gradually while failures shorten without negative intervals", () => {
  const firstDay = at("2026-08-29T10:00:00+08:00");
  let state = dueState(firstDay);
  state = applyReviewOutcome(state, {
    targetType: "character",
    targetId: "测",
    outcome: "correct",
    reviewedAt: firstDay,
  });
  assert.equal(state.items[0].level, 1);
  assert.equal(state.items[0].intervalDays, 2);
  assert.deepEqual(localDay(state.items[0].dueAt), [2026, 8, 31]);

  state = applyReviewOutcome(state, {
    targetType: "character",
    targetId: "测",
    outcome: "correct",
    reviewedAt: at("2026-08-31T11:00:00+08:00"),
  });
  assert.equal(state.items[0].intervalDays, 4);

  state = applyReviewOutcome(state, {
    targetType: "character",
    targetId: "测",
    outcome: "incorrect",
    reviewedAt: at("2026-09-04T09:00:00+08:00"),
  });
  assert.equal(state.items[0].level, 0);
  assert.equal(state.items[0].intervalDays, 1);
  assert.equal(state.items[0].correctStreak, 0);
  assert.deepEqual(localDay(state.items[0].dueAt), [2026, 9, 5]);
});

test("same-day repeats and clock rollback cannot keep postponing an item", () => {
  const first = at("2026-08-29T08:00:00+08:00");
  let state = applyReviewOutcome(dueState(first), {
    targetType: "character",
    targetId: "测",
    outcome: "correct",
    reviewedAt: first,
  });
  const scheduled = state.items[0].dueAt;
  state = applyReviewOutcome(state, {
    targetType: "character",
    targetId: "测",
    outcome: "correct",
    reviewedAt: at("2026-08-29T22:00:00+08:00"),
  });
  assert.equal(state.items[0].dueAt, scheduled);
  assert.equal(state.items[0].level, 1);

  state = applyReviewOutcome(state, {
    targetType: "character",
    targetId: "测",
    outcome: "incorrect",
    reviewedAt: at("2026-07-01T10:00:00+08:00"),
  });
  assert.notEqual(state.items[0].dueAt, scheduled);
  assert.equal(state.items[0].intervalDays, 1);
  assert.equal(state.items[0].lastOutcome, "incorrect");
  assert.equal(state.items[0].correctStreak, 0);
  assert.ok(state.items[0].intervalDays >= 1);
});

test("restoring a clock after a future-dated review brings failures back near today", () => {
  const restoredNow = at("2026-08-29T10:00:00+08:00");
  const futureState = {
    version: 1,
    items: [{
      ...dueState(restoredNow).items[0],
      dueAt: "2031-01-03T00:00:00+08:00",
      lastReviewedAt: "2031-01-01T10:00:00+08:00",
      intervalDays: 2,
      level: 1,
      lastOutcome: "correct",
    }],
  };
  const repaired = applyReviewOutcome(futureState, {
    targetType: "character",
    targetId: "测",
    outcome: "incorrect",
    reviewedAt: restoredNow,
  });
  assert.deepEqual(localDay(repaired.items[0].dueAt), [2026, 8, 30]);
  assert.equal(repaired.items[0].lastReviewedAt, restoredNow.toISOString());
  assert.equal(repaired.items[0].intervalDays, 1);
});

test("queue and outcomes use the current clock when now is omitted", () => {
  const now = new Date();
  const state = dueState(new Date(now.getTime() - 60_000));
  assert.equal(buildDueReviewQueue(state).totalDue, 1);
  const updated = applyReviewOutcome(state, {
    targetType: "character",
    targetId: "测",
    outcome: "correct",
  });
  assert.ok(Date.parse(updated.items[0].lastReviewedAt) >= now.getTime());
});

test("deferral only moves a due item to next local day and reports it visibly", () => {
  const now = at("2026-08-31T23:30:00+08:00");
  let state = dueState(now);
  state = deferReviewItem(state, "character", "测", now);
  assert.deepEqual(localDay(state.items[0].dueAt), [2026, 9, 1]);
  const deferredDueAt = state.items[0].dueAt;
  state = deferReviewItem(state, "character", "测", at("2026-08-31T23:59:00+08:00"));
  assert.equal(state.items[0].dueAt, deferredDueAt);
  const queue = buildDueReviewQueue(state, { now });
  assert.equal(queue.totalDue, 0);
  assert.equal(queue.deferredToday, 1);
});

test("legacy migration preserves computed scheduling fields and deduplicates sources", () => {
  const now = at("2026-08-29T10:00:00+08:00");
  const target = hesitationTarget();
  const state = migrateLegacyReviewState({
    now,
    errors: [{
      text: "测",
      code: "im",
      count: 4,
      lastSeen: "2026-08-28T10:00:00+08:00",
      mastery: 4,
      correctStreak: 4,
      lastCorrect: "2026-08-28T10:00:00+08:00",
    }, {
      text: "。",
      count: 3,
      lastSeen: "2026-08-28T10:00:00+08:00",
    }, {
      text: "词组",
      count: 2,
      lastSeen: "2026-08-28T10:00:00+08:00",
    }],
    phraseOpportunities: [{
      text: "输入",
      code: "lwty",
      characterCount: 2,
      savedKeys: 3,
      opportunityCount: 5,
      practiceCount: 2,
      correctCount: 2,
      lastSeen: "2026-08-28T10:00:00+08:00",
    }],
    hesitationQueue: {
      version: 1,
      date: "2026-08-29",
      items: [{
        id: target.id,
        target,
        status: "completed",
        estimatedMinutes: 1,
        addedAt: "2026-08-28T08:00:00+08:00",
        startedAt: "2026-08-28T09:00:00+08:00",
        completedAt: "2026-08-28T09:05:00+08:00",
        sessionId: "hesitation-result",
        outcome: "mastered",
      }],
    },
  });
  assert.equal(isSpacedReviewState(state), true);
  assert.deepEqual(state.items.map((item) => item.targetType).sort(), ["character", "hesitation", "phrase"]);
  const character = state.items.find((item) => item.targetType === "character");
  assert.equal(character.level, 4);
  assert.equal(character.intervalDays, 14);
  assert.equal(character.lastOutcome, "correct");
  assert.notEqual(character.dueAt, now.toISOString());
  const hesitation = state.items.find((item) => item.targetType === "hesitation");
  assert.equal(hesitation.targetId, target.fingerprint);
  assert.equal(hesitation.intervalDays, 2);
});

test("invalid dates fall back deterministically to the Unix epoch", () => {
  const state = upsertReviewTargets(createEmptySpacedReviewState(), [
    { targetType: "character", text: "测", code: "im" },
  ], new Date(Number.NaN));
  assert.equal(state.items[0].createdAt, "1970-01-01T00:00:00.000Z");
});
