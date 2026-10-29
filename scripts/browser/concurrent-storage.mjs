import assert from "node:assert/strict";
import { open, text, typingInput, savedSessions } from "./helpers.mjs";

export async function concurrentPracticeSaves({ page, context }, fallback = false) {
  await context.addInitScript((fallback) => {
    // Both contexts accept the test's deterministic input stream.
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    if (fallback) Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
  }, fallback);
  await open(page, "/");
  const other = await context.newPage();
  await open(other, "/");
  if (!fallback) {
    await page.evaluate(() => {
      void navigator.locks.request("wubi-test:local-data-write:v1", () => new Promise((resolve) => {
        window.__releasePracticeLock = resolve;
      }));
    });
    await page.waitForFunction(() => Boolean(window.__releasePracticeLock));
  }
  try {
    await Promise.all([typingInput(page).fill(text), typingInput(other).fill(text)]);
    if (!fallback) {
      await page.getByText("正在保存本次成绩…", { exact: true }).waitFor();
      await other.getByText("正在保存本次成绩…", { exact: true }).waitFor();
      assert.equal((await savedSessions(page)).length, 0, "取得写锁之前不能提前保存或显示成功");
      await page.evaluate(() => window.__releasePracticeLock());
    }
    await page.getByText("本次成绩已存入本机 · 可在成绩统计查看", { exact: true }).waitFor();
    await other.getByText("本次成绩已存入本机 · 可在成绩统计查看", { exact: true }).waitFor();
    const rows = await savedSessions(page);
    assert.equal(rows.length, 2);
    assert.equal(new Set(rows.map((row) => row.id)).size, 2);
    assert(rows.every((row) => row.correctChars === Array.from(text).length));
    await page.reload({ waitUntil: "networkidle" });
    assert.equal((await savedSessions(page)).length, 2, "刷新后的读取修复不能覆盖另一个标签页的成绩");
  } finally {
    if (!fallback) await page.evaluate(() => window.__releasePracticeLock?.()).catch(() => {});
    await other.close();
  }
}

export async function corruptHistoryRecovery({ page, context }) {
  await context.addInitScript(() => {
    const valid = { id: "kept-valid", type: "article", title: "正常成绩", date: "2026-10-25T00:00:00Z", durationSeconds: 60, correctChars: 10, attemptedChars: 10, speed: 10, kps: 0, codeLength: 0, accuracy: 100, errors: 0 };
    const rhythmSummary = { version: 1, characterCount: 10, startupMs: null, medianIntervalMs: null, p90IntervalMs: null, fastestTenCpm: null, variationPercent: null, recoveryMs: null, firstHalfMedianMs: null, secondHalfMedianMs: null, sameHandMedianMs: null, crossHandMedianMs: null, curve: [null], weakSegments: [] };
    localStorage.setItem("wubi-test:sessions:v1", JSON.stringify([valid, { ...valid, id: "damaged", rhythmSummary }]));
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page, "/");
  await typingInput(page).waitFor();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("wubi-test:sessions:v1") ?? "[]").length === 1);
  assert.equal((await savedSessions(page))[0].id, "kept-valid");
  assert.deepEqual(errors, []);
}
