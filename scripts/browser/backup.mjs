import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  open, text, typingInput, savedSessions, localSnapshot,
  storageFault, restoreStorage, uploadBackup,
} from "./helpers.mjs";

const backupRegion = (page) => page.getByRole("region", { name: "备份与恢复", exact: true });
const confirmRestore = (page) => page.getByRole("button", { name: "确认覆盖本机数据", exact: true });

async function exportRecordedPractice(page) {
  await open(page, "/");
  const input = typingInput(page);
  await input.fill("错");
  await input.fill(text);
  await page.getByText("本次成绩已存入本机 · 可在成绩统计查看").waitFor();
  assert.equal((await savedSessions(page)).length, 1);
  await page.getByRole("link", { name: "设置", exact: true }).click();
  await page.getByRole("checkbox", { name: "显示编码提示" }).check();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出完整备份", exact: true }).click();
  const download = await downloaded;
  const payload = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(payload.data["wubi-test:settings:v1"].showCodeHints, true);
  assert.equal(payload.data["wubi-test:sessions:v1"].length, 1);
  assert(payload.data["wubi-test:errors:v1"].length > 0, "真实回改应进入导出的错字记录");
  assert.equal(payload.data["wubi-test:custom-texts:v1"].length, 1);
  return payload;
}

async function restoreAndWait(page) {
  await Promise.all([
    page.waitForEvent("load"),
    confirmRestore(page).click(),
  ]);
  await page.getByRole("checkbox", { name: "显示编码提示" }).waitFor();
}

export async function backupRoundtrip({ page }) {
  const payload = await exportRecordedPractice(page);
  await page.getByRole("checkbox", { name: "显示编码提示" }).uncheck();
  const before = await localSnapshot(page);
  await uploadBackup(page, payload);
  await backupRegion(page).getByText("恢复前预览", { exact: true }).waitFor();
  assert.deepEqual(await localSnapshot(page), before, "上传与预览不能提前修改本机数据");
  assert.match(await backupRegion(page).textContent(), /1 条练习.*1 篇自定义文章/s);
  await restoreAndWait(page);
  assert(await page.getByRole("checkbox", { name: "显示编码提示" }).isChecked());
  const restored = await localSnapshot(page);
  for (const key of ["sessions", "errors", "custom-texts", "article-progress"]) {
    const storageKey = `wubi-test:${key}:v1`;
    assert.deepEqual(JSON.parse(restored[storageKey] ?? "null"), payload.data[storageKey] ?? null, storageKey);
  }
}

export async function backupUnreadable({ page }, failure) {
  const payload = await exportRecordedPractice(page);
  const key = "wubi-test:errors:v1";
  if (failure === "damaged") {
    await page.evaluate((key) => localStorage.setItem(key, "{broken"), key);
  } else {
    await storageFault(page, { readKey: key });
  }
  // This used to fake useState slot order. A real upload must reach the preview
  // even when the old data cannot be parsed/read.
  await uploadBackup(page, payload);
  await backupRegion(page).getByText(/错字 原数据无法读取/).waitFor();
  assert(!(await confirmRestore(page).isDisabled()));
  if (failure === "blocked") {
    await confirmRestore(page).click();
    await backupRegion(page).getByText("read denied", { exact: true }).waitFor();
    assert.equal((await savedSessions(page)).length, 1);
    await restoreStorage(page);
  }
  await restoreAndWait(page);
  assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key), payload.data[key]);
}

export async function backupRollback({ page }) {
  const payload = await exportRecordedPractice(page);
  await page.getByRole("checkbox", { name: "显示编码提示" }).uncheck();
  const before = await localSnapshot(page);
  payload.data["wubi-test:sessions:v1"] = [];
  await uploadBackup(page, payload);
  await backupRegion(page).getByText(/练习 -1/).waitFor();
  // settings is written first, then sessions fails. The UI must report failure
  // and storage must restore every original key before a successful retry.
  await storageFault(page, { writeKey: "wubi-test:sessions:v1" });
  await confirmRestore(page).click();
  await backupRegion(page).getByText("本机存储空间不足，恢复未生效", { exact: true }).waitFor();
  await restoreStorage(page);
  assert.deepEqual(await localSnapshot(page), before);
  assert(!(await page.getByRole("checkbox", { name: "显示编码提示" }).isChecked()));
  assert(await confirmRestore(page).isVisible(), "恢复失败后应保留已校验的备份供重试");
  await restoreAndWait(page);
  assert(await page.getByRole("checkbox", { name: "显示编码提示" }).isChecked());
  assert.equal((await savedSessions(page)).length, 0);
}

export async function backupInvalidAndStaleFile({ page }) {
  const payload = await exportRecordedPractice(page);
  const before = await localSnapshot(page);
  await uploadBackup(page, payload);
  await confirmRestore(page).waitFor();
  await uploadBackup(page, "{broken", "invalid.json");
  await confirmRestore(page).waitFor({ state: "hidden" });
  assert.match(await backupRegion(page).getByRole("status").last().textContent(), /JSON|Unexpected|Expected/);
  assert.deepEqual(await localSnapshot(page), before);

  // Hold one file read, select a newer invalid file, then finish the stale read.
  // Only File.text is controlled; React and application request handling run normally.
  await page.evaluate(() => {
    const read = File.prototype.text;
    File.prototype.text = function() {
      if (this.name !== "slow.json") return read.call(this);
      return new Promise((resolve, reject) => {
        window.__releaseBackupFile = () => read.call(this).then(resolve, reject);
      });
    };
  });
  await uploadBackup(page, payload, "slow.json");
  await page.waitForFunction(() => typeof window.__releaseBackupFile === "function");
  assert.equal(await confirmRestore(page).count(), 0);
  await uploadBackup(page, { ...payload, format: "unrelated-app" }, "newer-invalid.json");
  await backupRegion(page).getByText("这不是受支持的五笔测试网站备份", { exact: true }).waitFor();
  await page.evaluate(() => window.__releaseBackupFile());
  // A frame follows promise continuation and React's update opportunity.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await confirmRestore(page).count(), 0, "旧文件读取完成不能重新展示已过期的恢复按钮");
  assert.deepEqual(await localSnapshot(page), before);
}
