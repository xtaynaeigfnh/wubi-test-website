import assert from "node:assert/strict";
import { open, text, typingInput, savedSessions, localSnapshot } from "./helpers.mjs";

// Storage propagation is independent of painting. A background WebKit tab may
// stop animation frames, so never use waitForFunction's default RAF polling here.
async function waitForStorageState(page, predicate) {
  try {
    // WebKit may retain a background document's localStorage view after another
    // process releases its Web Lock. Inspect it as a user would: activate the
    // window, then require the exact records (and the existing reload checks).
    await page.bringToFront();
    await page.waitForFunction(predicate, undefined, { polling: 100 });
  } catch (error) {
    const snapshot = await localSnapshot(page).catch(() => null);
    throw new Error(`${error.message}\nLocal storage at timeout: ${JSON.stringify(snapshot)}`, { cause: error });
  }
}

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
    // Cross-window localStorage notifications can arrive after the other tab's
    // save UI updates. Require both views to converge, then verify after reload.
    for (const tab of [page, other]) {
      await waitForStorageState(tab, () => JSON.parse(localStorage.getItem("wubi-test:sessions:v1") ?? "[]").length === 2);
    }
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
  await waitForStorageState(page, () => JSON.parse(localStorage.getItem("wubi-test:sessions:v1") ?? "[]").length === 1);
  assert.equal((await savedSessions(page))[0].id, "kept-valid");
  assert.deepEqual(errors, []);
}

export async function articleVersionProgress({ page, context }) {
  const article = { id: "short-version-test", title: "正文版本隔离练习", text, length: "short", topic: "日常", wordCount: Array.from(text).length, version: 5 };
  let version = 5;
  await context.route("**/data/articles-*.json", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const rows = path.endsWith("articles-index.json") ? [{ ...article, version }]
      : path.endsWith("articles-short.json") ? [{ id: article.id, text }] : [];
    await route.fulfill({ json: rows });
  });
  await context.addInitScript((article) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    if (localStorage.getItem("version-progress-seeded")) return;
    localStorage.setItem("version-progress-seeded", "true");
    localStorage.setItem("wubi-test:current-article:v1", JSON.stringify(article.id));
    const row = { articleId: article.id, attempts: 10, bestSpeed: 999, completed: true, lastPracticed: "2026-10-01T00:00:00Z", errors: 99 };
    localStorage.setItem("wubi-test:article-progress:v1", JSON.stringify([row, { ...row, articleVersion: 4 }]));
  }, article);
  await open(page, "/");
  await typingInput(page).waitFor();
  version = 6;
  const other = await context.newPage();
  try {
    await open(other, "/");
    await typingInput(other).waitFor();
    await Promise.all([typingInput(page).fill(text), typingInput(other).fill(text)]);
    for (const tab of [page, other]) {
      await tab.getByText("本次成绩已存入本机 · 可在成绩统计查看", { exact: true }).waitFor();
    }
    await waitForStorageState(page, () => JSON.parse(localStorage.getItem("wubi-test:article-progress:v1") ?? "[]").length === 4);
    let rows = await page.evaluate(() => JSON.parse(localStorage.getItem("wubi-test:article-progress:v1")));
    assert.deepEqual(rows.map((row) => [row.articleVersion ?? null, row.attempts]).sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0)), [[null, 10], [4, 10], [5, 1], [6, 1]]);
    assert.deepEqual((await savedSessions(page)).map((row) => row.articleVersion).sort(), [5, 6]);
    // Both windows now practice version 6: the shared write lock must retain both attempts.
    await Promise.all([page.reload({ waitUntil: "networkidle" }), other.reload({ waitUntil: "networkidle" })]);
    await Promise.all([typingInput(page).fill(text), typingInput(other).fill(text)]);
    for (const tab of [page, other]) {
      await tab.getByText("本次成绩已存入本机 · 可在成绩统计查看", { exact: true }).waitFor();
    }
    await waitForStorageState(page, () => JSON.parse(localStorage.getItem("wubi-test:article-progress:v1") ?? "[]").find((row) => row.articleVersion === 6)?.attempts === 3);
    rows = await page.evaluate(() => JSON.parse(localStorage.getItem("wubi-test:article-progress:v1")));
    assert.equal(rows.find((row) => row.articleVersion === 6).attempts, 3);
    assert.equal(rows.find((row) => row.articleVersion === 5).attempts, 1);
    await open(page, "/history/");
    await page.getByText("正文版本 5", { exact: true }).waitFor();
    const completion = page.getByRole("progressbar", { name: "当前版本文章完成度" });
    await page.waitForFunction(() => document.querySelector('[aria-label="当前版本文章完成度"]')?.getAttribute("aria-valuenow") === "1");
    assert.equal(await completion.getAttribute("aria-valuemax"), "1");
  } finally { await other.close(); }
}
