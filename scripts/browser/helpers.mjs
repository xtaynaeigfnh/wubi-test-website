import assert from "node:assert/strict";

export const basePath = (process.env.BROWSER_BASE_PATH ?? "").replace(/\/$/, "");
export const origin = (process.env.BROWSER_BASE_URL ?? "http://127.0.0.1:4176").replace(/\/$/, "");
export const base = `${origin}${basePath}`;
export const output = process.env.BROWSER_OUTPUT ?? `output/playwright/regression${process.argv.includes("--pages") ? "-pages" : ""}`;
export const text = "五笔输入练习需要稳定节奏。";
export const fixture = {
  id: "custom-browser-regression", title: "浏览器回归练习", text,
  length: "short", topic: "自定义", wordCount: Array.from(text).length,
  kind: "custom", version: 1,
};

export async function open(page, route) {
  // Cold routes on slow engines may never settle networkidle within the 30s
  // goto budget; reopen once before treating it as a real failure.
  try {
    await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  } catch {
    await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  }
  await page.locator("main").waitFor();
}


export const typingInput = (page) => page.getByRole("textbox", { name: "跟打输入区" });
export const articleRegion = (page) => page.getByRole("region", { name: "练习文章，可使用方向键滚动" });

export async function localSnapshot(page) {
  return page.evaluate(() => Object.fromEntries(Object.keys(localStorage)
    .filter((key) => key.startsWith("wubi-test:"))
    .sort().map((key) => [key, localStorage.getItem(key)])));
}

// Faults affect only platform storage APIs in an isolated test context, never
// React state, Hook order or application functions. Returning the raw snapshot
// lets rollback assertions compare even missing keys and non-normalized JSON.
export async function storageFault(page, { readKey, writeKey, quota = false } = {}) {
  await page.evaluate(({ readKey, writeKey, quota }) => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    const originals = Object.fromEntries(Object.keys(localStorage).map((key) => [key, get.call(localStorage, key)]));
    const quotaBytes = Object.values(localStorage).reduce((sum, value) => sum + value.length, 0);
    window.__restoreStorage = () => {
      Storage.prototype.getItem = get;
      Storage.prototype.setItem = set;
    };
    Storage.prototype.getItem = function(key) {
      if (this === localStorage && key === readKey) throw new DOMException("read denied", "SecurityError");
      return get.call(this, key);
    };
    Storage.prototype.setItem = function(key, value) {
      const size = this === localStorage && quota
        ? Object.keys(this).reduce((sum, name) => sum + (name === key ? 0 : get.call(this, name).length), String(value).length)
        : 0;
      if (this === localStorage && ((key === writeKey && String(value) !== originals[key]) || (quota && size > quotaBytes))) {
        throw new DOMException("write denied", "QuotaExceededError");
      }
      return set.call(this, key, value);
    };
  }, { readKey, writeKey, quota });
}

export async function restoreStorage(page) {
  await page.evaluate(() => window.__restoreStorage());
}

export async function alertFrom(page, action, message) {
  const dialogPromise = page.waitForEvent("dialog");
  const accept = (dialog) => void dialog.accept();
  page.once("dialog", accept);
  try {
    const [dialog] = await Promise.all([dialogPromise, action()]);
    assert.equal(dialog.type(), "alert");
    assert.match(dialog.message(), message);
  } finally {
    page.off("dialog", accept);
  }
}

export async function savedSessions(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("wubi-test:sessions:v1") ?? "[]"));
}

export async function uploadBackup(page, payload, name = "backup.json") {
  await page.getByLabel("选择 JSON 备份文件").setInputFiles({
    name, mimeType: "application/json",
    buffer: Buffer.from(typeof payload === "string" ? payload : JSON.stringify(payload)),
  });
}

export async function createCustomArticle(page, title, body) {
  await page.getByRole("button", { name: /^(粘贴自己的文字|自定义文章)$/ }).click();
  const dialog = page.getByRole("dialog", { name: "粘贴自定义文本" });
  await dialog.getByRole("textbox", { name: "标题", exact: true }).fill(title);
  await dialog.getByRole("textbox", { name: "正文", exact: true }).fill(body);
  await dialog.getByRole("button", { name: "开始练习", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await articleRegion(page).textContent(), body);
}

export async function chooseArticle(page, title) {
  await page.getByRole("button", { name: "选文章", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "选择练习文章" });
  await dialog.getByRole("searchbox", { name: "搜索文章标题" }).fill(title);
  return dialog.getByRole("button").filter({ has: page.getByText(title, { exact: true }) });
}
