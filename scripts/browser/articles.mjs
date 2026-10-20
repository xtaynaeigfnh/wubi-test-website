import assert from "node:assert/strict";
import { open, fixture, text, typingInput, articleRegion, localSnapshot, storageFault, restoreStorage, alertFrom, chooseArticle, createCustomArticle } from "./helpers.mjs";

export async function articleLibrary({ page }) {
  await open(page, "/");
  await page.getByRole("button", { name: "选文章", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "选择练习文章" });
  await dialog.getByRole("searchbox", { name: "搜索文章标题" }).fill(fixture.title);
  await dialog.getByText("共 1 篇符合当前筛选条件", { exact: true }).waitFor();
  await storageFault(page, { writeKey: "wubi-test:favorite-articles:v1" });
  await dialog.getByRole("button", { name: `收藏文章：${fixture.title}`, exact: true }).click();
  await dialog.getByRole("alert").waitFor();
  assert.match(await dialog.getByRole("alert").textContent(), /收藏.*未能保存/);
  assert.equal(await dialog.getByRole("button", { name: `收藏文章：${fixture.title}`, exact: true }).getAttribute("aria-pressed"), "false");
  await restoreStorage(page);
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


export async function articleSelectionFailure({ page }, failure) {
  await open(page, "/");
  const secondTitle = "切换后的第二篇练习";
  const secondText = "换一篇文章时仍需完整保留原来的练习记录。";
  await createCustomArticle(page, secondTitle, secondText);
  await (await chooseArticle(page, fixture.title)).press("Enter");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await articleRegion(page).textContent(), text);
  // Older installs can have no generated-practice key: rollback must preserve absence.
  await page.evaluate(() => localStorage.removeItem("wubi-test:current-generated-practice:v1"));
  const before = await localSnapshot(page);
  const choice = await chooseArticle(page, secondTitle);
  const key = {
    generated: "wubi-test:current-generated-practice:v1",
    recent: "wubi-test:recent-articles:v1",
    read: "wubi-test:current-generated-practice:v1",
  }[failure];
  await storageFault(page, failure === "quota" ? { quota: true }
    : failure === "read" ? { readKey: key } : { writeKey: key });
  await alertFrom(page, () => choice.click(), /文章选择未能保存，原练习保持不变/);
  assert.equal(await articleRegion(page).textContent(), text);
  assert.equal(await typingInput(page).inputValue(), "");
  assert(await page.getByRole("dialog", { name: "选择练习文章" }).isVisible());
  await restoreStorage(page);
  assert.deepEqual(await localSnapshot(page), before, "失败不能留下部分写入或清除原来的选择");
  await choice.click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await articleRegion(page).textContent(), secondText);
  assert.equal(await typingInput(page).inputValue(), "");
  await page.reload({ waitUntil: "networkidle" });
  await typingInput(page).waitFor();
  assert.equal(await articleRegion(page).textContent(), secondText, "成功选择应在重新打开时恢复");
}

export async function articleRestartFailure({ page }) {
  await open(page, "/");
  const input = typingInput(page);
  await input.fill(text.slice(0, 3));
  await page.evaluate(() => localStorage.removeItem("wubi-test:current-generated-practice:v1"));
  const before = await localSnapshot(page);
  const progress = await page.getByRole("progressbar", { name: "文章输入进度" }).getAttribute("aria-valuenow");
  await storageFault(page, { writeKey: "wubi-test:current-generated-practice:v1" });
  await alertFrom(page, () => page.getByRole("button", { name: "重来", exact: true }).click(), /文章选择未能保存/);
  assert.equal(await input.inputValue(), text.slice(0, 3));
  assert.equal(await page.getByRole("progressbar", { name: "文章输入进度" }).getAttribute("aria-valuenow"), progress);
  assert(!(await page.getByRole("button", { name: "暂停", exact: true }).isDisabled()));
  assert(await page.getByRole("button", { name: "选文章", exact: true }).isDisabled());
  await restoreStorage(page);
  assert.deepEqual(await localSnapshot(page), before);
  await page.getByRole("button", { name: "重来", exact: true }).click();
  assert.equal(await input.inputValue(), "");
  assert(await page.getByRole("button", { name: "暂停", exact: true }).isDisabled());
}

export async function commonArticleRestore({ page }) {
  await open(page, "/");
  await typingInput(page).waitFor();
  await page.evaluate(() => localStorage.setItem("wubi-test:recent-articles:v1", '[ "previous" ]'));
  await page.getByRole("button", { name: "常用字练习", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "选择常用字范围" });
  const choice = dialog.getByRole("button").filter({ hasText: "01–050" });
  await storageFault(page, { writeKey: "wubi-test:current-generated-practice:v1" });
  await alertFrom(page, () => choice.click(), /文章选择未能保存/);
  assert(await dialog.isVisible(), "常用字选择失败不能关闭弹窗");
  assert.equal(await articleRegion(page).textContent(), text);
  await restoreStorage(page);
  await choice.click();
  await dialog.waitFor({ state: "hidden" });
  const generated = await page.evaluate(() => JSON.parse(localStorage.getItem("wubi-test:current-generated-practice:v1")));
  assert.equal(generated.kind, "common");
  assert.equal(await articleRegion(page).textContent(), generated.text);
  assert.equal(await page.evaluate(() => localStorage.getItem("wubi-test:recent-articles:v1")), '[ "previous" ]');
  await page.reload({ waitUntil: "networkidle" });
  await typingInput(page).waitFor();
  assert.equal(await articleRegion(page).textContent(), generated.text);
  await open(page, "/?onboarding=1&step=0");
  await typingInput(page).waitFor();
  assert.notEqual(await articleRegion(page).textContent(), generated.text, "首次引导应选短文，不能恢复常用字练习");
  const selected = await page.evaluate(() => JSON.parse(localStorage.getItem("wubi-test:current-article:v1")));
  const response = await page.request.get(`${new URL(page.url()).origin}${process.env.BROWSER_BASE_PATH ?? ""}/data/articles-index.json`);
  const index = await response.json();
  assert(index.some((article) => article.id === selected && article.length === "short"));
}

export async function customArticleRollback({ page }) {
  await open(page, "/");
  await typingInput(page).waitFor();
  const before = await localSnapshot(page);
  await page.getByRole("button", { name: /^(粘贴自己的文字|自定义文章)$/ }).click();
  const dialog = page.getByRole("dialog", { name: "粘贴自定义文本" });
  await dialog.getByRole("textbox", { name: "标题", exact: true }).fill("写入失败后重试的自定义文章");
  await dialog.getByRole("textbox", { name: "正文", exact: true }).fill("自定义文章保存成功后才可以替换当前练习。");
  await storageFault(page, { writeKey: "wubi-test:current-article:v1" });
  await alertFrom(page, () => dialog.getByRole("button", { name: "开始练习", exact: true }).click(), /文章选择未能保存/);
  assert(await dialog.isVisible());
  assert.equal(await articleRegion(page).textContent(), text);
  await restoreStorage(page);
  assert.deepEqual(await localSnapshot(page), before, "选择失败必须回滚刚创建的自定义文章");
  await dialog.getByRole("button", { name: "开始练习", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await articleRegion(page).textContent(), "自定义文章保存成功后才可以替换当前练习。");
  const custom = await page.evaluate(() => JSON.parse(localStorage.getItem("wubi-test:custom-texts:v1")));
  assert.equal(custom.filter((article) => article.title === "写入失败后重试的自定义文章").length, 1);
}
