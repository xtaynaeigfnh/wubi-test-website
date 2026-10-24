import assert from "node:assert/strict";
import { open, basePath, output, fixture, text, typingInput, articleRegion, savedSessions, storageFault, restoreStorage, alertFrom, createCustomArticle } from "./helpers.mjs";

export async function typingRecovery({ page, context }) {
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
  await storageFault(page, { writeKey: "wubi-test:sessions:v1" });
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
  const review = page.getByRole("region", { name: "输入内容复盘", exact: true });
  await review.waitFor();
  assert(await review.evaluate((node) => node === document.activeElement), "结算后焦点进入输入复盘");
  assert.equal(await articleRegion(page).textContent(), text, "结算保留原文");
  assert.equal(await typingInput(page).count(), 0, "结算后只保留复盘，不重复挂载输入区");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("wubi-test:sessions:v1") ?? "[]").length), 0);
  const pendingDialog = page.waitForEvent("dialog");
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("link", { name: "成绩统计", exact: true }).click();
  assert.equal((await pendingDialog).type(), "alert");
  assert.equal(new URL(page.url()).pathname, `${basePath}/`, "未保存成绩应阻止导航");
  assert.equal(await page.getByText("本次成绩已存入本机 · 可在成绩统计查看").count(), 0);
  assert(await page.getByRole("button", { name: "再练一次", exact: true }).isDisabled());
  await alertFrom(page, () => page.getByRole("button", { name: "重试保存", exact: true }).click(), /仍未能保存/);
  assert.equal((await savedSessions(page)).length, 0);
  await alertFrom(page, () => page.getByRole("button", { name: "重来", exact: true }).click(), /尚未保存/);
  assert.equal((await savedSessions(page)).length, 0);
  await restoreStorage(page);
  await page.getByRole("button", { name: "重试保存" }).click();
  await page.getByText("本次成绩已存入本机 · 可在成绩统计查看").waitFor();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("wubi-test:sessions:v1") ?? "[]").length === 1);
  await history.getByText(fixture.title, { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("wubi-test:sessions:v1"))[0].correctChars), Array.from(text).length);
  assert(!(await page.getByRole("button", { name: "再练一次", exact: true }).isDisabled()));
  await page.getByRole("link", { name: "成绩统计", exact: true }).click();
  await page.waitForURL((url) => url.pathname.replace(/\/$/, "") === `${basePath}/history`);
}

export async function typingSessionLifecycle({ page }) {
  await open(page, "/");
  const input = page.getByRole("textbox", { name: "跟打输入区" });
  await input.waitFor();
  const speedColors = () => page.locator(".metric.primary-metric").evaluate((element) => {
    const root = document.documentElement;
    const originalTheme = root.dataset.theme;
    const colors = {};
    for (const theme of ["light", "dark", "system", "bamboo", "qingdai", "custom"]) {
      root.dataset.theme = theme;
      const style = getComputedStyle(element);
      colors[theme] = { background: style.backgroundColor, color: style.color };
    }
    if (originalTheme === undefined) delete root.dataset.theme;
    else root.dataset.theme = originalTheme;
    return colors;
  });
  const idleSpeedColors = await speedColors();
  // Drive the real Hook/React events with a deterministic wall clock. Interval
  // callbacks still run normally; assertions use the persisted result.
  await page.evaluate(() => {
    window.__typingTestNow = Date.now();
    Date.now = () => window.__typingTestNow;
  });
  const advance = (ms) => page.evaluate((delta) => { window.__typingTestNow += delta; }, ms);
  const visibility = (hidden) => page.evaluate((value) => {
    Object.defineProperty(document, "hidden", { configurable: true, value });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
  await input.press("w");
  await advance(1000);
  await input.fill("错");
  assert.deepEqual(await speedColors(), idleSpeedColors, "开始输入后速度卡片不能变成浅底白字");
  await page.locator(".metric.primary-metric").screenshot({ path: `${output}/speed-active.png` });
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  assert(await input.isDisabled());
  await page.getByRole("button", { name: "重来", exact: true }).click();
  assert.equal(await input.inputValue(), "", "重来应清除之前的输入");
  assert(!(await input.isDisabled()), "重来应解除暂停");
  assert(await page.getByRole("button", { name: "暂停", exact: true }).isDisabled(), "重来后尚未开始计时");

  await input.press("w");
  await advance(1000);
  await input.fill("五");
  await advance(1000);
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await advance(1000);
  await visibility(true);
  await advance(30000);
  await visibility(false);
  await advance(7000);
  assert(await input.isDisabled());
  await page.getByRole("button", { name: "继续", exact: true }).click();
  assert.equal(await input.inputValue(), "五", "恢复后应保留暂停前的输入");
  await advance(1000);
  await visibility(true);
  await advance(20000);
  await visibility(false);
  await advance(1000);
  await input.fill(text);
  await page.getByText("本次成绩已存入本机 · 可在成绩统计查看").waitFor();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("wubi-test:sessions:v1")));
  assert.equal(saved.length, 1, "重来的未完成练习不能写入成绩");
  assert.equal(saved[0].durationSeconds, 4, "暂停与后台时间不能进入有效用时");
  assert.equal(saved[0].pauseSeconds, 38);
  assert.equal(saved[0].pauseCount, 1);
  assert.equal(saved[0].retryCount, 1);
  assert.equal(saved[0].errors, 1, "只记录重来后的按键临时错字");
  assert.equal(saved[0].keyCount, 1, "重来前的按键应被清空");
  await advance(10000);
  await page.waitForTimeout(300);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("wubi-test:sessions:v1"))), saved,
    "结算后的时钟更新不能重复保存或改变成绩");
}


// Browser-dispatched IME events approximate the two browser event orders. They
// deliberately exercise React's real handlers; native OS candidate UIs still
// require the manual smoke test documented in README.
export async function typingIme({ page }, order) {
  await open(page, "/");
  const input = typingInput(page);
  await input.waitFor();
  await input.evaluate((el) => {
    el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setValue.call(el, "wubi");
    el.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true, data: "wubi", inputType: "insertCompositionText" }));
  });
  assert.equal(await input.inputValue(), "wubi");
  assert.equal(await page.getByRole("progressbar", { name: "文章输入进度" }).getAttribute("aria-valuenow"), "0");
  assert.equal((await savedSessions(page)).length, 0);
  await input.evaluate((el, { order, committed }) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    if (order === "commit-before-end") {
      setValue.call(el, committed);
      el.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true, data: committed, inputType: "insertCompositionText" }));
      el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: committed }));
    } else {
      el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: committed }));
      setValue.call(el, committed);
    }
    // Duplicate final input in the same React batch must be idempotent.
    for (let i = 0; i < 2; i++) {
      el.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: false, data: committed, inputType: "insertText" }));
    }
  }, { order, committed: text });
  await page.getByText("本次成绩已存入本机 · 可在成绩统计查看").waitFor();
  assert.equal(await page.getByRole("progressbar", { name: "文章输入进度" }).getAttribute("aria-valuenow"), "100");
  const results = await savedSessions(page);
  assert.equal(results.length, 1);
  assert.equal(results[0].correctChars, Array.from(text).length);
  assert.equal(results[0].errors, 0);
  assert.equal(results[0].accuracy, 100);
  assert.equal(results[0].correctionCount, 0);
}

export async function typingUnicodeAndCorrection({ page }) {
  await open(page, "/");
  const body = "𠮷中\n国五笔输入练习需要稳定节奏。";
  await createCustomArticle(page, "Unicode段落练习", body);
  const input = typingInput(page);
  const article = articleRegion(page);
  await input.fill("𠮷错");
  assert.equal(await input.inputValue(), "𠮷错");
  // These classes express the product's visible correct/wrong/current states;
  // the test does not depend on which component or Hook renders them.
  assert.equal(await article.locator(".wrong").textContent(), "中");
  assert.equal(await article.locator(".current").textContent(), "国");
  await input.fill("𠮷中");
  assert.equal(await article.locator(".wrong").count(), 0);
  assert.equal(await article.locator(".correct").count(), 2);
  assert.equal(await article.textContent(), body);
  await input.fill("𠮷");
  assert.equal(await article.locator(".current").textContent(), "中");
  await input.fill(body.replace(/\n/g, ""));
  await page.getByText("本次成绩已存入本机 · 可在成绩统计查看").waitFor();
  const [saved] = await savedSessions(page);
  assert.equal(saved.correctChars, Array.from(body.replace(/\n/g, "")).length);
  assert.equal(saved.errors, 1);
  assert.deepEqual(saved.errorChars, ["中"]);
  assert.equal(saved.correctionCount, 2);
  assert(saved.heatmap && saved.rhythmSummary, "完整交互必须保留卡顿与节奏复盘数据");
  assert.equal(await article.locator(".current").count(), 0);
  assert.equal(await article.textContent(), body);
  await page.getByRole("button", { name: "再练一次", exact: true }).click();
  assert.equal(await input.inputValue(), "");
  assert.equal(await article.locator(".current").textContent(), "𠮷");
}

export async function typingPasteAndDrop({ page }) {
  await open(page, "/");
  const input = typingInput(page);
  await input.waitFor();
  const canceled = await input.evaluate((el) => {
    const events = [
      new Event("paste", { bubbles: true, cancelable: true }),
      new Event("drop", { bubbles: true, cancelable: true }),
    ];
    return events.map((event) => { el.dispatchEvent(event); return event.defaultPrevented; });
  });
  assert.deepEqual(canceled, [true, true], "粘贴与拖入必须在真实DOM事件上被阻止");
  assert.equal(await input.inputValue(), "");
  assert.equal((await savedSessions(page)).length, 0);
  assert(await page.getByRole("button", { name: "暂停", exact: true }).isDisabled());
}
