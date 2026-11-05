import assert from "node:assert/strict";
import { open, localSnapshot, storageFault, restoreStorage } from "./helpers.mjs";

async function holdWriteLock(page, fallback) {
  await page.evaluate((fallback) => new Promise((ready, reject) => {
    const name = "wubi-test:local-data-write:v1";
    if (!fallback) {
      void navigator.locks.request(name, () => new Promise((release) => {
        window.__releasePreferenceLock = release;
        ready();
      })).catch(reject);
      return;
    }
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("mutex");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("mutex", "readwrite");
      let held = true;
      window.__releasePreferenceLock = () => { held = false; };
      transaction.oncomplete = () => db.close();
      transaction.onabort = () => { db.close(); reject(transaction.error); };
      const keepAlive = () => {
        transaction.objectStore("mutex").get("lock").onsuccess = () => {
          ready();
          if (held) keepAlive();
        };
      };
      keepAlive();
    };
  }), fallback);
}

export async function concurrentPreferences({ page, context }, fallback = false) {
  if (fallback) await context.addInitScript(() => {
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
  });
  await open(page, "/settings");
  const other = await context.newPage();
  try {
    await open(other, "/settings");
    await holdWriteLock(page, fallback);
    const before = await localSnapshot(page);
    const hint = page.getByRole("checkbox", { name: "显示编码提示" });
    await Promise.all([hint.click(), other.locator(".theme-switch").click()]);
    for (const tab of [page, other]) {
      await tab.getByText("正在保存设置…", { exact: true }).waitFor();
      assert(await tab.locator(".theme-switch").isDisabled());
    }
    assert.equal(await hint.isChecked(), false, "未取得锁时不能显示已保存的设置");
    assert.deepEqual(await localSnapshot(page), before);
    await page.evaluate(() => window.__releasePreferenceLock());
    for (const tab of [page, other]) {
      await tab.bringToFront();
      await tab.waitForFunction(() => {
        const value = JSON.parse(localStorage.getItem("wubi-test:settings:v1"));
        return value.showCodeHints === true && value.theme === "dark";
      }, undefined, { polling: 100 });
      await tab.reload({ waitUntil: "networkidle" });
      assert(await tab.getByRole("checkbox", { name: "显示编码提示" }).isChecked());
      assert.equal(await tab.locator("html").getAttribute("data-theme"), "dark");
    }

    for (const tab of [page, other]) {
      await open(tab, "/");
      await tab.getByRole("button", { name: "选文章", exact: true }).click();
    }
    const first = page.getByRole("button", { name: /^收藏文章：/ }).nth(0);
    const second = other.getByRole("button", { name: /^收藏文章：/ }).nth(1);
    const titles = await Promise.all([first.getAttribute("aria-label"), second.getAttribute("aria-label")]);
    assert.notEqual(titles[0], titles[1]);
    await holdWriteLock(page, fallback);
    await Promise.all([first.click(), second.click()]);
    for (const tab of [page, other]) await tab.getByText("正在保存收藏…", { exact: true }).waitFor();
    assert(await first.isDisabled());
    assert(await second.isDisabled());
    assert.equal(await first.getAttribute("aria-pressed"), "false");
    assert.equal(await page.evaluate(() => localStorage.getItem("wubi-test:favorite-articles:v1")), null);
    await page.evaluate(() => window.__releasePreferenceLock());
    for (const tab of [page, other]) {
      await tab.bringToFront();
      await tab.waitForFunction(() => JSON.parse(localStorage.getItem("wubi-test:favorite-articles:v1") ?? "[]").length === 2,
        undefined, { polling: 100 });
      await tab.reload({ waitUntil: "networkidle" });
      await tab.getByRole("button", { name: "选文章", exact: true }).click();
      for (const title of titles) {
        assert.equal(await tab.getByRole("button", { name: `取消${title}`, exact: true }).getAttribute("aria-pressed"), "true");
      }
    }
  } finally {
    await page.evaluate(() => window.__releasePreferenceLock?.()).catch(() => {});
    await other.close();
  }
}

export async function trainingSelectionRollback({ page }) {
  await open(page, "/training");
  const start = page.locator("#training-task-article").getByRole("link");
  await start.waitFor();
  for (const failure of ["read", "generated", "plan"]) {
    await page.reload({ waitUntil: "networkidle" });
    await start.waitFor();
    // A failed transaction must preserve missing keys, not create JSON nulls.
    await page.evaluate(() => {
      localStorage.removeItem("wubi-test:current-article:v1");
      localStorage.removeItem("wubi-test:current-generated-practice:v1");
    });
    const before = await localSnapshot(page);
    await storageFault(page, failure === "read"
      ? { readKey: "wubi-test:current-generated-practice:v1" }
      : { writeKey: failure === "plan" ? "wubi-test:training-plan:v1" : "wubi-test:current-generated-practice:v1" });
    await start.click();
    await page.getByText("任务状态未能保存，本次练习不会计入今日处方。", { exact: true }).waitFor();
    await restoreStorage(page);
    assert.deepEqual(await localSnapshot(page), before);
    assert(new URL(page.url()).pathname.endsWith("/training"));
  }
  await start.click();
  await page.waitForURL((url) => !url.pathname.includes("training"));
  const stored = await page.evaluate(() => ({
    selected: JSON.parse(localStorage.getItem("wubi-test:current-article:v1")),
    plan: JSON.parse(localStorage.getItem("wubi-test:training-plan:v1")),
  }));
  const task = stored.plan.tasks.find((item) => item.type === "article");
  assert.equal(task.status, "in-progress");
  assert.equal(stored.selected, task.articleId);
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("wubi-test:current-article:v1"))), task.articleId);
}
