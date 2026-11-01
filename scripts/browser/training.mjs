import assert from "node:assert/strict";
import { open, storageFault, restoreStorage, savedSessions } from "./helpers.mjs";

export async function trainingPlanAndReviews({ page }) {
  await open(page, "/");
  // Seed only persisted data, then exercise the real plan/review controls.
  await page.evaluate(() => {
    const dueAt = new Date(Date.now() - 86_400_000).toISOString();
    localStorage.setItem("wubi-test:review-state:v1", JSON.stringify({
      version: 1,
      items: [["character", "五", "gg"], ["character", "笔", "ttfn"], ["phrase", "测试", "iyya"]].map(([targetType, text, code]) => ({
        targetType, targetId: text, text, code, dueAt, createdAt: dueAt,
        intervalDays: 1, level: 0, lastOutcome: null, severity: 3,
        expectedBenefit: 3, correctStreak: 0,
      })),
    }));
  });
  await open(page, "/training");
  const plan = page.locator("#today-training-plan");
  await plan.getByRole("button", { name: "换一组", exact: true }).waitFor();
  const initial = await page.evaluate(() => JSON.parse(localStorage.getItem("wubi-test:training-plan:v1")));
  assert.equal(initial.tasks.length, 3);
  await page.evaluate(() => {
    const plan = JSON.parse(localStorage.getItem("wubi-test:training-plan:v1"));
    plan.date = "2000-01-01";
    localStorage.setItem("wubi-test:training-plan:v1", JSON.stringify(plan));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("wubi-test:training-plan:v1") ?? "null")?.date !== "2000-01-01");
  await plan.getByRole("button", { name: "换一组", exact: true }).waitFor();
  const due = page.locator(".due-review-list li");
  const character = due.filter({ hasText: "“五”" });
  await storageFault(page, { writeKey: "wubi-test:review-state:v1" });
  await character.getByRole("button", { name: "暂缓到明天" }).click();
  await page.getByRole("alert").filter({ hasText: "暂缓状态未能保存" }).waitFor();
  assert.equal(await character.count(), 1);
  await restoreStorage(page);
  await character.getByRole("button", { name: "暂缓到明天" }).click();
  await page.getByText("“五”已暂缓到明天，届时会重新出现。", { exact: true }).waitFor();
  assert.equal(await character.count(), 0);
  const phrase = due.filter({ hasText: "“测试”" });
  await phrase.getByRole("button", { name: "开始复习", exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get("tab"), "phrase");
  await page.getByRole("heading", { name: "到期词组 · 测试", exact: true }).waitFor();
  await page.getByRole("button", { name: "开始专项", exact: true }).click();
  const input = page.getByRole("textbox", { name: "测试的五笔编码", exact: true });
  await input.fill("iyya");
  await input.press("Enter");
  await page.getByRole("tab", { name: "今日计划", exact: true }).waitFor();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("tab"));
  assert.equal(await phrase.count(), 0, "完成到期词组后返回计划，移出今日队列");
  const sessions = await savedSessions(page);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].correctChars, 1);
  await due.filter({ hasText: "“笔”" }).getByRole("button", { name: "开始复习", exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get("tab"), "review");
  await page.getByRole("heading", { name: "到期单字 · 笔", exact: true }).waitFor();
  const reviewTab = page.locator("#training-tab-review");
  await reviewTab.focus();
  await reviewTab.press("ArrowRight");
  await page.locator('[role="tab"][aria-selected="true"]').press("ArrowLeft");
  assert.equal(await page.getByRole("heading", { name: "到期单字 · 笔", exact: true }).count(), 0,
    "键盘切换栏目与点击一样清除上次到期复习目标");
  await page.getByRole("tab", { name: "今日计划", exact: true }).click();
  await due.filter({ hasText: "“笔”" }).getByRole("button", { name: "开始复习", exact: true }).click();
  await page.getByRole("heading", { name: "到期单字 · 笔", exact: true }).waitFor();
  await page.getByRole("button", { name: "开始专项", exact: true }).click();
  const characterInput = page.getByRole("textbox", { name: "笔的五笔编码", exact: true });
  await characterInput.fill("ttfn");
  await characterInput.press("Enter");
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("tab"));
  assert.equal((await savedSessions(page)).length, 2);
  assert.equal(await due.count(), 0);
  await page.locator("#training-task-roots").getByRole("button").click();
  await page.waitForURL((url) => url.searchParams.get("tab") === "roots");
  for (const button of await page.getByRole("tablist", { name: "五码根区" }).getByRole("tab").all()) {
    assert(await button.isDisabled(), "处方字根练习锁定指定分区");
  }
  await page.reload();
  await page.getByRole("button", { name: "开始专项", exact: true }).waitFor();
  assert.equal(await page.getByRole("tab", { name: "五码根专项", exact: true }).getAttribute("aria-selected"), "true");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("wubi-test:training-plan:v1")));
  assert.equal(stored.tasks.find((task) => task.type === "roots").status, "in-progress");
}
