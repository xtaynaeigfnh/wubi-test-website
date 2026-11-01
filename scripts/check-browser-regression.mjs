import assert from "node:assert/strict";
import { assertServerRunning, resolveExportPath, startDevServer, stopDevServer } from "./browser-test-server.mjs";
import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium, firefox, webkit } from "playwright";

import { basePath, base, origin, output, fixture, text, open } from "./browser/helpers.mjs";
import { typingRecovery, typingSessionLifecycle, typingIme, typingUnicodeAndCorrection, typingPasteAndDrop } from "./browser/typing.mjs";
import { backupRoundtrip, backupUnreadable, backupRollback, backupInvalidAndStaleFile } from "./browser/backup.mjs";
import { articleLibrary, articleProgressRefresh, articleSelectionFailure, articleRestartFailure, commonArticleRestore, customArticleRollback } from "./browser/articles.mjs";

import { trainingPlanAndReviews } from "./browser/training.mjs";
import { navigationLens } from "./browser/navigation.mjs";
import { concurrentPracticeSaves, corruptHistoryRecovery, articleVersionProgress, weeklyReportRefresh } from "./browser/concurrent-storage.mjs";
import { localMusic } from "./browser/local-music.mjs";
import { concurrentPreferences, trainingSelectionRollback } from "./browser/preferences.mjs";

const pagesMode = process.argv.includes("--pages");
const engines = { chromium, firefox, webkit };
const results = [];
let server;
let workerRevision = 0;

async function startServer() {
  if (process.env.BROWSER_BASE_URL) return;
  if (!pagesMode) {
    server = startDevServer(4176);
  } else {
    const root = resolve(process.env.BROWSER_PAGES_DIR ?? "out");
    const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".mp3": "audio/mpeg", ".woff2": "font/woff2" };
    server = createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, origin).pathname);
        if (basePath && pathname !== basePath && !pathname.startsWith(`${basePath}/`)) throw new Error("outside base path");
        const relative = pathname.slice(basePath.length);
        let file = resolveExportPath(root, relative);
        if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
        let data = await readFile(file);
        if (relative === "/sw.js" && workerRevision) {
          data = Buffer.from(data.toString().replace(/const CACHE_NAME = "([^"]+)";/, `const CACHE_NAME = "$1-regression-${workerRevision}";`));
        }
        response.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
        response.end(data);
      } catch { response.writeHead(404); response.end("Not found"); }
    });
    await new Promise((done) => server.listen(4176, "127.0.0.1", done));
  }
  for (let i = 0; i < 120; i++) {
    if (!pagesMode) assertServerRunning(server);
    try { if ((await fetch(`${base}/`)).ok) return; } catch {}
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error("浏览器回归服务器未启动");
}

async function prepare(context) {
  // Seed once per origin; subsequent reloads must preserve tested writes/restores.
  await context.addInitScript((article) => {
    if (localStorage.getItem("browser-regression-seeded")) return;
    localStorage.setItem("browser-regression-seeded", "true");
    localStorage.setItem("wubi-test:onboarding:v1", JSON.stringify({ version: 1, status: "skipped", sessionIds: [] }));
    localStorage.setItem("wubi-test:settings:v1", JSON.stringify({ theme: "light", skin: "letterpress", showCodeHints: false }));
    localStorage.setItem("wubi-test:custom-texts:v1", JSON.stringify([article]));
    localStorage.setItem("wubi-test:current-article:v1", JSON.stringify(article.id));
  }, fixture);
}

async function waitForBrowserState(page, predicate, message) {
  // waitForFunction treats an async predicate's Promise as truthy in the
  // installed Playwright runtime. evaluate awaits its result before each poll.
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await page.evaluate(predicate)) return;
    await page.waitForTimeout(100);
  }
  assert.fail(message);
}

async function scenario(engine, name, run, { workers = "block" } = {}) {
  const browser = await engines[engine].launch();
  const context = await browser.newContext({ serviceWorkers: workers });
  context.setDefaultTimeout(15000);
  context.setDefaultNavigationTimeout(30000);
  await prepare(context);
  const page = await context.newPage();
  const row = { engine, name, passed: false };
  console.log(`RUN ${engine} ${name}`);
  await context.tracing.start({ screenshots: true, snapshots: true });
  try {
    await run({ page, context });
    row.passed = true;
    await context.tracing.stop();
  } catch (error) {
    row.error = error.stack ?? error.message;
    row.workerLifecycle = await page.evaluate(() => window.__regressionWorkerEvents ?? null).catch(() => null);
    await page.screenshot({ path: `${output}/${engine}-${name}.png`, fullPage: true }).catch(() => {});
    await context.tracing.stop({ path: `${output}/${engine}-${name}.zip` });
  } finally {
    results.push(row);
    console.log(`${row.passed ? "PASS" : "FAIL"} ${engine} ${name}${row.error ? `: ${row.error}` : ""}`);
    await context.close();
    await browser.close();
    await writeFile(`${output}/report.json`, JSON.stringify({ base, pagesMode, generatedAt: new Date().toISOString(), results }, null, 2));
  }
}

async function settingsWindows({ page, context }) {
  await open(page, "/settings");
  const other = await context.newPage();
  await open(other, "/");
  const hint = page.getByRole("checkbox", { name: "显示编码提示" });
  await hint.click();
  await other.waitForFunction(() => JSON.parse(localStorage.getItem("wubi-test:settings:v1")).showCodeHints === true);
  await other.locator(".theme-switch").click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  assert(await hint.isChecked(), "主题切换应保留其他窗口的编码提示");
  assert.equal(await other.evaluate(() => JSON.parse(localStorage.getItem("wubi-test:settings:v1")).showCodeHints), true);
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    window.__regressionWrite = write;
    Storage.prototype.setItem = function(key, value) {
      if (key === "wubi-test:settings:v1") throw new DOMException("quota", "QuotaExceededError");
      return write.call(this, key, value);
    };
  });
  await hint.click();
  await page.getByRole("alert").filter({ hasText: "设置未能保存" }).waitFor();
  assert(await hint.isChecked(), "保存失败应保留原设置界面");
  await page.evaluate(() => { Storage.prototype.setItem = window.__regressionWrite; });
  await hint.click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("wubi-test:settings:v1")).showCodeHints === false);
  assert.equal(await hint.isChecked(), false, "重试成功后才更新设置界面");
  await other.evaluate(() => localStorage.removeItem("wubi-test:settings:v1"));
  await page.waitForFunction(() => document.documentElement.dataset.theme === "system");
  assert.equal(await hint.isChecked(), false, "其他窗口删除设置应恢复默认状态");
  await other.evaluate(() => localStorage.setItem("wubi-test:settings:v1", JSON.stringify({ theme: "light", showCodeHints: true })));
  await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
  // Block storage events to verify focus recovery independently.
  await page.evaluate(() => window.addEventListener("storage", (event) => event.stopImmediatePropagation(), true));
  await other.evaluate(() => localStorage.setItem("wubi-test:settings:v1", JSON.stringify({ theme: "dark", showCodeHints: true })));
  await page.locator(".theme-switch").click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "system");
  await other.evaluate(() => localStorage.setItem("wubi-test:settings:v1", JSON.stringify({ theme: "dark", showCodeHints: true })));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
}

async function trainingDrill({ page }) {
  await open(page, "/training?tab=roots");
  await page.getByRole("button", { name: "开始专项", exact: true }).click();
  const input = page.locator(".code-drill input");
  const response = await page.request.get(`${base}/data/wubi86-challenge.json`);
  const data = await response.json();
  const entries = new Map(data.map(([character, code]) => [character, code]));
  const firstCharacter = (await page.locator(".drill-question").textContent()).trim();
  await input.fill(entries.get(firstCharacter) === "a" ? "b" : "a");
  await input.press("Enter");
  await page.getByRole("button", { name: "记住了，下一题（回车）", exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.matches(".code-drill input"));
  assert.equal(await input.inputValue(), "", "换题后清空并聚焦输入框");
  for (let index = 1; index < 20; index++) {
    const character = await page.locator(".drill-question").textContent();
    const code = entries.get(character.trim());
    assert(code, `应能查到题目编码：${character}`);
    if (index === 19) {
      await page.evaluate(() => {
        void navigator.locks.request("wubi-test:local-data-write:v1", () => new Promise((resolve) => { window.__releaseDrillLock = resolve; }));
      });
      await page.waitForFunction(() => Boolean(window.__releaseDrillLock));
    }
    await input.fill(code);
    await input.press("Enter");
    if (index === 19) {
      const saving = page.getByRole("button", { name: "正在保存…", exact: true });
      await saving.waitFor();
      assert(await saving.isDisabled(), "等待存储时不能开始下一轮");
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("wubi-test:sessions:v1") ?? "[]").length), 0);
      await page.evaluate(() => window.__releaseDrillLock());
    }
    if (index < 19) {
      await page.locator(".drill-progress").getByText(`第 ${index + 2} / 20 题`, { exact: true }).waitFor();
    }
  }
  await page.getByRole("button", { name: "再练一轮", exact: true }).waitFor();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("wubi-test:sessions:v1") ?? "[]").length === 1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("wubi-test:sessions:v1"))[0]);
  assert.equal(saved.type, "roots");
  assert.equal(saved.correctChars, 19);
}

async function advancedPractice({ page }) {
  await open(page, "/advanced");
  await page.getByRole("button", { name: "开始节奏练习", exact: true }).click();
  const input = page.getByRole("textbox", { name: "进阶训练输入区" });
  const target = await page.getByLabel("练习正文").textContent();
  await input.fill(target.slice(0, 3));
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await input.fill(target);
  assert.equal(await input.inputValue(), target.slice(0, 3), "进阶后台输入应被还原");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("wubi-test:sessions:v1") ?? "[]").length), 0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  assert(await input.isDisabled());
  await page.getByRole("button", { name: "继续", exact: true }).click();
  assert.equal(await input.inputValue(), target.slice(0, 3));
  await page.evaluate(() => {
    window.__regressionWrite = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === "wubi-test:sessions:v1") throw new DOMException("quota", "QuotaExceededError");
      return window.__regressionWrite.call(this, key, value);
    };
  });
  await input.fill(target);
  await page.getByRole("button", { name: "重试保存", exact: true }).waitFor();
  assert(await input.isDisabled());
  await page.evaluate(() => { Storage.prototype.setItem = window.__regressionWrite; });
  await page.getByRole("button", { name: "重试保存", exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("wubi-test:sessions:v1") ?? "[]").length === 1);
  await page.getByRole("heading", { name: "上屏间隔与恢复", exact: true }).waitFor();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("wubi-test:sessions:v1"))[0]);
  assert.equal(saved.correctChars, Array.from(target).length);
  assert.equal(saved.type, "rhythm");
}

async function typingBackgroundReset({ page, context }) {
  await context.addInitScript(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  });
  await open(page, "/");
  const input = page.getByRole("textbox", { name: "跟打输入区" });
  await input.fill("五");
  assert.equal(await input.inputValue(), "", "后台初始化不能启动练习");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await input.fill("五");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.getByRole("button", { name: "重来", exact: true }).click();
  await input.fill("五");
  assert.equal(await input.inputValue(), "", "后台重置不能启动练习");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await input.fill("五");
  assert.equal(await input.inputValue(), "五");
}

async function musicVolumeUnavailable({ page, context }) {
  await context.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "volume", {
      configurable: true,
      get: () => 1,
      set: () => { throw new DOMException("System volume only", "NotSupportedError"); },
    });
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page, "/settings");
  await page.waitForFunction(() => document.querySelector("audio")?.readyState >= 1);
  const dock = page.getByRole("complementary", { name: "背景音乐播放器" });
  await dock.getByRole("button", { name: "静音背景音乐", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("audio")?.muted);
  await dock.getByRole("button", { name: "播放背景音乐", exact: true }).click();
  await dock.getByRole("button", { name: "暂停背景音乐", exact: true }).waitFor();
  await dock.getByRole("button", { name: "下一首", exact: true }).click();
  await page.waitForFunction(() => {
    const audio = document.querySelector("audio");
    return audio?.readyState >= 1 && !audio.paused && audio.muted;
  });
  assert(await dock.getByRole("slider", { name: "背景音乐音量" }).isDisabled());
  assert.deepEqual(errors, [], "系统音量限制不应中断元数据加载与切歌续播");
}

async function musicShortcuts({ page }) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, "/settings");
  const dock = page.getByRole("complementary", { name: "背景音乐播放器" });
  if (!await dock.isVisible()) await page.getByRole("button", { name: "展开专注电台控制栏" }).click();
  await dock.getByRole("button", { name: "展开曲目列表" }).click();
  const buttons = dock.locator(".music-track-row");
  await buttons.first().waitFor();
  for (let index = 0; index < await buttons.count(); index++) {
    const button = buttons.nth(index);
    await button.focus();
    const box = await button.boundingBox();
    assert(box && box.width >= 44 && box.height >= 44, "切歌按钮不能被压缩");
    await button.press("Enter");
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-pressed") === "true");
  }
  await page.keyboard.press("Escape");
  assert.equal(await buttons.first().isVisible(), false);
  assert.equal(await page.locator(":focus").getAttribute("aria-label"), "展开曲目列表");
  await dock.getByRole("button", { name: "静音背景音乐", exact: true }).click();
  await dock.getByRole("button", { name: "播放背景音乐", exact: true }).click();
  await dock.getByRole("button", { name: "暂停背景音乐", exact: true }).waitFor();
  assert.equal(await dock.evaluate((element) => element.getAnimations({ subtree: true })
    .some((animation) => animation.effect?.getComputedTiming().iterations === Infinity)), false);
  await dock.getByRole("button", { name: "暂停背景音乐", exact: true }).click();
  await page.setViewportSize({ width: 320, height: 740 });
  assert(await dock.getByRole("slider", { name: "播放进度", exact: true }).isVisible());
  assert(await dock.getByRole("slider", { name: "背景音乐音量" }).isVisible());
  const box = await dock.boundingBox();
  assert(box && box.x >= 0 && box.x + box.width <= 320, "手机浮层不能超出视口");
  await dock.getByRole("button", { name: "播放背景音乐", exact: true }).focus();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "展开专注电台控制栏");
  await page.getByRole("button", { name: "展开专注电台控制栏" }).click();
  assert.equal(await dock.getByRole("button", { name: "展开曲目列表" }).getAttribute("aria-expanded"), "false");
  await page.waitForFunction(() => !document.querySelector(".music-dock[data-morphing]"));
  await page.screenshot({ path: `${output}/music-shortcuts.png`, fullPage: false });

  // Keep the redesigned list: every track fits without horizontal scrolling,
  // including when keyboard navigation scrolls the list vertically.
  for (const skin of ["letterpress", "focus"]) {
    await page.locator(`input[name="skin"][value="${skin}"]`).click();
    await page.waitForFunction((value) => document.documentElement.dataset.skin === value, skin);
    if (!await dock.isVisible()) await page.getByRole("button", { name: "展开专注电台控制栏" }).click();
    await dock.getByRole("button", { name: "展开曲目列表" }).click();
    for (const width of [320, 375, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const button of await buttons.all()) {
        await button.focus();
        await button.press("Enter");
        await page.waitForFunction(() => document.activeElement?.getAttribute("aria-pressed") === "true");
        assert(await button.evaluate((element) => {
          const row = element.getBoundingClientRect();
          const list = element.closest(".music-library");
          const bounds = list.getBoundingClientRect();
          return row.width >= 44 && row.height >= 44 &&
            row.left >= bounds.left - 1 && row.right <= bounds.right + 1 &&
            list.scrollWidth <= list.clientWidth;
        }), `${skin} ${width}px：曲目应完整容纳在列表内且保留点击区域`);
      }
      assert(await dock.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth && element.scrollWidth <= element.clientWidth;
      }), `${skin} ${width}px：播放器不能横向溢出`);
      await page.screenshot({ path: `${output}/music-list-${skin}-${width}.png`, fullPage: false });
    }
    await page.keyboard.press("Escape");
  }
}

async function pagesOfflineUpdate({ page, context }) {
  assert(basePath, "生产离线回归必须在非空 Pages 子路径运行");
  assert(!process.env.BROWSER_BASE_URL, "更新回归需要内置静态服务器提供第二版本 worker");
  await open(page, "/settings/");
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30000 });
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  assert.equal(new URL(scope).pathname, `${basePath}/`);
  const cachePaths = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names.find((name) => name.startsWith("wubi-test-")));
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  assert(cachePaths.some((path) => path.startsWith(`${basePath}/_next/`) && path.endsWith(".js")), "必须真实缓存生产脚本");
  assert(cachePaths.every((path) => path.startsWith(`${basePath}/`)), "缓存不能逃出部署子路径");
  await context.setOffline(true);
  await open(page, "/");
  const input = page.getByRole("textbox", { name: "跟打输入区" });
  await input.waitFor();
  await input.fill(text.slice(0, 3));
  assert.equal(await input.inputValue(), text.slice(0, 3), "断网冷导航后可以开始练习");
  await context.setOffline(false);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    window.__regressionWorkerEvents = [];
    const capture = (event) => window.__regressionWorkerEvents.push({
      event,
      at: performance.now(),
      controller: navigator.serviceWorker.controller?.state,
      active: registration.active?.state,
      installing: registration.installing?.state,
      waiting: registration.waiting?.state,
    });
    capture("before-update");
    navigator.serviceWorker.addEventListener("controllerchange", () => capture("controllerchange"));
    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      capture("updatefound");
      installing?.addEventListener("statechange", () => capture(`worker-${installing.state}`));
    });
  });
  workerRevision += 1;
  await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); });
  await waitForBrowserState(page, async () => (await navigator.serviceWorker.getRegistration()).waiting?.state === "installed", "新版本应安装完成并等待现有练习窗口关闭");
  assert.equal(await input.inputValue(), text.slice(0, 3), "新版本待激活时不能刷新练习");
  assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).waiting?.state ?? null), "installed", "练习窗口打开时更新必须继续等待激活");
  const settings = await context.newPage();
  await open(settings, "/settings/");
  await settings.getByText("新版本已准备好。请完成练习并保存成绩后，关闭本站所有窗口，再重新打开即可更新。").waitFor();
  assert.equal(await input.inputValue(), text.slice(0, 3));
  // Finish before closing so unload guards do not hang browser cleanup.
  await input.fill(text);
  await page.getByText("本次成绩已存入本机 · 可在成绩统计查看").waitFor();
  await page.close();
  await settings.close();
  const reopened = await context.newPage();
  await open(reopened, "/settings/");
  await waitForBrowserState(reopened, async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const names = (await caches.keys()).filter((name) => name.startsWith("wubi-test-"));
    return navigator.serviceWorker.controller && !registration.waiting && names.length === 1 && names[0].includes("-regression-");
  }, "关闭全部窗口后应激活第二版本并清理旧缓存");
  await reopened.getByText("离线缓存已启用，断网后仍可打开。", { exact: true }).waitFor();
}

const interactionScenarios = [
  ["local-music", localMusic],
  ["navigation-lens", navigationLens],
  ["settings-windows", settingsWindows],
  ["concurrent-preferences", concurrentPreferences],
  ["concurrent-preferences-idb", (context) => concurrentPreferences(context, true)],
  ["training-selection-rollback", trainingSelectionRollback],
  ["typing-recovery", typingRecovery],
  ["typing-session-lifecycle", typingSessionLifecycle],
  ...["commit-before-end", "end-before-commit"].map((order) =>
    [`typing-ime-${order}`, (context) => typingIme(context, order)]),
  ["typing-unicode-correction", typingUnicodeAndCorrection],
  ["typing-paste-drop", typingPasteAndDrop],
  ["backup-roundtrip", backupRoundtrip],
  ...["damaged", "blocked"].map((failure) =>
    [`backup-unreadable-${failure}`, (context) => backupUnreadable(context, failure)]),
  ["backup-rollback", backupRollback],
  ["backup-invalid-stale-file", backupInvalidAndStaleFile],
  ["article-library", articleLibrary],
  ["article-progress-refresh", articleProgressRefresh],
  ["weekly-report-refresh", weeklyReportRefresh],
  ...["generated", "recent", "quota", "read"].map((failure) =>
    [`article-selection-${failure}`, (context) => articleSelectionFailure(context, failure)]),
  ["article-restart-failure", articleRestartFailure],
  ["common-article-restore", commonArticleRestore],
  ["custom-article-rollback", customArticleRollback],
  ["training-drill", trainingDrill],
  ["training-plan-reviews", trainingPlanAndReviews],
  ["advanced-practice", advancedPractice],
  ["music-shortcuts", musicShortcuts],
  ["music-volume-unavailable", musicVolumeUnavailable],
  ["typing-background-reset", typingBackgroundReset],
  ["corrupt-history-recovery", corruptHistoryRecovery],
  ["article-version-progress", articleVersionProgress],
  ["concurrent-practice-saves", concurrentPracticeSaves],
  ["concurrent-practice-idb", (context) => concurrentPracticeSaves(context, true)],
];
const availableScenarios = pagesMode
  ? [["pages-offline-update", pagesOfflineUpdate, { workers: "allow" }], ["local-music", localMusic]]
  : interactionScenarios;
const requestedScenarios = process.env.BROWSER_SCENARIOS?.split(",");
for (const name of requestedScenarios ?? []) {
  assert(availableScenarios.some(([candidate]) => candidate === name), `未知回归场景 ${name}`);
}
const selectedScenarios = availableScenarios.filter(([name]) => !requestedScenarios || requestedScenarios.includes(name));

await mkdir(output, { recursive: true });
try {
  await startServer();
  for (const engine of (process.env.BROWSER_ENGINES ?? (pagesMode ? "chromium" : "chromium,webkit")).split(",")) {
    assert(engines[engine], `未知浏览器 ${engine}`);
    for (const [name, run, options] of selectedScenarios) {
      await scenario(engine, name, run, options);
    }
  }
} finally {
  if (server?.pid) await stopDevServer(server);
  else if (server) await new Promise((done) => server.close(done));
}
console.log(`完成 ${results.length} 项浏览器回归，失败 ${results.filter((row) => !row.passed).length} 项；报告：${output}/report.json`);
if (results.some((row) => !row.passed)) process.exitCode = 1;
