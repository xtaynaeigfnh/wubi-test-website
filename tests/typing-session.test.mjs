import assert from "node:assert/strict";
import test from "node:test";
import {
  createTypingSession,
  isTypingComplete,
  typingElapsed,
  typingSessionReducer as reduce,
} from "../app/typing-session.ts";
import { MAX_PHYSICAL_RHYTHM_SAMPLES } from "../app/rhythm-lab.ts";
import { buildTypingOutcome } from "../app/typing-outcome.ts";
import { getProgress, getSessions, savePracticeOutcome } from "../app/practice-store.ts";
import { STORAGE } from "../app/storage.ts";

const target = "五笔练习";
const article = { id: "short-session-test", title: "会话测试", text: target, length: "short", topic: "日常", wordCount: 4, version: 1 };
const start = (now = 0) => reduce(createTypingSession(), { type: "start", now });
const commit = (state, value, now, text = target) => reduce(state, { type: "commit", value, target: text, now });
const key = (state, key = "w", code = "KeyW", now = 0, composing = false) =>
  reduce(state, { type: "key", key, code, now, composing });
const outcomeFor = (state, id = "session-test") => buildTypingOutcome({
  state, article, visibleText: target, targetText: target, id,
  wubiCodes: new Map([["五", "gg"], ["笔", "ttfn"]]),
  theoreticalCodeLength: 2, codeLengthAnalysis: null,
});

test("后台重置练习后仍拒绝输入，返回前台才开始新一轮计时", () => {
  let state = reduce(start(), { type: "visibility", hidden: true, now: 1000 });
  state = reduce(state, { type: "reset", retryCount: 1 });
  assert.strictEqual(commit(state, "五", 5000), state);
  assert.strictEqual(key(state, "w", "KeyW", 6000), state);
  state = reduce(state, { type: "visibility", hidden: false, now: 10000 });
  state = commit(state, "五", 11000);
  assert.equal(state.clock.startedAt, 11000);
  assert.equal(typingElapsed(state, 12000), 1);
  assert.equal(state.retryCount, 1);
});

// These tests exercise public event sequences and results, not Hook order/source text.
test("首次按键、输入法启动和直接提交均开始计时，重复开始不改变起点", () => {
  assert.equal(key(createTypingSession()).phase.status, "running");
  assert.equal(key(createTypingSession(), "Process", "", 123).clock.startedAt, 123);
  assert.equal(commit(createTypingSession(), "五", 456).clock.startedAt, 456);
  let state = start(0);
  state = reduce(state, { type: "start", now: 2000 });
  assert.equal(state.clock.startedAt, 0);
  assert.equal(typingElapsed(state, 3000), 3);
});

test("输入法预编辑不计入成绩，Unicode提交与回改统一更新统计且不修改旧快照", () => {
  let state = start();
  const untouched = structuredClone(state);
  state = reduce(state, { type: "preedit", value: "qingxi" });
  assert.equal(state.typed, "");
  assert.equal(state.attemptCount, 0);
  const preedit = state;
  state = commit(state, "五错", 1000);
  assert.equal(preedit.typed, "");
  assert.equal(preedit.errorPositions.size, 0);
  assert.equal(state.attemptCount, 2);
  assert.equal(state.correctAttemptCount, 1);
  assert.deepEqual([...state.errorPositions], [1]);
  const mistaken = state;
  state = commit(state, "五笔", 2000);
  assert.equal(state.correctionCount, 1);
  assert.equal(state.attemptCount, 3);
  assert.equal(state.correctAttemptCount, 2);
  assert.equal(state.correctionPositions.get(1), 1);
  assert.equal(mistaken.correctionPositions.size, 0);
  assert.deepEqual(untouched, start());
  const unicode = commit(start(), "𠀀\n五\r笔多余", 1000, "𠀀五笔");
  assert.equal(unicode.typed, "𠀀五笔");
  assert.equal(unicode.correctAttemptCount, 3);
  assert.equal(unicode.phase.status, "completed");
});

test("暂停与后台切换排除离开时间，同时保留暂停前的卡顿采样", () => {
  let state = start();
  state = key(state, "w", "KeyW", 500);
  state = commit(state, "五", 1000);
  state = reduce(state, { type: "pause", now: 2000 });
  assert.equal(state.phase.status, "paused");
  assert.equal(typingElapsed(state, 9000), 2);
  assert.strictEqual(commit(state, target, 5000), state);
  assert.strictEqual(key(state), state);
  state = reduce(state, { type: "visibility", hidden: true, now: 3000 });
  state = reduce(state, { type: "visibility", hidden: false, now: 9000 });
  state = reduce(state, { type: "resume", now: 10000 });
  state = reduce(state, { type: "visibility", hidden: true, now: 11000 });
  state = reduce(state, { type: "visibility", hidden: false, now: 20000 });
  state = commit(state, "五笔", 21000);
  assert.equal(state.elapsed, 4);
  assert.equal(state.pauseCount, 1);
  assert.equal(state.clock.pausedDurationMs, 8000);
  assert.equal(state.clock.inactiveDurationMs, 9000);
  assert.equal(state.typingDelays[1], 3000);
  assert.deepEqual(state.physicalRhythmSamples, [{ elapsedMs: 500, hand: "left" }]);
});

test("后台期间暂停并恢复时，重叠时间只扣除一次，重复事件不重复计时", () => {
  let state = start();
  for (const event of [
    { type: "visibility", hidden: true, now: 1000 },
    { type: "visibility", hidden: true, now: 2000 },
    { type: "pause", now: 3000 },
    { type: "pause", now: 4000 },
    { type: "resume", now: 5000 },
    { type: "resume", now: 6000 },
    { type: "visibility", hidden: false, now: 7000 },
    { type: "visibility", hidden: false, now: 8000 },
  ]) state = reduce(state, event);
  assert.equal(typingElapsed(state, 9000), 3);
  assert.equal(state.pauseCount, 1);
  assert.equal(state.clock.pausedDurationMs, 2000);
  assert.equal(state.clock.inactiveDurationMs, 4000);
});

test("完成事件立即冻结全部统计和时间，最后一个错字也进入结算", () => {
  let state = start();
  state = key(state);
  state = commit(state, "五笔练错", 4000);
  assert(isTypingComplete(state));
  assert.equal(state.elapsed, 4);
  assert.deepEqual([...state.errorPositions], [3]);
  for (const event of [
    { type: "commit", value: target, target, now: 5000 },
    { type: "preedit", value: "qingxi" },
    { type: "start", now: 6000 },
    { type: "key", key: "a", code: "KeyA", composing: false, now: 6000 },
    { type: "pause", now: 6000 },
    { type: "resume", now: 7000 },
    { type: "tick", now: 8000 },
    { type: "visibility", hidden: true, now: 9000 },
  ]) assert.strictEqual(reduce(state, event), state);
  assert.equal(typingElapsed(state, 9000), 4);
  const outcome = outcomeFor(state);
  assert.equal(outcome.session.date, new Date(4000).toISOString());
  assert.equal(outcome.session.errors, 1);
  assert.deepEqual(outcome.session.errorChars, ["习"]);
  assert(outcome.observations.some((item) => item.text === "习" && item.kind === "coding-error"));
});

test("同一轮只能结算一次，保存失败保留原结果并阻止重置，成功后忽略迟到的失败", () => {
  let state = commit(start(), target, 1000);
  assert.strictEqual(reduce(state, { type: "reset", retryCount: 1 }), state);
  const outcome = outcomeFor(state);
  state = reduce(state, { type: "settle", outcome });
  assert.strictEqual(reduce(state, { type: "settle", outcome: outcomeFor(state, "duplicate") }), state);
  state = reduce(state, { type: "save-result", sessionId: outcome.session.id, saved: false });
  assert.equal(state.phase.status, "save-failed");
  assert.strictEqual(state.phase.outcome, outcome);
  assert.strictEqual(reduce(state, { type: "reset", retryCount: 1 }), state);
  assert.strictEqual(reduce(state, { type: "save-result", sessionId: "other", saved: true }), state);
  state = reduce(state, { type: "save-result", sessionId: outcome.session.id, saved: true });
  assert.equal(state.phase.status, "completed");
  assert.equal(state.phase.saved, true);
  assert.strictEqual(reduce(state, { type: "save-result", sessionId: outcome.session.id, saved: false }), state);
});

test("从练习中、暂停中和已保存状态重来均清空所有采样与统计，仅保留指定重打次数", () => {
  let running = key(start());
  running = key(running, "1", "Digit1", 200, true);
  running = commit(running, "错", 500);
  running = key(running, "Backspace", "Backspace", 700);
  running = commit(running, "五", 1000);
  running = reduce(running, { type: "preedit", value: "五bi" });
  const paused = reduce(running, { type: "pause", now: 2000 });
  let completed = commit(running, target, 3000);
  completed = reduce(completed, { type: "settle", outcome: outcomeFor(completed) });
  completed = reduce(completed, { type: "save-result", sessionId: "session-test", saved: true });
  for (const previous of [running, paused, completed]) {
    const reset = reduce(previous, { type: "reset", retryCount: 2 });
    assert.deepEqual(reset, createTypingSession(2));
    assert.notStrictEqual(reset.errorPositions, previous.errorPositions);
    assert.notStrictEqual(reset.correctionPositions, previous.correctionPositions);
    assert.equal(commit(reset, "五", 5000).clock.startedAt, 5000);
  }
});

test("暂停会清除未提交候选文本，恢复后仍从最后提交的文本继续", () => {
  let state = commit(start(), "五", 1000);
  state = reduce(state, { type: "preedit", value: "五bi" });
  state = reduce(state, { type: "pause", now: 2000 });
  assert.equal(state.inputValue, "五");
  assert.strictEqual(reduce(state, { type: "preedit", value: "五笔" }), state);
  state = reduce(state, { type: "resume", now: 5000 });
  state = commit(state, "五笔", 6000);
  assert.equal(state.correctAttemptCount, 2);
  assert.equal(state.elapsed, 3);
});

test("结算保存重试只增加一次成绩、文章进度和弱项统计", (context) => {
  const values = new Map();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  let fail = true;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (fail && key === STORAGE.progress) throw new DOMException("full", "QuotaExceededError");
      values.set(key, value);
    },
    removeItem: (key) => values.delete(key),
  } } });
  context.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
  });
  let state = commit(start(), "五错", 1000);
  state = commit(state, target, 4000);
  const outcome = outcomeFor(state);
  state = reduce(state, { type: "settle", outcome });
  const save = () => {
    const saved = savePracticeOutcome(outcome.session, outcome.observations, outcome.phraseOpportunities);
    state = reduce(state, { type: "save-result", sessionId: outcome.session.id, saved });
    return saved;
  };
  assert.equal(save(), false);
  assert.equal(state.phase.status, "save-failed");
  assert.equal(getSessions().length, 0);
  assert.equal(getProgress().length, 0);
  fail = false;
  assert.equal(save(), true);
  const savedValues = new Map(values);
  assert.equal(save(), true);
  assert.deepEqual(values, savedValues);
  assert.equal(getSessions().length, 1);
  assert.equal(getProgress()[0].attempts, 1);
  assert.equal(getProgress()[0].articleVersion, article.version);
  assert.equal(getSessions()[0].durationSeconds, 4);
  assert.equal(getSessions()[0].correctionCount, 1);
});

test("未开始或尚未完成时不能生成结算结果，空目标不会自动完成", () => {
  assert.throws(() => outcomeFor(createTypingSession()), /completed/);
  assert.throws(() => outcomeFor(start()), /completed/);
  assert.equal(commit(createTypingSession(), "", 1000, "").phase.status, "idle");
});


test("长时间练习达到节奏采样上限后仍正常累计按键", () => {
  let state = start();
  for (let i = 0; i < MAX_PHYSICAL_RHYTHM_SAMPLES + 2; i += 1) {
    state = key(state, "w", "KeyW", i * 10);
  }
  assert.equal(state.physicalRhythmSamples.length, MAX_PHYSICAL_RHYTHM_SAMPLES);
  assert.equal(state.keyCount, MAX_PHYSICAL_RHYTHM_SAMPLES + 2);
  assert.equal(state.leftHandKeys, MAX_PHYSICAL_RHYTHM_SAMPLES + 2);
});


test("输入法Process键通过物理键位累计字母和左右手，选字与修正分别计数", () => {
  let state = start();
  state = key(state, "Process", "KeyW", 100, true);
  state = key(state, "Unidentified", "KeyH", 200, true);
  state = key(state, "2", "Digit2", 300, true);
  state = key(state, "Enter", "Enter", 400, true);
  state = key(state, "Backspace", "Backspace", 500, false);
  state = key(state, "Shift", "ShiftLeft", 600, false);
  assert.equal(state.keyCount, 5);
  assert.equal(state.letterKeys, 2);
  assert.equal(state.leftHandKeys, 1);
  assert.equal(state.rightHandKeys, 1);
  assert.equal(state.selectionCount, 2);
  assert.equal(state.enterCount, 1);
  assert.equal(state.backspaceCount, 1);
});

test("文章结算在无幽灵数据时仍记录正文版本，自定义和常用字不记入文章进度", () => {
  const state = commit(start(), target, 4000);
  const outcome = outcomeFor(state);
  assert.equal(outcome.session.articleVersion, article.version);
  for (const kind of ["custom", "common"]) {
    const result = buildTypingOutcome({ state, article: { ...article, kind }, visibleText: target, targetText: target, id: kind, wubiCodes: new Map(), theoreticalCodeLength: 2, codeLengthAnalysis: null });
    assert.equal(result.session.articleId, undefined);
    assert.equal(result.session.articleVersion, undefined);
  }
});
