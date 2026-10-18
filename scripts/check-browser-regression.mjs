import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium, firefox, webkit } from "playwright";

const pagesMode = process.argv.includes("--pages");
const basePath = (process.env.BROWSER_BASE_PATH ?? "").replace(/\/$/, "");
const origin = (process.env.BROWSER_BASE_URL ?? "http://127.0.0.1:4176").replace(/\/$/, "");
const base = `${origin}${basePath}`;
const output = process.env.BROWSER_OUTPUT ?? `output/playwright/regression${pagesMode ? "-pages" : ""}`;
const engines = { chromium, firefox, webkit };
const results = [];
const text = "五笔输入练习需要稳定节奏。";
const fixture = {
  id: "custom-browser-regression", title: "浏览器回归练习", text,
  length: "short", topic: "自定义", wordCount: Array.from(text).length,
  kind: "custom", version: 1,
};
let server;
let workerRevision = 0;

async function startServer() {
  if (process.env.BROWSER_BASE_URL) return;
  if (!pagesMode) {
    server = spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", "4176"], { stdio: "ignore", detached: true });
  } else {
    const root = resolve(process.env.BROWSER_PAGES_DIR ?? "out");
    const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".mp3": "audio/mpeg", ".woff2": "font/woff2" };
    server = createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, origin).pathname);
        if (basePath && pathname !== basePath && !pathname.startsWith(`${basePath}/`)) throw new Error("outside base path");
        const relative = pathname.slice(basePath.length);
        let file = resolve(root, `.${relative || "/"}`);
        if (file !== root && !file.startsWith(`${root}/`)) throw new Error("outside export");
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
    if (!pagesMode && server.exitCode !== null) throw new Error(`回归开发服务器已退出：${server.exitCode}`);
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

async function open(page, route) {
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  await page.locator("main").waitFor();
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
  await prepare(context);
  const page = await context.newPage();
  const row = { engine, name, passed: false };
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
  await hint.check();
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

async function typingRecovery({ page, context }) {
  await open(page, "/");
  const input = page.getByRole("textbox", { name: "跟打输入区" });
  await input.waitFor();
  assert.equal(await page.getByRole("region", { name: "练习文章，可使用方向键滚动" }).textContent(), text);
  const history = await context.newPage();
  await open(history, "/history");
  await input.fill(text.slice(0, -1));
  const unfinishedDialog = page.waitForEvent("dialog");
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("link", { name: "成绩统计", exact: true }).click();
  assert.equal((await unfinishedDialog).type(), "alert");
  assert.equal(new URL(page.url()).pathname, `${basePath}/`);
  assert.equal(await input.inputValue(), text.slice(0, -1), "取消离开应保留输入");
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    window.__regressionWrite = write;
    Storage.prototype.setItem = function(key, value) {
      if (key === "wubi-test:sessions:v1") throw new DOMException("quota", "QuotaExceededError");
      return write.call(this, key, value);
    };
  });
  // Model a Safari-style compositionend which still exposes a long Latin
  // pre-edit buffer, followed by the committed candidate in the next input event.
  await input.evaluate((el, prefix) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    setValue.call(el, `${prefix}qingxi`);
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertCompositionText", data: "qingxi", isComposing: true }));
  }, text.slice(0, -1));
  assert.equal(await input.inputValue(), `${text.slice(0, -1)}qingxi`, "候选预编辑不能被剩余字数截断");
  assert.equal(await page.getByRole("button", { name: "重试保存" }).count(), 0, "composition期间不能提前结算");
  await input.evaluate((el, committed) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "。" }));
    setValue.call(el, committed);
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "。", isComposing: false }));
  }, text);
  await page.getByRole("button", { name: "重试保存" }).waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("wubi-test:sessions:v1") ?? "[]").length), 0);
  const pendingDialog = page.waitForEvent("dialog");
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("link", { name: "成绩统计", exact: true }).click();
  assert.equal((await pendingDialog).type(), "alert");
  assert.equal(new URL(page.url()).pathname, `${basePath}/`, "未保存成绩应阻止导航");
  await page.evaluate(() => { Storage.prototype.setItem = window.__regressionWrite; });
  await page.getByRole("button", { name: "重试保存" }).click();
  await page.getByText("本次成绩已存入本机 · 可在成绩统计查看").waitFor();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("wubi-test:sessions:v1") ?? "[]").length === 1);
  await history.getByText(fixture.title, { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("wubi-test:sessions:v1"))[0].correctChars), Array.from(text).length);
  await page.getByRole("link", { name: "成绩统计", exact: true }).click();
  await page.waitForURL(`${base}/history${pagesMode ? "/" : ""}`);
}

async function backupRoundtrip({ page }) {
  await open(page, "/settings");
  await page.getByRole("checkbox", { name: "显示编码提示" }).check();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出完整备份", exact: true }).click();
  const download = await downloaded;
  const file = `${output}/backup.json`;
  await download.saveAs(file);
  const payload = JSON.parse(await readFile(file, "utf8"));
  assert.equal(payload.data["wubi-test:settings:v1"].showCodeHints, true);
  await page.getByRole("checkbox", { name: "显示编码提示" }).uncheck();
  await page.getByLabel("选择 JSON 备份文件").setInputFiles(file);
  await page.getByText("恢复前预览", { exact: true }).waitFor();
  await page.getByRole("button", { name: "确认覆盖本机数据" }).click();
  await page.waitForEvent("load");
  await page.getByRole("checkbox", { name: "显示编码提示" }).waitFor();
  assert(await page.getByRole("checkbox", { name: "显示编码提示" }).isChecked(), "备份恢复后应重新显示导出时的设置");
}

async function articleLibrary({ page }) {
  await open(page, "/");
  await page.getByRole("button", { name: "选文章", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "选择练习文章" });
  await dialog.getByRole("searchbox", { name: "搜索文章标题" }).fill(fixture.title);
  await dialog.getByText("共 1 篇符合当前筛选条件", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: `收藏文章：${fixture.title}`, exact: true }).click();
  await dialog.getByRole("button", { name: "只看收藏", exact: true }).click();
  assert.equal(await dialog.getByRole("button", { name: "只看收藏", exact: true }).getAttribute("aria-pressed"), "true");
  await dialog.getByRole("button", { name: `取消收藏文章：${fixture.title}`, exact: true }).waitFor();
  await dialog.getByRole("combobox", { name: "文章排序" }).selectOption("recent");
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "选文章", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "选择练习文章" });
  await dialog.getByRole("searchbox", { name: "搜索文章标题" }).fill(fixture.title);
  await dialog.getByRole("button", { name: `取消收藏文章：${fixture.title}`, exact: true }).waitFor();
  await dialog.getByRole("button", { name: "只看收藏", exact: true }).click();
  await dialog.getByRole("button", { name: `取消收藏文章：${fixture.title}`, exact: true }).click();
  await dialog.getByText("当前收藏中没有符合条件的文章。可以关闭“只看收藏”或调整筛选。", { exact: true }).waitFor();
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
    await input.fill(code);
    await input.press("Enter");
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

async function musicShortcuts({ page }) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, "/settings");
  const ruler = page.getByRole("group", { name: "曲目刻度" });
  const buttons = ruler.getByRole("button");
  await buttons.first().waitFor();
  for (let index = 0; index < await buttons.count(); index++) {
    const button = buttons.nth(index);
    await button.focus();
    const box = await button.boundingBox();
    assert(box && box.width >= 44 && box.height >= 44, "切歌按钮不能被压缩");
    await button.press("Enter");
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-pressed") === "true");
    assert(await button.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const strip = element.parentElement.getBoundingClientRect();
      return box.left >= strip.left - 1 && box.right <= strip.right + 1;
    }), "键盘聚焦时，横向滚动应露出完整按钮");
  }
  await page.screenshot({ path: `${output}/music-shortcuts.png`, fullPage: false });
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

await mkdir(output, { recursive: true });
try {
  await startServer();
  for (const engine of (process.env.BROWSER_ENGINES ?? (pagesMode ? "chromium" : "chromium,webkit")).split(",")) {
    assert(engines[engine], `未知浏览器 ${engine}`);
    if (pagesMode) {
      await scenario(engine, "pages-offline-update", pagesOfflineUpdate, { workers: "allow" });
    } else {
      await scenario(engine, "settings-windows", settingsWindows);
      await scenario(engine, "typing-recovery", typingRecovery);
      await scenario(engine, "backup-roundtrip", backupRoundtrip);
      await scenario(engine, "article-library", articleLibrary);
      await scenario(engine, "training-drill", trainingDrill);
      await scenario(engine, "advanced-practice", advancedPractice);
      await scenario(engine, "music-shortcuts", musicShortcuts);
    }
  }
} finally {
  if (server?.pid) { try { process.kill(-server.pid, "SIGTERM"); } catch {} }
  else if (server) await new Promise((done) => server.close(done));
}
console.log(`完成 ${results.length} 项浏览器回归，失败 ${results.filter((row) => !row.passed).length} 项；报告：${output}/report.json`);
if (results.some((row) => !row.passed)) process.exitCode = 1;
